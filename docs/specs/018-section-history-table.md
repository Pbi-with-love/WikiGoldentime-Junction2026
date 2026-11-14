# Spec 018: Precomputed section history + ghost sections table

Read docs/memory/ARCHITECTURE.md first (Infrastructure: SSH flags, Docker-only `mariadb` client,
tmux, 127.0.0.1 binding; Rules: SVT `time_zone`, precompute heavy aggregates, LLM rules).
Also read spec 009 (criterion 7: section history + ghost rules), spec 016 incl. **Amendment A**
(`history_status`, `fi_history`), spec 005 (precompute pattern) and `scripts/history_stats.py`.

**Depends on: spec 016 merged into `main`** (both edit `backend/summary.py`). Spec 017 runs before
this one. Must not run in parallel with 016 or 017 implementation or any other spec that edits
`backend/summary.py` or `backend/tests/test_summary.py`. Non-UI spec: **no Argon step**.

## Goal
User decision 2026-11-14: section history and ghost sections come from SVT and need no LLM, so they
must not depend on any summary cache. Precompute them once for **all** Finnish articles into
`wikihistory.section_history` (no LLM); `/api/summary` reads that table with one indexed SELECT.
The live SVT computation stays only as the fallback for a missing or stale row.


**Amendment 018-A (orchestrator, after 016 merged as 48458e8):** 016 added a fallback table `wikirag.history_cache (lang, page_id, rev_id, json, created_at)` for background-built history (0 rows at merge). 018 must absorb it: either make `section_history` the single store and drop the `history_cache` code path (migration drops the table if empty; report its row count first), or justify keeping both. Read the merged 016 code (`history_status`, `fi_history`) before designing the read path. Run `node scripts/export_i18n_review.mjs > docs/i18n-review.csv` is NOT your job (orchestrator does it).

## Definitions (use these names in code, tests and logs)
- **section history result** (for one fi article): exactly what `/api/summary` needs today, as one
  JSON object, keys in this order:
  ```json
  {"sections": [{"no": 1, "heading": "Tausta",
                 "history": {"added_year": 2003, "changes": 14, "war_years": [2007]}}],
   "ghost_sections": [{"after_no": 5, "heading": "…", "from_year": 2007, "removed_year": 2015,
                       "text": "…", "oldid": 9876543}]}
  ```
  `sections` = one entry per kept current section (`split_markdown_sections` of the wikirag fi text,
  numbered `no` 1..n), `history` = `history_by_no[no]` from `compute_history_and_ghosts` (field set
  and key order exactly as `summary.py` builds them: `added_year`, `changes`, `war_years`);
  `ghost_sections` = its ghost list verbatim (`after_no`, `heading`, `from_year`, `removed_year`,
  `text`, `oldid`). A **short** article (009 rule: words < 1500 or kept sections < 4) has
  `{"sections": [], "ghost_sections": []}` and needs no SVT snapshot queries.
- **history page**: a page_id with a current row in `wikihistory.article` AND a row in
  `wikirag.article` with `lang='fi'`. Only these can be served by `/api/summary/fi/...` with history.
- **fresh row**: `section_history` row with `rev_id = wikirag.article.rev_id` (fi),
  `svt_rev_id = wikihistory.article.rev_id` (current) and `end_year >= YEAR(UTC_TIMESTAMP())`.
  Anything else is **stale** (treated exactly like a missing row).
- **old SVT path**: `summary._fetch_svt_history_and_ghosts(...)` as it is today (unchanged).

## Decisions (made here; report disagreement as a `question`, do not change)
1. **Table lives in `wikihistory` on 3307.** It is derived from SVT data like `history_stats` /
   `month_stats` (spec 005), and freshness needs a PK join with `wikihistory.article` (current row)
   in the same SELECT. The backend's `wikirag` user already has `ALL PRIVILEGES ON wikihistory.*`
   (ARCHITECTURE; verify with `SHOW GRANTS FOR 'wikirag'@'%'` and report), so the request path runs
   the read on the connection it already has open.
