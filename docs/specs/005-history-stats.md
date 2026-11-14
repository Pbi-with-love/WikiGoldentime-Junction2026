# Spec 005: Edit-history statistics (history_stats, month_stats)

Read docs/memory/ARCHITECTURE.md first (Infrastructure: SSH command, container names, no host
`mariadb` client, `~/wikimemory/.venv`, tmux rules, "never touch the organizers' apps"; Rules: the
revert / dispute / edit-war month definitions; Reuse: `history.py`).

Depends on: spec 002 (wikihistory on the 3307 server). Works only against `wikihistory` on 3307.

## Goal
Precompute per-article and per-month edit statistics from `wikihistory.article FOR SYSTEM_TIME ALL`
into three small tables on 3307, so `/api/stars` and `/api/timeline` (a later API spec) read them
with one indexed query instead of scanning history per request. Built on the 50 articles now; rerun
unchanged after the full dataset M load.

## Definitions (from ARCHITECTURE "Rules"; do not redefine)
- version = one row of `wikihistory.article FOR SYSTEM_TIME ALL`.
- revert = the organizers' `is_revert` (sha1 equals an earlier version's sha1 but not the previous one's).
- dispute = a revert that did not undo an anonymous editor = the organizers' `undid_anonymous` is false
  (anonymous = IPv4, IPv6 or "~2026-..." temporary account).
- edit-war month = a (page, month) with disputes >= 3.
- month = `DATE_FORMAT(row_start, '%Y-%m')` with `SET time_zone = '+00:00'` (UTC), stored as `CHAR(7)` `YYYY-MM`.

## Acceptance criteria
- [ ] `backend/history.py` and `backend/svt_common.py` are byte-for-byte copies of
      `~/mariadb-system-versioning-wikipedia/history.py` and `common.py`, with the organizers' MIT
      header kept (add one if the file lacks it: copyright line from their LICENSE). The only allowed
      change is the import of `common` -> `svt_common` and the DB port/host via the existing env/config
      mechanism (no logic edits). If `backend/history.py` already exists (another spec copied it), reuse
      it and do not overwrite it.
- [ ] `scripts/history_stats.py` computes reverts/disputes by calling the organizers' `versions()`
      (which yields `is_revert` / `undid_anonymous`) per `page_id`. It does not reimplement revert or
      anonymity detection. The only new logic is grouping by month and summing.
- [ ] Tables in `wikihistory` on 3307 (pre-approved schema; `page_id` type copied from
      `SHOW CREATE TABLE wikihistory.article`; counts `INT UNSIGNED NOT NULL`):
      - `history_stats(page_id PK, first_edit DATETIME NOT NULL /* UTC, MIN(row_start) */, versions, reverts, disputes, war_months)`
      - `month_stats(page_id, month CHAR(7), edits, reverts, disputes, PRIMARY KEY (page_id, month))`
        — sparse: only months with >= 1 edit (the API fills zero months).
      - `global_month_stats(month CHAR(7) PK, edits, reverts, disputes)` — sum of `month_stats` over
        all pages; this is the source of the global histogram for `GET /api/timeline`.
- [ ] Consistency (script asserts before swapping; SQL re-checks after):
      - `SUM(history_stats.versions)` = `SUM(month_stats.edits)` = `SUM(global_month_stats.edits)` =
        `SELECT COUNT(*) FROM wikihistory.article FOR SYSTEM_TIME ALL` (31,848 now).
      - `COUNT(history_stats)` = `COUNT(DISTINCT page_id) FROM article FOR SYSTEM_TIME ALL` (50 now).
      - per page: `versions`, `reverts`, `disputes` = sums of its `month_stats`; `war_months` =
        `COUNT(*) FROM month_stats WHERE page_id = p AND disputes >= 3`; `disputes <= reverts < versions`.
