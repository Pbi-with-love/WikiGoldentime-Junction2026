# Spec 011: Way B spike: search the past with a system-versioned vector table

Read docs/memory/ARCHITECTURE.md first. These parts of it apply here: the SSH command, the container
names, the rule that the host has no `mariadb` client, the Ollama bge-m3 options, the tmux rule,
"never touch the organizers' apps", the Schemas section, and the Rules section (the vector-search
subquery pattern, `SET time_zone = '+00:00'`, and full `YYYY-MM-DD HH:MM:SS` timestamps).

**This is a research spike with a half-day timebox (about 4 hours of work).** The deliverable is an
honest findings note plus the scripts. It adds no API endpoint and changes no frontend file. A
follow-up spec will decide whether to expose this feature.

**No bulk embedding.** The old-version vectors already exist in `wikirag.snapshot_chunk_vector`.
The Mac's Ollama is gone and the GPU box is released; bulk embedding on the VPS is forbidden.
`wayb_build.py` makes **zero** calls to any embedding model. The only embeddings allowed are a few
request-time query embeddings in `wayb_query.py` from the VPS Ollama (`http://127.0.0.1:11434`).

**Another worker (spec 012/013) works in the same folder at the same time.** Touch only the files in
Scope. Do not edit, stage, stash, revert or commit anything else (no `git checkout`, `git stash`,
`git add -A`).

Depends on (all met):
- spec 008: `wikirag.chunk_vector` complete (83,797 rows), `scripts/chunk.py`.
- spec 010: Way A works end to end.
- `wikirag.snapshot_chunk_vector` filled by `scripts/snapshot_vectors.py` (17,791 rows, 50 pages,
  926 snapshots).

**Gate:** on the VPS, `SELECT COUNT(*), COUNT(DISTINCT page_id), COUNT(DISTINCT page_id, year)
FROM wikirag.snapshot_chunk_vector` returns `17791, 50, 926`. If it does not, stop and `ask`.

## Source table (read-only)
`wikirag.snapshot_chunk_vector` on the 3307 server (DDL from `scripts/snapshot_vectors.py`):
```sql
CREATE TABLE snapshot_chunk_vector (
  page_id INT UNSIGNED NOT NULL, year SMALLINT NOT NULL, rev_id INT UNSIGNED NOT NULL,
  row_start DATETIME(6) NOT NULL, sha1 VARCHAR(40) NOT NULL, chunk_no SMALLINT UNSIGNED NOT NULL,
  section VARCHAR(255) NULL, text MEDIUMTEXT NOT NULL, model VARCHAR(32) NOT NULL,
  embedding VECTOR(1024) NOT NULL, PRIMARY KEY (page_id, year, chunk_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
```
Meaning of a row:
- One snapshot = one `(page_id, year)`: the version `as_of(page_id, '<year>-12-31 23:59:59')`, kept
  only when its `sha1` differs from the previous kept year of the same page (so consecutive kept
  snapshots of a page always differ in text). Years before the article existed are absent.
  Years run from the first-edit year to 2026.
- `rev_id`, `row_start`: that version's real revision id and real `row_start` in
  `wikihistory.article` (UTC).
- `chunk_no`, `section`, `text`: from `history.clean()` -> Markdown -> `chunk_article()` of
  `scripts/chunk.py` (spec 008 rules unchanged).
- `model`, `embedding`: bge-m3, model digest `790764642607` (same as `chunk_vector`).
- No `lang` column: wikihistory holds fi Wikipedia articles. Confirm from
  `SHOW CREATE TABLE wikihistory.article_list` / `wikihistory.article`; if a lang column exists and
  shows any non-fi page, `ask`.

## Goal
Find out whether MariaDB 12.3.3 can "search the past" natively. Put the snapshot chunk vectors into a
system-versioned vector table with the real Wikipedia timestamps. Then run this query:
`... FOR SYSTEM_TIME AS OF <date> ORDER BY VEC_DISTANCE_COSINE(...) LIMIT 10`.
The spike must answer three questions:
1. Is a VECTOR INDEX allowed on a system-versioned table?
2. If it is, is the index used under `FOR SYSTEM_TIME AS OF`, or does the query fall back to a scan?
3. Does searching the 2015 vectors find different or better passages than Way A, which searches the
   current vectors and then reads the `AS OF` text?