2. **One row per page, JSON column**, PK `page_id`; `rev_id`/`svt_rev_id`/`end_year` are checked in
   the read query. A new revision makes the row stale; the rebuild overwrites it (no old rows pile
   up). One row = one PK read, no reassembly; the JSON has the response shape, so serving is a
   `json.loads`.
   ```sql
   CREATE TABLE IF NOT EXISTS wikihistory.section_history (
     page_id INT UNSIGNED NOT NULL,
     rev_id BIGINT UNSIGNED NOT NULL,      -- wikirag.article.rev_id (fi) the sections come from
     svt_rev_id BIGINT UNSIGNED NOT NULL,  -- wikihistory.article current rev_id (last snapshot)
     end_year SMALLINT UNSIGNED NOT NULL,  -- current_year used by compute_history_and_ghosts
     sections SMALLINT UNSIGNED NOT NULL,  -- len(json.sections)
     ghosts TINYINT UNSIGNED NOT NULL,     -- len(json.ghost_sections)
     json LONGTEXT NOT NULL,               -- section history result
     build_ms INT UNSIGNED NOT NULL,
     built_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
     PRIMARY KEY (page_id)
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci
   ```
   The DDL is a constant `SECTION_HISTORY_DDL` in `backend/summary.py`; `ensure_section_history_table()`
   (same pattern as `ensure_cache_table`) is called by the build script and the background build,
   never per request. Writes: `INSERT ... ON DUPLICATE KEY UPDATE` (all columns). JSON serialized
   with `json.dumps(obj, separators=(",", ":"), ensure_ascii=False)`.
3. **Read query (request path), one indexed SELECT:**
   ```sql
   SELECT a.rev_id, h.json
   FROM wikihistory.article a
   LEFT JOIN wikihistory.section_history h
     ON h.page_id = a.page_id AND h.rev_id = ? AND h.svt_rev_id = a.rev_id
    AND h.end_year >= YEAR(UTC_TIMESTAMP())
   WHERE a.page_id = ?
   ```
   (params: wikirag fi `rev_id`, `page_id`). No row -> no history (`has_history` false, status
   `none`). Row with `h.json` NULL -> missing/stale. Row with JSON -> fresh. Report `EXPLAIN` (both
   tables accessed by PK/const). A missing table (`ProgrammingError`) counts as missing/stale.
4. **Reuse, never copy.** New in `backend/summary.py`:
   - `compute_section_history(article_row, svt_cur, svt_row) -> dict` (the section history result):
     `split_markdown_sections` + the short rule + `_fetch_svt_history_and_ghosts`. Extract the short
     rule into one helper used by both this and `build_summary_payload` (no duplicated condition).
   - `read_section_history(cur, page_id, rev_id) -> (has_history: bool, result: dict | None)`
     (Decision 3).
   - `build_section_history_row(page_id) -> dict` (opens its own connections, computes, upserts,
     returns the result; used by the script, the background job and the fallback).
   - `history_by_no(result) -> dict[int, dict]` to feed `build_summary_payload(precomputed_history=...)`.
   The build script imports these; `history.clean()` / `history.as_of()` are only reached through the
   old SVT path. `backend/history.py` is not edited.
5. **Pace.** The build is one sequential process (one SVT connection, one rag connection),
   `nice -n 19`, `--sleep 0.1` s after each page by default, commit every 50 pages, order
   `ORDER BY CRC32(page_id)` (deterministic, not biased to old low page_ids, so the first 50 pages are
   a fair sample). No `docker update` of the 3307 container (it would slow the API too).
6. **Go/no-go.** Run `--limit 50` first; the script prints `estimate: <sec/page mean, p95> -> <h>
   for <todo> pages`. If the estimate is <= 8 h, start the full run without asking; otherwise send a
   `question` with the numbers and a proposed `--sleep`.

## Acceptance criteria

### A. Backend (`backend/summary.py`, after 016)
- [ ] **A1. Default request (`ui` absent or `== lang`), fi, cache miss:** use `read_section_history`
      instead of `history.rows(SVT_CURRENT_ROW_SQL)` + the old SVT path. Fresh -> pass
      `precomputed_history=(history_by_no(result), result["ghost_sections"])`; no SVT snapshot query.
      Missing/stale -> today's behaviour (old SVT path, synchronous) and upsert the row from that
      computed result. The response body stays **byte-identical** to before (016 A6 still passes).
- [ ] **A2. `build_and_cache_llm_summary`** (default build, fi): history comes from the table
      (fresh) or from `build_section_history_row` (missing/stale). A default `summary_cache` row for a
      page with history is never written without its history.