- [ ] Cross-check vs the organizers (50-article set):
      - Talvisota (page_id 1256): `reverts = 328` and `reverts - disputes = 240` (README: "328 reverts,
        240 undo an anonymous editor"), i.e. `disputes = 88`; `versions = 2143`.
      - Suomen sisällissota (1150): `versions = 3357`.
      - Per-year sums of `global_month_stats.edits` equal `ANNUAL_VERSIONS_CALIBRATION` in
        `src/mock/fixtures.js` (2003: 16 ... 2026: 605; total 31,848).
      - Compare Talvisota's numbers with what the organizers' time machine shows on :8001 (curl its
        page/endpoint for 1256, read-only). Any mismatch: report both values and the reason; do not
        "fix" by changing the definitions.
- [ ] Idempotent swap: build into `history_stats_new`, `month_stats_new`, `global_month_stats_new`
      (drop leftovers of those three first), then one atomic
      `RENAME TABLE history_stats TO history_stats_old, history_stats_new TO history_stats, month_stats TO month_stats_old, ...`
      and `DROP TABLE` the `_old` ones (first run: plain rename of the `_new` tables). Readers never
      see a missing or half-built table. Running the script twice gives identical tables
      (`CHECKSUM TABLE` equal).
- [ ] Memory-safe streaming: page ids come from
      `SELECT DISTINCT page_id FROM article FOR SYSTEM_TIME ALL ORDER BY page_id`; one page's versions
      in memory at a time; `month_stats_new` rows inserted with `executemany` per page, commit every
      100 pages; progress line every 100 pages (pages done / total, versions/s, elapsed). Peak RSS
      < 1 GB on the 50 (measured with `/usr/bin/time -v`). If the organizers' `versions()` loads the
      full `text` of every version and a single big page would break this budget at full M, report it
      and ask first rather than editing `versions()`.
- [ ] The read queries the API will use, each measured on 3307 (target < 50 ms):
      `SELECT * FROM wikihistory.history_stats WHERE page_id = 1256`,
      `SELECT month, edits, reverts, disputes FROM wikihistory.month_stats WHERE page_id = 1256 ORDER BY month`,
      `SELECT month, edits, reverts, disputes FROM wikihistory.global_month_stats ORDER BY month`.
- [ ] Unit test `scripts/test_history_stats.py` (stdlib `unittest`, no new dependency) on the
      month-grouping/summing function with synthetic version rows in the exact shape `versions()`
      returns: no revert; revert to the previous sha1 is not a revert (comes from `is_revert`);
      revert undoing an IP / IPv6 / `~2026-` editor = revert, not dispute; revert undoing a named user
      = dispute; 3 disputes in one month = 1 war month, 2 = 0; two edits either side of a UTC month
      boundary land in different months; totals equal the sums. The test drives the organizers'
      `versions()` logic (feed rows through it, or mock only its DB cursor), not a copy of it.
- [ ] Full-M rerun documented in the script header: after the full M load into 3308, first rerun
      the 002 merge, then
      `tmux new -d -s hstats 'cd ~/wikimemory && nice -n 10 /usr/bin/time -v .venv/bin/python scripts/history_stats.py > hstats.log 2>&1'`.

## Assumptions
- Connect to 127.0.0.1:3307 as `wikihistory`/`wikihistory`, db `wikihistory` (spec 002 grants), using
  the organizers' own connect() from `svt_common.py` with only the port changed through its
  env/config (read how `common.py` picks host/port; if it is hard-coded, pass a port override from the
  script without editing logic). Every session runs `SET time_zone = '+00:00'`.
- The organizers' `versions()` iterates one page's versions in time order with per-row flags
  `is_revert` and `undid_anonymous`. The worker reads `history.py` first and adapts the call to its
  real signature; if it does not expose these flags per version, stop and ask.
- These are plain tables (no system versioning). The 002 merge only replaces `article`/`article_list`,
  so it does not drop them.
- Python env: `~/wikimemory/.venv` (create with `python3 -m venv` if missing); install only the DB
  driver the organizers' `common.py` imports (and nothing else unless `history.py` imports it).
  Never use or modify the organizers' venvs.
- VPS layout: `~/wikimemory/backend/` and `~/wikimemory/scripts/`; the script adds the repo root to
  `sys.path` so `from backend import history` works both locally and on the VPS.

## Scope
- May edit: `scripts/history_stats.py` (new), `scripts/test_history_stats.py` (new),
  `backend/history.py` and `backend/svt_common.py` (new copies only, see criteria),
  `scripts/requirements.txt` (append the DB driver pin only if missing).
- On the VPS may create: files under `~/wikimemory/`, tables `wikihistory.history_stats`,
  `month_stats`, `global_month_stats` (and their transient `_new`/`_old`) on 3307.
- Must not touch: `src/` (frontend stays on mock; the API is a later spec), `index.html`,
  `docs/memory/*`, other specs, `wikihistory.article`/`article_list`, any `wikirag` table, the 3308
  container and its data, the organizers' repos/venvs, tmux sessions `app` and `tm`.

## Boundaries
- Always: run the unit test and the script's self-checks before reporting; `SET time_zone='+00:00'`
  in every SVT query; follow docs/memory/CONVENTIONS.md.
- Reuse the organizers' code (versions, is_revert, undid_anonymous); never rewrite it.
- Precompute: no whole-history query at request time; these tables are the only source for stats.
- Ask first (via `orca orchestration ask`): edits to the copied organizer code beyond the import/port,
  schema beyond the three tables, new dependencies, anything that pushes the VPS into swap while
  `app`/`tm` serve.
- Never: commit secrets; stop or restart containers or the `app`/`tm` sessions; `DROP DATABASE`;
  write to 3308; delete failing tests.

## Open questions (defaults chosen)
- Does the organizers' `undid_anonymous` treat "~2026-..." temporary accounts as anonymous, as
  ARCHITECTURE says? Default: use their function as-is and report what it does; if it differs, report
  the Talvisota numbers both ways and ask.
- Global histogram: precomputed table `global_month_stats` (default; ~280 rows, trivially fast) vs a
  `GROUP BY` over `month_stats` per request. Chosen: table, so it stays fast at full M. The
  orchestrator should add `global_month_stats` to ARCHITECTURE "New tables".
- month_stats sparse vs contiguous months: sparse (default); `/api/timeline/{page_id}` fills zeros.
- Pages that exist only in history (deleted now) are included (`FOR SYSTEM_TIME ALL`); their stars
  may not exist in `wikirag`. Default: keep them; the API joins on `wikirag.article`.

## Approach (Hydrogen)
1. On the VPS: read `~/mariadb-system-versioning-wikipedia/{history.py,common.py,README*,LICENSE,app.py}`
   (app.py's month-timeline code shows how the time machine counts); `SHOW CREATE TABLE
   wikihistory.article` on 3307; record the 3308/:8001 numbers for Talvisota.
2. Copy `history.py`/`common.py` into `backend/`; write the script and the unit test.
3. `scp` to `~/wikimemory/`; run the unit test; run the script (on the 50 a foreground run is fine;
   use tmux for full M); run the SQL checks; run the script a second time and compare checksums.

## Commands
- SSH: `ssh -i ~/.ssh/id_serverTech -o IdentitiesOnly=yes root@72.61.20.120`
- Copy: `scp -i ~/.ssh/id_serverTech -o IdentitiesOnly=yes -r backend scripts root@72.61.20.120:~/wikimemory/`
- Unit test: `ssh ... 'cd ~/wikimemory && .venv/bin/python -m unittest scripts/test_history_stats.py -v'`
- Run: `ssh ... 'cd ~/wikimemory && nice -n 10 /usr/bin/time -v .venv/bin/python scripts/history_stats.py > hstats.log 2>&1; echo exit=$?; tail -30 hstats.log'`
  (full M: the tmux command in the criteria).
- SQL checks (on the VPS):
  `docker exec mariadb-vector-wikipedia-rag-mariadb-1 mariadb -uwikihistory -pwikihistory wikihistory -e "SET time_zone='+00:00'; SELECT COUNT(*), SUM(versions), SUM(reverts), SUM(disputes), SUM(war_months) FROM history_stats; SELECT COUNT(*), SUM(edits) FROM month_stats; SELECT COUNT(*), SUM(edits) FROM global_month_stats; SELECT COUNT(*) FROM article FOR SYSTEM_TIME ALL; SELECT LEFT(month,4) y, SUM(edits) FROM global_month_stats GROUP BY y; SELECT * FROM history_stats WHERE page_id IN (1256,1150,440); SELECT * FROM month_stats WHERE page_id=1256 AND disputes>=3; CHECKSUM TABLE history_stats, month_stats, global_month_stats;"`
- Timing: `time docker exec ... -e "<each of the 3 read queries>"` (report the query time, not docker
  startup; `SET profiling=1; ...; SHOW PROFILES;` is fine).

## Evidence required in worker_done
One consolidated report:
- Files changed; `diff` of `backend/history.py`/`svt_common.py` vs the organizers' originals (import/port lines only).
- Unit test output (tests run / passed).
- Script exit code, `hstats.log` tail (self-checks, progress), wall time and max RSS from `/usr/bin/time -v`.
- SQL check output: row counts of all three tables, the version-sum equality (31,848), per-year sums
  vs `ANNUAL_VERSIONS_CALIBRATION`, rows for 1256/1150/440, Talvisota war months.
- Talvisota side by side: ours vs README (328 / 240) vs the :8001 time machine.
- Measured time of the 3 read queries.
- `CHECKSUM TABLE` from two consecutive runs (equal).
- HTTP codes of :8000 and :8001 after the run.
- Open issues / assumptions (incl. the temporary-account answer and the full-M extrapolated runtime).

## Failure semantics
Unit test failure, non-zero script exit, a version-sum mismatch, or Talvisota reverts != 328 without
an explained cause = Task failed (not a deliverable).