## Acceptance criteria
**Table (separate spike table, created by the script)**
- [ ] `wikirag.chunk_vector_hist`. Copy the column types for `lang` from
      `SHOW CREATE TABLE wikirag.chunk_vector`; the other column types come from
      `snapshot_chunk_vector` above. Shape:
      ```sql
      CREATE TABLE wikirag.chunk_vector_hist (
        lang <as chunk_vector>, page_id INT UNSIGNED NOT NULL, chunk_no SMALLINT UNSIGNED NOT NULL,
        year SMALLINT NOT NULL, rev_id INT UNSIGNED NOT NULL, section VARCHAR(255) NULL,
        text MEDIUMTEXT NOT NULL, model VARCHAR(32) NOT NULL,
        embedding VECTOR(1024) NOT NULL,
        row_start TIMESTAMP(6) GENERATED ALWAYS AS ROW START INVISIBLE,
        row_end   TIMESTAMP(6) GENERATED ALWAYS AS ROW END INVISIBLE,
        PERIOD FOR SYSTEM_TIME (row_start, row_end),
        PRIMARY KEY (lang, page_id, chunk_no),
        VECTOR INDEX (embedding) M=16 DISTANCE=cosine
      ) WITH SYSTEM VERSIONING;
      ```
      Copy the `row_start`/`row_end` declaration style from the organizers' `wikihistory.article`
      (`SHOW CREATE TABLE`) if it differs from the shape above.
- [ ] **Index finding first.**
      - Try the `CREATE` with the VECTOR INDEX. If MariaDB rejects it, record the exact error
        (code and message) as a finding, then create the table without the index.
      - After the data is loaded, also try
        `ALTER TABLE wikirag.chunk_vector_hist ADD VECTOR INDEX (embedding) M=16 DISTANCE=cosine`
        and record that result too.
      - Without an index the spike goes on: a full scan is the result to measure.

**Data (`scripts/wayb_build.py`, runs on the VPS in `~/wikimemory/.venv`, copy-only)**
- [ ] Reads `wikirag.snapshot_chunk_vector` and writes `wikirag.chunk_vector_hist`. Embeddings are
      copied as stored (`INSERT ... SELECT` or `VEC_ToText`/`VEC_FromText` round trip); **no
      embedding model is called** (no Ollama URL, no `embed_chunks` import).
- [ ] `--pages 1256` (Talvisota, fi) comes first. `--all-history` covers all 50 pages in
      `snapshot_chunk_vector` (about 17,791 rows, so it is expected to fit the timebox).
- [ ] **Insert history with real timestamps**, the way the organizers' loader does it. Read
      `~/mariadb-system-versioning-wikipedia/load.py` and copy its method, which includes
      `SET system_versioning_insert_history = 1` (session scope), `SET time_zone = '+00:00'`, and
      explicit `row_start`/`row_end` in the INSERT.
      - Order a page's snapshots by `year`. Snapshot i has `t_i` = its `row_start` from
        `snapshot_chunk_vector`.
      - Every chunk of snapshot i gets `row_start = t_i`, `row_end = t_{i+1}`.
      - Chunks of the last snapshot are current rows. Their `row_end` is the server's "current row"
        value. Read that value from `wikihistory.article`'s current rows; do not hard-code it.
      - Known approximation (record it in the findings note): edits between a year-end snapshot and
        the next kept snapshot are not represented.
      - If `system_versioning_insert_history` or `secure_timestamp` blocks the insert, record the
        exact error and `ask`.
- [ ] The interval computation is a pure Python function (input: a page's `(year, row_start)` list;
      output: `(year, row_start, row_end)`), used by the build and the selftest.
- [ ] Rerun safety: the script needs `--rebuild` to drop and recreate `chunk_vector_hist`. Without
      `--rebuild`, a non-empty table makes it exit non-zero.
- [ ] `python3 scripts/wayb_build.py --selftest` runs with no DB and no network. It asserts the
      interval computation: intervals are ordered by year, have no gaps or overlaps per page, and the
      last one is open (current-row value).
- [ ] The build prints: rows inserted per page and per year (all pages), total rows, current rows,
      history rows, and wall time of the build.
- [ ] **Sanity SQL:**
      - Row counts: `FOR SYSTEM_TIME ALL` count equals the source count for the built pages
        (17,791 for `--all-history`); current count equals the number of chunks of each page's
        newest snapshot.
      - `FOR SYSTEM_TIME AS OF '2015-01-01 00:00:00'` for page 1256 returns exactly the chunks of the
        page's newest snapshot with `year <= 2014`. Cross-check against the organizers' code: the
        sha1 of `as_of(1256, '2014-12-31 23:59:59')` (via `backend/history.py`, imported, not
        edited) equals that snapshot's `sha1`. Compare sha1, not rev_id: a kept year can stand for
        later years whose rev_id differs but whose text is identical.
      - Plain `SELECT` (current rows) for page 1256 returns the chunks of the newest snapshot.