- [ ] **A3. 016 variants:** every place where post-016 code obtains section history / ghosts (the
      `fi_history` block, the `history_status` decision, the background history-only build, any
      `_fetch_svt_history_and_ghosts` call in a request or job) goes through `read_section_history` /
      `build_section_history_row`. `history_status`:
      - `"ready"`: fresh row (fi_history = table `sections` + `ghost_sections`; 016's rule "null when
        no section history and no ghosts" stays);
      - `"none"`: no fi sibling, or the fi sibling has no `wikihistory.article` row;
      - `"building"`: only when the row is missing/stale; schedule ONE background
        `build_section_history_row(page_id)` (dedup with an in-flight set like `_inflight_jobs`), no
        SVT query in the handler. The next request after the job is `"ready"`.
      `history_status` appears only where 016 put it; no new response fields.
- [ ] **A4. No SVT snapshot query (`FOR SYSTEM_TIME`) in any request handler when the row is fresh**
      (test asserts `_fetch_svt_history_and_ghosts` / `history.as_of` are not called).

### B. Build script (`scripts/section_history.py`, new; same style as `scripts/history_stats.py`)
- [ ] **B1.** Connects to 3307 only (refuse 3308 like `history_stats.connect_db`); `SET time_zone =
      '+00:00'`; `ensure_section_history_table()`.
- [ ] **B2. Todo list (resumable):** history pages without a fresh row:
      ```sql
      SELECT a.page_id FROM wikihistory.article a
      JOIN wikirag.article r ON r.lang = 'fi' AND r.page_id = a.page_id
      LEFT JOIN wikihistory.section_history h
        ON h.page_id = a.page_id AND h.rev_id = r.rev_id AND h.svt_rev_id = a.rev_id
       AND h.end_year >= YEAR(UTC_TIMESTAMP())
      WHERE h.page_id IS NULL ORDER BY CRC32(a.page_id), a.page_id
      ```
      (run on the `wikirag` connection; it has both grants). A second run right after a full run
      has 0 todo pages and makes 0 writes.
- [ ] **B3.** Per page: `build_section_history_row` (one upsert), commit every `--commit-every 50`,
      `time.sleep(--sleep)`. A page that raises is logged `error page_id=<id> <ExcType>: <msg>` and
      skipped (no row written); the run continues; exit code 1 if any error.
- [ ] **B4. Log** (stdout, to `~/wikimemory/section_history.log`): start line with counts
      (`wikihistory current pages`, `wikirag fi pages`, `history pages`, `fresh`, `todo`); every 50
      pages `progress <done>/<todo> rate=<pages/s> eta=<h> sections=<sum> ghosts=<sum> errors=<n>`;
      after `--limit` runs the `estimate:` line (Decision 6); end line with wall time and totals.
- [ ] **B5. Flags:** `--limit N`, `--pages 1256,1150,440` (rebuild these even if fresh), `--sleep`,
      `--commit-every`, `--verify-only`. Nothing else.
- [ ] **B6. Deterministic self-check** (runs after every full run and with `--verify-only`), prints
      `SELF-CHECK PASS ...` or exits 1 with the failing assertion:
      1. `COUNT(*) FROM section_history` == number of history pages; todo query (B2) returns 0 rows.
      2. Every row: JSON parses; `sections` column == `len(json.sections)`, `ghosts` ==
         `len(json.ghost_sections)` <= 5; `no` is 1..n consecutive; every `added_year` <= `end_year`;
         `changes` >= 0; `war_years` sorted; every ghost has the 6 fields and `removed_year >
         from_year`.
      3. Pinned: page 1256 (Talvisota) has 14 sections and 5 ghosts and its `sections` /
         `ghost_sections` deep-equal those derived from `~/wikimemory/s018_before_1256.json` (step E1;
         `sections` = `[{no, heading, history}]` of the response). Same file check for 1150 (11/4) and
         440 (6/1).
      4. Parity: for 1256, 1150, 440 + 20 random history pages (`random.Random(18)` over the sorted
         page_id list, non-short ones only, so the old path really runs), recompute with the old SVT
         path and deep-equal against the table. Print the 23 page_ids and `parity 23/23`.
      5. Prints totals: rows, short rows (0 sections), rows with >= 1 ghost, sum of ghosts, mean/max
         `build_ms`.

### C. Tests (no network, no DB; fakes like the existing tests)
- [ ] **C1** (`backend/tests/test_summary.py`): `compute_section_history` on synthetic snapshots
      equals `{sections: [{no, heading, history_by_no[no]}], ghost_sections: ghosts}` from
      `compute_history_and_ghosts`; a short article returns empty lists without any SVT call.
- [ ] **C2**: a default extractive payload built with `precomputed_history` from the serialized
      table JSON (`json.loads(json.dumps(...))`) is byte-identical (`json.dumps`) to the one built by
      the old SVT path on the same fake data.
- [ ] **C3** request states with a fake DB: fresh row -> 0 calls to `_fetch_svt_history_and_ghosts`;
      stale `rev_id` -> old path once + one upsert; no `wikihistory.article` row -> `has_history`
      false, `history: null`, `ghost_sections: []`.
- [ ] **C4** 016 variant `history_status`: `ready` (fresh row, fi_history from the table, 0 SVT
      calls), `building` (missing row: exactly 1 job scheduled, a second request schedules 0; after the
      job runs the next request is `ready`), `none` (no history row / no fi sibling).
- [ ] **C5** (`scripts/test_section_history.py`, unittest like `test_history_stats.py`): the self-check
      helpers fail on a row whose `sections` count disagrees with its JSON, on non-consecutive `no`,
      and pass on a good row.
- [ ] Every existing test passes; fakes may be extended for the new SELECT, no test deleted or
      weakened.

### D. Contract / frontend
- [ ] No response shape change. `npm test` (mock) and `REAL=summary,ask` contract pass unchanged.
      No edit to `src/`.

### E. VPS (approved for exactly these steps)
- [ ] **E1 Before deploy:** save today's responses (cache hits):
      `curl -s http://127.0.0.1:8002/api/summary/fi/<id> > ~/wikimemory/s018_before_<id>.json` for
      1256, 1150, 440; and for the 20 parity pages later the old path is the reference (B6.4).
      Save `SELECT lang,page_id,rev_id,ui,CRC32(json) FROM wikirag.summary_cache ORDER BY 1,2,3,4` to
      `~/wikimemory/sc_before18.tsv`.
- [ ] **E2** Deploy `backend/summary.py`, tests and `scripts/section_history.py`(+ test); run pytest
      and the unittest on the VPS; restart only the `api` tmux.
- [ ] **E3 Sample:** `--limit 50` in tmux `shist`; report the `estimate:` line, and during the sample
      the API cache-hit median (10 curls of `/api/summary/fi/1256`) and `/api/stars` time.
- [ ] **E4 Full build** (Decision 6): tmux `shist`, `nice -n 19`; while it runs, measure the same two
      API timings twice (early, middle). If the cache-hit median is >= 300 ms, kill the session
      (resumable), double `--sleep` and restart; report it.
- [ ] **E5** After the run: self-check output (B6), second run shows `todo=0` and 0 writes, row
      counts (Commands: Rows), the gap explanation with the three counts
      (`wikihistory current pages` 19,742 expected, `wikirag fi pages` 19,285, history pages = their
      intersection; rows must equal the intersection; pages only in M have no wikirag article, so
      `/api/summary/fi/<id>` is 404 for them and they need no row; pages only in S get `none`).
- [ ] **E6 Latency (curl on the VPS, median of 10):** cache hit `/api/summary/fi/1256` (unchanged,
      < 300 ms); cache **miss** default request: the FIRST request (only that one is a miss) for each
      of 5 long, non-short fi history articles from the parity list that have no `summary_cache` row,
      each < 300 ms total (the deployed API schedules its normal background LLM build for them; that
      is expected and not awaited); the read SELECT alone (`SET profiling=1`) and its `EXPLAIN`; one 016
      variant (`ui=sv` on a fi article whose fi default row is NOT cached) shows `history_status
      "ready"` without building.
- [ ] **E7 Fallback live check:** `UPDATE wikihistory.section_history SET rev_id = rev_id + 1 WHERE
      page_id = <one parity page>` -> a 016 variant request shows `"building"` -> within 60 s
      `"ready"`, and the row's `rev_id` is again the wikirag one (report the log line). This is the
      only manual write to the table.
- [ ] **E8** Repeat E1's TSV snapshot to `sc_after18.tsv`; `diff` shows no changed or removed line
      (new rows from background builds may be added).

## Assumptions
- 016 (and 017) are merged; their `history_status`, `fi_history` and background history build exist
  in `backend/summary.py`. If the 016 code differs from the spec text (names, where history is
  fetched), adapt A3 to the merged code and report what you changed.
- Current sections come from `wikirag.article` (dataset S) and snapshots from `wikihistory` (dataset
  M), exactly as today; `rev_id` (S) and `svt_rev_id` (M) can differ, so both are stored.
- `end_year` = `max(UTC year now, year of current row_start)` as in `_fetch_svt_history_and_ghosts`;
  a new calendar year adds a snapshot, so rows are stale from 1 Jan (shortcut accepted: one rebuild
  per year).
- Per-page cost is dominated by ~24 `as_of` snapshot reads of compressed text + `clean()`; the 50-page
  sample decides the runtime.

## Scope
- May edit (Hydrogen):
  - `backend/summary.py` (Decision 4 functions, A1–A3; no change to `compute_history_and_ghosts`,
    `_fetch_svt_history_and_ghosts`, `split_wikitext_h2_sections`, prompts or LLM code);
  - `backend/tests/test_summary.py` (add C1–C4; extend fakes);
  - `scripts/section_history.py`, `scripts/test_section_history.py` (new);
  - `backend/main.py` only if the `/api/summary` route needs the `BackgroundTasks` plumbing (report).
- On the VPS may: copy those files to `~/wikimemory/`, create `wikihistory.section_history`, write it
  (script, background builds, E7's single UPDATE), restart only the `api` tmux, run tmux `shist`, read
  any table.
- Must not touch: `docs/memory/*`, `docs/specs/*`, `docs/design/*`; `backend/history.py`,
  `backend/rag_common.py`, `backend/svt_common.py`, `backend/ask.py`; `src/**`; any
  `wikihistory.article` row (read only) or other `wikihistory` table; `chunk`, `chunk_vector`,
  `chunk_vector_hist`, `snapshot_chunk_vector`; `summary_cache` / `answer_cache` rows (no update or
  delete; normal on-demand inserts by the API are fine); container 3308; the organizers' repos, venvs
  and tmux sessions `app`/`tm`/`svt`; the 3307 container settings.

## Boundaries
- Always: read ARCHITECTURE.md first; prepared statements; `SET time_zone='+00:00'` on every SVT
  connection; long jobs in tmux with `nice -n 19`; run pytest + unittest (VPS), `npm test` and
  `REAL=summary,ask` before reporting.
- Ask first (via `orca orchestration ask`): estimate > 8 h; any schema change other than creating
  `section_history`; any parity or pinned mismatch (send both JSONs trimmed); an edit outside Scope;
  rows != history pages after a clean run.
- Never: an LLM call anywhere in this feature; a whole-history (`FOR SYSTEM_TIME ALL`) scan in a
  request; copy or rewrite `history.clean()` / `as_of()` / the ghost rule; loosen the self-check to
  make it pass; delete or weaken tests; touch 3308 or `app`/`tm`/`svt`.

## Open questions (defaults chosen; report, do not block)
- **Rows for short articles?** Default: yes, empty lists (counts as `ready`, keeps rows == history
  pages, costs one text read, no snapshots).
- **Rows for M-only pages (no wikirag fi article)?** Default: no (nothing can request them).
- **Cap 3307 CPU during the build?** Default: no; single sequential process + `--sleep` + live latency
  checks (E4).
- **Year rollover:** default stale on 1 Jan (Assumptions); alternative: drop the `end_year` predicate.

## Approach (Hydrogen)
1. Read the merged 016 `summary.py` (where history, `fi_history`, `history_status` are produced).
2. TDD C1–C5 with fakes; add Decision 4 functions; switch A1–A3 call sites.
3. Local pytest; deploy (E1 first!), VPS pytest/unittest, restart `api`.
4. E3 sample -> estimate -> E4 full build -> E5–E8.
The worker may split (backend / script / VPS run) but reports once.

## Commands
- SSH: `ssh -i ~/.ssh/id_serverTech -o IdentitiesOnly=yes root@72.61.20.120`
- Copy: `scp -i ~/.ssh/id_serverTech -o IdentitiesOnly=yes backend/summary.py root@72.61.20.120:~/wikimemory/backend/`
  (tests to `~/wikimemory/backend/tests/`, `scripts/section_history.py` and its test to `~/wikimemory/scripts/`).
- Restart API (VPS): `tmux kill-session -t api; tmux new -d -s api 'cd ~/wikimemory && set -a && . ./.env && set +a && .venv/bin/uvicorn backend.main:app --host 127.0.0.1 --port 8002 > api.log 2>&1'`
- Pytest (VPS): `cd ~/wikimemory/backend && ~/wikimemory/.venv/bin/python -m pytest tests/test_summary.py -q` and `cd ~/wikimemory && .venv/bin/pytest backend/tests -q`
- Unittest (VPS): `cd ~/wikimemory && .venv/bin/python -m unittest scripts/test_section_history.py -v`
- Sample (VPS): `tmux new -d -s shist 'cd ~/wikimemory && nice -n 19 .venv/bin/python scripts/section_history.py --limit 50 > section_history_sample.log 2>&1'`
- Full (VPS): `tmux new -d -s shist 'cd ~/wikimemory && nice -n 19 /usr/bin/time -v .venv/bin/python scripts/section_history.py >> section_history.log 2>&1; echo EXIT=$? >> section_history.log'`
- Verify (VPS): `cd ~/wikimemory && .venv/bin/python scripts/section_history.py --verify-only`
- Rows (VPS): `docker exec mariadb-vector-wikipedia-rag-mariadb-1 mariadb -uwikirag -pwikirag wikirag -e "SELECT COUNT(*), SUM(sections=0), SUM(ghosts>0), SUM(ghosts), AVG(build_ms), MAX(build_ms) FROM wikihistory.section_history; SELECT COUNT(*) FROM wikihistory.article; SELECT COUNT(*) FROM wikirag.article WHERE lang='fi'; SELECT COUNT(*) FROM wikihistory.article a JOIN wikirag.article r ON r.lang='fi' AND r.page_id=a.page_id; SELECT page_id,rev_id,svt_rev_id,end_year,sections,ghosts,build_ms FROM wikihistory.section_history WHERE page_id IN (1256,1150,440)"`
- Timing: `for i in $(seq 10); do curl -s -o /dev/null -w '%{time_total}\n' '<url>'; done | sort -n | sed -n 5,6p`
- Local: `npm test`; `REAL=summary,ask API_BASE=http://127.0.0.1:8002 npm test` (tunnel:
  `ssh -i ~/.ssh/id_serverTech -o IdentitiesOnly=yes -N -L 8002:127.0.0.1:8002 root@72.61.20.120`).

## Evidence required in worker_done
One consolidated report (per-subtask evidence if split):
- Files changed (must match Scope) and `git diff --stat`.
- Pytest counts on the VPS (C1–C4 named), unittest counts (C5), `npm test` mock and
  `REAL=summary,ask` counts.
- `SHOW CREATE TABLE wikihistory.section_history`; `SHOW GRANTS` result for `wikirag`; `EXPLAIN` of
  the read query.
- E3: the `estimate:` line and the API timings during the sample.
- E4: tmux command used, `--sleep`, start/end time, wall time (`/usr/bin/time` elapsed + max RSS),
  pages/s, errors, the API timings during the build, any restart.
- E5: the full self-check output (`SELF-CHECK PASS`, pinned 1256 14/5, 1150 11/4, 440 6/1,
  `parity 23/23` with the page_ids), the second-run `todo=0` line, the Rows output and the gap
  explanation.
- E6: cache-hit median and the 5 cache-miss first-request times per URL, read-SELECT time, one trimmed 016 variant response
  with `history_status`.
- E7: the `building` -> `ready` sequence with the log line.
- E8: the `diff` output.
- Open issues (pages that errored, rename-as-ghost cases seen, anything adapted from 016's code).

## Failure semantics
Any of these means the Task failed (not a deliverable):
- non-zero pytest, unittest, `npm test` or `REAL=summary,ask` exit;
- self-check not `PASS`: rows != history pages, todo > 0 after a full run, a pinned count or
  pinned JSON mismatch, parity < 23/23;
- a default (`ui` absent) `/api/summary` response that differs from before for the same cache state;
- an SVT snapshot query or LLM call in a request handler when the row is fresh; any LLM call in the
  build;
- a cache-hit median >= 300 ms (during or after the build), or a fresh-row cache-miss default
  request >= 300 ms;
- a changed or deleted `summary_cache` / `answer_cache` row (E8), any write to `wikihistory.article`;
- any edit outside Scope, any touch to container 3308, the 3307 container settings or the
  `app`/`tm`/`svt` sessions.

A parity or pinned mismatch is reported as a `question` with both JSONs (trimmed). It is never
loosened.

After merge the orchestrator updates `docs/memory/ARCHITECTURE.md` (New tables:
`section_history(page_id, rev_id, svt_rev_id, end_year, sections, ghosts, json, build_ms, built_at)`,
wikihistory, used by summary, built by `scripts/section_history.py`) and `STATUS.md`.