**Query and measurement (`scripts/wayb_query.py`, runs on the VPS in `~/wikimemory/.venv`)**
- [ ] Query shape (vector subquery on the hist table alone, join outside), with
      `SET time_zone = '+00:00'` and `SET mhnsw_ef_search = 80`:
      ```sql
      SELECT n.page_id, n.chunk_no, n.rev_id, n.section, n.d, LEFT(n.text, 200)
      FROM (SELECT page_id, chunk_no, rev_id, section, text,
                   VEC_DISTANCE_COSINE(embedding, VEC_FromText(?)) d
            FROM wikirag.chunk_vector_hist FOR SYSTEM_TIME AS OF TIMESTAMP '2015-01-01 00:00:00'
            ORDER BY d LIMIT 10) n
      ORDER BY n.d;
      ```
- [ ] Measure 3 variants: (a) current rows (no `FOR SYSTEM_TIME`), (b) `AS OF 2015-01-01`, and
      (c) `AS OF 2015-01-01` with `IGNORE INDEX (embedding)`, which forces a scan as the exact
      baseline. Skip (c) if there is no index. For each variant, record:
      - `EXPLAIN FORMAT=JSON` and `ANALYZE FORMAT=JSON`: is the vector index used, and how many
        rows are examined?
      - the median and p90 of 10 warm runs (server-side, timed around `execute` on the VPS)
      - the number of rows returned (does the HNSW index followed by the time filter return fewer
        than 10?)
      - overlap@10 of (b) against (c), i.e. index vs. exact. This shows whether index results go
        missing under `FOR SYSTEM_TIME`.
- [ ] **Quality vs Way A, with 2–3 demo questions.** Use the hero question in fi and en
      (`Miten talvisota päättyi?`, `How did the Winter War end?`), plus one question taken from
      `data/demo-questions.tsv` whose page is one of the 50 history pages. At 2015-01-01:
      - Way B: the top 10 `chunk_vector_hist` passages AS OF 2015.
      - Way A: what spec 010 does. That is the current `chunk_vector` top chunks for the same page,
        then that page's `wikihistory.article` text `AS OF '2014-12-31 23:59:59'` (the matched
        section).
      - Show both side by side (page, section, first 200 chars) and give one sentence per question:
        "same / different / better / worse, because ...".
      - Retrieval only, with no LLM calls. Query embeddings come from the VPS Ollama
        (`http://127.0.0.1:11434`, bge-m3, ARCHITECTURE options); at most a few calls (one per
        question), no bulk embedding.

**Findings note (`docs/memory/research/wayb-spike.md`), in the organizers' README style**
- [ ] A "What we found" bullet list, with numbers:
      - the index verdict, stated in exactly one of these forms:
        - "the vector index works on a system-versioned table (and is/is not used under FOR
          SYSTEM_TIME)"
        - "it falls back to a scan; fine at this scale (N vectors, X ms)"
        - the exact error if the index was refused
      - the row counts: total, current, history, per page
      - the build time
      - the query timings
      - the overlap@10
      - the quality verdict
- [ ] A "Limits met" list: the timebox, the end-of-year approximation, the scale (50 articles, fi
      only), that vectors come from the precomputed `snapshot_chunk_vector`, and anything not done.
- [ ] How to rebuild (exact commands). The note states that the spike table stays (it is small), and
      gives its size from `information_schema.TABLES`.
- [ ] A one-paragraph recommendation for the follow-up spec: expose it, or not.

## Assumptions
- Scale: about 17,791 vectors at most (926 snapshots, 50 pages). Page 1256 alone is a few hundred
  rows. Report the actual N.
- `backend/history.py` exists (spec 006/010). Its `as_of()` signature and connection handling are read
  from the file and used as they are (see `scripts/snapshot_vectors.py` for a working call:
  `history.as_of(cursor, page_id, '<Y>-12-31 23:59:59')` on a `wikihistory` connection with
  `time_zone = '+00:00'`). The `wikirag` user has privileges on `wikihistory.*` on 3307.
- `lang` for every hist row is `'fi'` (confirmed per the Source table note).
- The current-row `row_end` and the timestamp precision follow the server. Do not assume 2038 or 2106.
- `snapshot_chunk_vector.row_start` is DATETIME(6) in UTC; inserting it into a TIMESTAMP(6) column
  under `time_zone = '+00:00'` keeps the value.
- No new dependencies. Use the `mariadb` driver and stdlib `urllib`, as spec 008 does.

## Scope
- May edit (Hydrogen): `scripts/wayb_build.py` (new), `scripts/wayb_query.py` (new),
  `docs/memory/research/wayb-spike.md` (new). Nothing else in the repo.
- On the VPS, may create: the table `wikirag.chunk_vector_hist` (only this one), and the script
  copies and logs under `~/wikimemory/`.
- Must not touch:
  - `wikirag.snapshot_chunk_vector` (read-only source)
  - the tables `wikirag.chunk_vector`, `chunk`, `article_vector` and `article`, any `wikihistory`
    table, and `answer_cache` (all read-only; spec 012 is rebuilding `answer_cache`)
  - `backend/`, `src/`, `index.html`, `docs/specs/`, `docs/design/` (another worker, spec 012/013,
    is editing in the same folder)
  - `scripts/chunk.py`, `scripts/embed_chunks.py`, `scripts/snapshot_vectors.py`
  - the other files in `docs/memory/*`
  - the organizers' repos and venvs (`load.py` is read-only), the tmux sessions `app`, `tm`, `svt`,
    `api` and `answers`, and the 3308 container
  - the configuration of either container, including global server variables

## Boundaries
- Always:
  - Respect the timebox. When it runs out, stop and write the note with what exists; the
    one-article result is enough.
  - Use `SET time_zone = '+00:00'` in every SVT session.
  - Use the session-scope `SET system_versioning_insert_history = 1` only, never `GLOBAL`.
  - Run the selftest and the sanity SQL before reporting.
  - Report honestly: a scan, a refused index, or "Way B is no better" are all valid results.
- Reuse the organizers' code (`as_of`, the insert-history method in `load.py`) and the precomputed
  `snapshot_chunk_vector`. Never rewrite or recompute them.
- No bulk embedding anywhere. `wayb_build.py` calls no embedding model; `wayb_query.py` makes only the
  few request-time query embeddings on the VPS Ollama (127.0.0.1:11434).
- Ask first (via `orca orchestration ask`): when the gate fails, when the insert is blocked by
  privileges or `secure_timestamp`, when wikihistory holds non-fi pages, before any new dependency,
  and before any schema change other than `chunk_vector_hist`.
- Never:
  - add an API endpoint or change the UI
  - commit secrets, or commit/stage/revert files of the other worker
  - stop or restart containers or any tmux session you did not create
  - publish a port beyond 127.0.0.1

## Open questions (defaults chosen)
- Store the chunk `text` in the hist table? Default: yes. The comparison needs it, and it saves a
  join to the source table.
- The comparison date: 2015-01-01, as in the brief. Default: only this date. A second date is
  optional and only if time remains.
- If the index exists but under `AS OF` it returns fewer than 10 rows or has low overlap@10, the
  verdict is "index used but post-filtered: results go missing". Report it with the numbers.
- Where `wayb_build.py` runs: on the VPS (data and server are there; no tunnel needed). Default: VPS.

## Approach (Hydrogen)
1. Check the gate.
2. On the VPS, run `SHOW CREATE TABLE` on `wikirag.chunk_vector`, `wikirag.snapshot_chunk_vector`,
   `wikihistory.article` and `wikihistory.article_list`. Read `load.py`, `backend/history.py` and
   `scripts/snapshot_vectors.py`.
3. Write `wayb_build.py` with `--selftest` and make the selftest pass. Copy it to the VPS, run the
   CREATE (index finding), then `--pages 1256`, then the sanity SQL.
4. Write `wayb_query.py`, copy it to the VPS, and measure the 3 variants and the quality comparison
   for the one article.
5. Run `--all-history --rebuild`, rerun the sanity SQL, and measure again.
6. Write the findings note.

## Commands
- SSH: `ssh -i ~/.ssh/id_serverTech -o IdentitiesOnly=yes root@72.61.20.120`
- Selftest (Mac): `python3 scripts/wayb_build.py --selftest`
- Copy: `scp -i ~/.ssh/id_serverTech -o IdentitiesOnly=yes scripts/wayb_build.py scripts/wayb_query.py root@72.61.20.120:~/wikimemory/`
- Gate (VPS): `docker exec mariadb-vector-wikipedia-rag-mariadb-1 mariadb -uwikirag -pwikirag wikirag -e "SELECT COUNT(*), COUNT(DISTINCT page_id), COUNT(DISTINCT page_id, year) FROM snapshot_chunk_vector"`
- Build one article (VPS): `cd ~/wikimemory && .venv/bin/python wayb_build.py --pages 1256 --rebuild 2>&1 | tee wayb_build.log`
- Build all (VPS): `cd ~/wikimemory && .venv/bin/python wayb_build.py --all-history --rebuild 2>&1 | tee wayb_build_all.log`
- Measure (VPS): `cd ~/wikimemory && .venv/bin/python wayb_query.py --as-of '2015-01-01 00:00:00' | tee wayb_query.log`
- Sanity SQL (VPS): `docker exec mariadb-vector-wikipedia-rag-mariadb-1 mariadb -uwikirag -pwikirag wikirag -e "SET time_zone='+00:00'; SHOW CREATE TABLE chunk_vector_hist\G SELECT COUNT(*) FROM chunk_vector_hist FOR SYSTEM_TIME ALL; SELECT COUNT(*) FROM chunk_vector_hist; SELECT page_id, COUNT(DISTINCT year) snapshots, COUNT(*) rows_all FROM chunk_vector_hist FOR SYSTEM_TIME ALL GROUP BY page_id; SELECT year, rev_id, COUNT(*) FROM chunk_vector_hist FOR SYSTEM_TIME AS OF TIMESTAMP '2015-01-01 00:00:00' WHERE page_id=1256 GROUP BY year, rev_id; SELECT year, rev_id, sha1, COUNT(*) FROM snapshot_chunk_vector WHERE page_id=1256 AND year<=2014 GROUP BY year, rev_id, sha1 ORDER BY year DESC LIMIT 1; SELECT ROUND((DATA_LENGTH+INDEX_LENGTH)/1048576,1) mb FROM information_schema.TABLES WHERE TABLE_SCHEMA='wikirag' AND TABLE_NAME='chunk_vector_hist'"`
- Untouched check: `curl -s -o /dev/null -w '%{http_code}\n'` on 127.0.0.1:8000, :8001 and :8002, plus
  `SELECT COUNT(*) FROM chunk_vector` (83,797) and `SELECT COUNT(*) FROM snapshot_chunk_vector`
  (17,791) before and after the run (must be equal).

## Evidence required in worker_done
One consolidated report, with evidence per step if the work is split:
- The files changed, and the gate check output.
- The selftest output (exit 0).
- Proof of zero embedding calls in the build: `grep -nE 'ollama|11434|11435|embed' scripts/wayb_build.py`
  output (expected empty, or only comments).
- The index finding: the CREATE result or its exact error, and the ALTER ADD VECTOR INDEX result.
- The sanity SQL output: all/current/history row counts, per-page snapshots, the AS OF 2015 snapshot
  for 1256 equal to the newest source snapshot with `year <= 2014`, its sha1 equal to the sha1 of
  `as_of(1256, '2014-12-31 23:59:59')`, and the table size in MB.
- The build numbers: rows per year and per page (full list, or a table), total/current/history rows,
  and build wall time, for both the 1256 and the all-history build.
- The measurement table for variants (a)/(b)/(c): index used (y/n), rows examined, rows returned,
  median/p90 ms, overlap@10. Include the key EXPLAIN excerpts.
- The quality comparison for 2–3 questions (side by side, with a verdict line each), and the number
  of query embeddings made.
- The path `docs/memory/research/wayb-spike.md` and its "What we found" bullets pasted in.
- The `chunk_vector` and `snapshot_chunk_vector` counts before and after (equal), and the HTTP codes
  of :8000/:8001/:8002.
- `git status --short` limited to the three files in Scope (no other file of yours changed).
- Time spent against the timebox, open issues, and assumptions.

## Failure semantics
Any of these means the Task failed:
- the selftest fails
- there is no findings note
- there is no one-article (1256) result
- the AS OF 2015 snapshot / sha1 check does not match
- any embedding-model call in `wayb_build.py`, or bulk embedding anywhere
- any change to `chunk_vector`, `chunk`, `article_vector`, `snapshot_chunk_vector`, a wikihistory
  table, the organizers' apps, or files outside Scope.

A refused index, a scan fallback, or "Way B is not better" is **not** a failure. These are findings.
