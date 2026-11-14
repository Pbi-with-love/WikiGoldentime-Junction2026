# Spec 011: Way B spike: search the past with a system-versioned vector table

Read docs/memory/ARCHITECTURE.md first. These parts of it apply here: the SSH command, the container
names, the rule that the host has no `mariadb` client, the Ollama bge-m3 options, bulk embedding on
the Mac through an SSH tunnel, the tmux rule, "never touch the organizers' apps", the Schemas section,
and the Rules section (the vector-search subquery pattern, `SET time_zone = '+00:00'`, and full
`YYYY-MM-DD HH:MM:SS` timestamps).

**This is a research spike with a half-day timebox (about 4 hours of work).** The deliverable is an
honest findings note plus the scripts. It adds no API endpoint and changes no frontend file. A
follow-up spec will decide whether to expose this feature.

Depends on:
- spec 008: `wikirag.chunk`, `wikirag.chunk_vector`, `scripts/chunk.py`, and the Mac embedding setup.
- spec 010: Way A, working end to end.

**Gate:** start only after Way A works end to end. Check that `wikirag.answer_cache` holds the hero
question (`Miten talvisota päättyi?` or `How did the Winter War end?`) with `history_available`
true and at least 2 milestones. If it does not, stop and `ask`.

## Goal
Find out whether MariaDB 12.3.3 can "search the past" natively. Put chunk vectors of old article
versions into a system-versioned vector table, with the real Wikipedia timestamps. Then run this query:
`... FOR SYSTEM_TIME AS OF <date> ORDER BY VEC_DISTANCE_COSINE(...) LIMIT 10`.
The spike must answer three questions:
1. Is a VECTOR INDEX allowed on a system-versioned table?
2. If it is, is the index used under `FOR SYSTEM_TIME AS OF`, or does the query fall back to a scan?
3. Does searching the 2015 vectors find different or better passages than Way A, which searches the
   current vectors and then reads the `AS OF` text?

## Acceptance criteria
**Table (separate spike table, created by the script)**
- [ ] `wikirag.chunk_vector_hist`. Copy the column types for `lang`, `page_id`, `model` and `embedding`
      from `SHOW CREATE TABLE wikirag.chunk_vector`. Copy the type of `rev_id` from
      `wikihistory.article`. Shape:
      ```sql
      CREATE TABLE wikirag.chunk_vector_hist (
        lang ..., page_id ..., chunk_no SMALLINT UNSIGNED NOT NULL, model ...,
        rev_id ..., section VARCHAR(255) NULL, text TEXT NOT NULL,
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

**Data (`scripts/wayb_build.py`, runs on the Mac through the tunnel, like spec 008's embedder)**
- [ ] `--pages 1256` (Talvisota, fi) comes first. `--all-history` covers the 50 pages in
      `wikihistory.article_list` and runs only if time allows.
- [ ] Years run from the article's first-edit year to the current year. The snapshot for a year is
      the version `FOR SYSTEM_TIME AS OF TIMESTAMP '<Y>-12-31 23:59:59'`; for the current year, use
      the current UTC time. Get it with the organizers' `as_of()`, then convert it with `clean()`
      from `backend/history.py` (imported, not copied or edited).
      - If a year resolves to the same `rev_id` as the previous year, skip it, because nothing
        changed.
      - Skip any year in which the article did not exist yet.
- [ ] **Chunk with spec 008's chunker, unchanged.**
      1. Turn the `clean()` blocks into the Markdown shape that `chunk.py` expects:
         - `# <title>`
         - each `"h"` block becomes `## <text>`
         - `"p"` and `"li"` blocks stay as text lines.
      2. Call the pure chunking function in `scripts/chunk.py` (imported). This keeps the same
         rules: dropped sections, the 300/250 word windows, and the "Title — Section" prefix.
      - A short version (300 words or fewer) gives one chunk with the whole text, which is
        **embedded**, because old versions have no article vector to reuse.
      - If `chunk.py` has no importable pure function, `ask`. Do not edit `chunk.py`.
- [ ] **Embed** with the Mac's Ollama `bge-m3`, using the same request and the same vector insert
      format as `embed_chunks.py`. The script refuses to run if the Mac's model digest differs
      from the VPS digest `790764642607`. Keep an in-memory cache keyed by the sha256 of the chunk
      text, so text that did not change between years is not embedded again. Report the cache hit
      rate.
- [ ] **Insert history with real timestamps**, the way the organizers' loader does it. Read
      `~/mariadb-system-versioning-wikipedia/load.py` and copy its method, which includes
      `SET system_versioning_insert_history = 1`, `SET time_zone = '+00:00'`, and explicit
      `row_start`/`row_end` in the INSERT.
      - Let snapshot i be the version used for year Y_i. Its `row_start` is that version's real
        `row_start` in wikihistory.
      - Every chunk of snapshot i gets the interval `row_start = t_i`, `row_end = t_{i+1}`, where
        t_{i+1} is the next kept snapshot's `row_start`.
      - Chunks of the last snapshot are current rows. Their `row_end` is the server's "current row"
        value. Read that value from `wikihistory.article`'s current rows; do not hard-code it.
      - Known approximation (record it in the findings note): edits between a year-end snapshot and
        the next kept snapshot are not represented.
      - If `system_versioning_insert_history` or `secure_timestamp` blocks the insert, record the
        exact error and `ask`.
- [ ] Rerun safety: the script needs `--rebuild` to drop and recreate `chunk_vector_hist`. Without
      `--rebuild`, a non-empty table makes it exit non-zero.
- [ ] `python3 scripts/wayb_build.py --selftest` runs with no DB and no network. It asserts:
      - the blocks-to-Markdown conversion
      - the skip rule for an unchanged `rev_id`
      - the interval computation: intervals have no gaps or overlaps per page, and the last one is
        open.
- [ ] **Sanity SQL:**
      - `FOR SYSTEM_TIME AS OF '2015-01-01 00:00:00'` for page 1256 returns exactly the chunks of
        the snapshot whose `rev_id` equals `as_of(1256, '2014-12-31 23:59:59')`.
      - Plain `SELECT` (current rows) returns the chunks of the newest snapshot.

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
- [ ] **Quality vs Way A, with 2–3 demo questions.** Use the hero question in fi and en, plus one
      question taken from `data/demo-questions.tsv`. At 2015-01-01:
      - Way B: the top 10 `chunk_vector_hist` passages AS OF 2015.
      - Way A: what spec 010 does. That is the current `chunk_vector` top chunks for the same page,
        then that page's `wikihistory.article` text `AS OF '2014-12-31 23:59:59'` (the matched
        section).
      - Show both side by side (page, section, first 200 chars) and give one sentence per question:
        "same / different / better / worse, because ...".
      - Retrieval only, with no LLM calls. Query embeddings come from the VPS Ollama (3 request-time
        embeddings, which is allowed).

**Findings note (`docs/memory/research/wayb-spike.md`), in the organizers' README style**
- [ ] A "What we found" bullet list, with numbers:
      - the index verdict, stated in exactly one of these forms:
        - "the vector index works on a system-versioned table (and is/is not used under FOR
          SYSTEM_TIME)"
        - "it falls back to a scan; fine at this scale (N vectors, X ms)"
        - the exact error if the index was refused
      - the row counts: total, current, history, per page
      - the timings
      - the overlap@10
      - the quality verdict
- [ ] A "Limits met" list: the timebox, the end-of-year approximation, the scale (50 articles), and
      anything not done.
- [ ] How to rebuild (exact commands). The note states that the spike table stays (it is small), and
      gives its size from `information_schema.TABLES`.
- [ ] A one-paragraph recommendation for the follow-up spec: expose it, or not.

## Assumptions
- Scale: the brief estimated about 1,000 vectors. At chunk level it is probably more: Talvisota alone
  has about 20 years × 20 or more chunks. The text-hash cache and the unchanged-`rev_id` skip cut this
  down. Report the actual N. If the Mac ETA for `--all-history` is over 1 h, do a subset (for example
  10 articles), record which ones, and stop there.
- `backend/history.py` exists (spec 006/010). Its `as_of()` signature and connection handling are read
  from the file and used as they are. wikihistory is read on the 3307 server (merged, spec 002) through
  the tunnel, and the `wikirag` user has privileges on `wikihistory.*`.
- The current-row `row_end` and the timestamp precision follow the server. Do not assume 2038 or 2106.
- No new dependencies. Use the same DB driver and the stdlib `urllib` that spec 008 uses.

## Scope
- May edit (Hydrogen): `scripts/wayb_build.py` (new), `scripts/wayb_query.py` (new),
  `docs/memory/research/wayb-spike.md` (new).
- On the VPS, may create: the table `wikirag.chunk_vector_hist` (only this one), and the script
  copies and logs under `~/wikimemory/`.
- Must not touch:
  - the tables `wikirag.chunk_vector`, `chunk`, `article_vector` and `article`, any `wikihistory`
    table, and `answer_cache` (all read-only)
  - `scripts/chunk.py`, `scripts/embed_chunks.py`, `backend/`, `src/`, `index.html`
  - the other files in `docs/memory/*`, and the specs
  - the organizers' repos and venvs (`load.py` is read-only), the tmux sessions `app` and `tm`, and
    the 3308 container
  - the configuration of either container, including global server variables

## Boundaries
- Always:
  - Respect the timebox. When it runs out, stop and write the note with what exists; the
    one-article result is enough.
  - Use `SET time_zone = '+00:00'` in every SVT session.
  - Use the session-scope `SET system_versioning_insert_history = 1` only, never `GLOBAL`.
  - Run the selftest and the sanity SQL before reporting.
  - Report honestly: a scan, a refused index, or "Way B is no better" are all valid results.
- Reuse the organizers' code (`as_of`, `clean`, the insert-history method in `load.py`) and spec 008's
  chunker and embedder format. Never rewrite them.
- Bulk embedding happens only on the Mac, never on the VPS.
- Ask first (via `orca orchestration ask`): when the gate fails, when the insert is blocked by
  privileges or `secure_timestamp`, when `chunk.py` cannot be imported, before any new dependency,
  and before any schema change other than `chunk_vector_hist`.
- Never:
  - add an API endpoint or change the UI
  - commit secrets
  - stop or restart containers or the `app`/`tm` sessions
  - publish a port beyond 127.0.0.1

## Open questions (defaults chosen)
- The snapshot date per year: end of year (`Y-12-31 23:59:59`), the same as spec 010. Default: yes.
- Store the chunk `text` in the hist table? Default: yes. Old chunk text exists nowhere else, and the
  comparison needs it.
- The comparison date: 2015-01-01, as in the brief. Default: only this date. A second date is
  optional and only if time remains.
- If the index exists but under `AS OF` it returns fewer than 10 rows or has low overlap@10, the
  verdict is "index used but post-filtered: results go missing". Report it with the numbers.

## Approach (Hydrogen)
1. Check the gate.
2. On the VPS, run `SHOW CREATE TABLE` on `wikirag.chunk_vector` and `wikihistory.article`. Read
   `load.py`, `backend/history.py` and `scripts/chunk.py`.
3. Write `wayb_build.py` with `--selftest` and make the selftest pass. Run the CREATE (index
   finding), then `--pages 1256`, then the sanity SQL.
4. Write `wayb_query.py`, copy it to the VPS, and measure the 3 variants and the quality comparison
   for the one article.
5. If time remains, run `--all-history` and measure again.
6. Write the findings note.

## Commands
- SSH: `ssh -i ~/.ssh/id_serverTech -o IdentitiesOnly=yes root@72.61.20.120`
- Tunnel (Mac): `ssh -i ~/.ssh/id_serverTech -o IdentitiesOnly=yes -N -L 3307:127.0.0.1:3307 root@72.61.20.120`
- Selftest: `python3 scripts/wayb_build.py --selftest`
- Build one article: `~/.venvs/wikimemory/bin/python scripts/wayb_build.py --db-port 3307 --pages 1256 --rebuild 2>&1 | tee wayb_build.log`
- Build all (optional): `... scripts/wayb_build.py --db-port 3307 --all-history --rebuild`
- Copy: `scp -i ~/.ssh/id_serverTech -o IdentitiesOnly=yes scripts/wayb_query.py root@72.61.20.120:~/wikimemory/`
- Measure (VPS): `cd ~/wikimemory && .venv/bin/python wayb_query.py --as-of '2015-01-01 00:00:00' | tee wayb_query.log`
- Sanity SQL (VPS): `docker exec mariadb-vector-wikipedia-rag-mariadb-1 mariadb -uwikirag -pwikirag wikirag -e "SET time_zone='+00:00'; SHOW CREATE TABLE chunk_vector_hist\G SELECT COUNT(*) FROM chunk_vector_hist FOR SYSTEM_TIME ALL; SELECT COUNT(*) FROM chunk_vector_hist; SELECT page_id, COUNT(DISTINCT rev_id) snapshots, COUNT(*) rows_all FROM chunk_vector_hist FOR SYSTEM_TIME ALL GROUP BY page_id; SELECT rev_id, COUNT(*) FROM chunk_vector_hist FOR SYSTEM_TIME AS OF TIMESTAMP '2015-01-01 00:00:00' WHERE page_id=1256 GROUP BY rev_id; SELECT ROUND((DATA_LENGTH+INDEX_LENGTH)/1048576,1) mb FROM information_schema.TABLES WHERE TABLE_SCHEMA='wikirag' AND TABLE_NAME='chunk_vector_hist'"`
- Untouched check: `curl -s -o /dev/null -w '%{http_code}\n'` on 127.0.0.1:8000, :8001 and :8002, plus
  `SELECT COUNT(*) FROM chunk_vector` before and after the run (must be equal).

## Evidence required in worker_done
One consolidated report, with evidence per step if the work is split:
- The files changed, and the gate check output.
- The selftest output (exit 0).
- The index finding: the CREATE result or its exact error, and the ALTER ADD VECTOR INDEX result.
- The sanity SQL output: all/current/history row counts, per-page snapshots, the AS OF 2015 `rev_id`
  equal to `as_of()`'s `rev_id`, and the table size in MB.
- The build numbers: years kept, chunks, embeddings made vs. cache hits, Mac wall time, and both
  Ollama digests.
- The measurement table for variants (a)/(b)/(c): index used (y/n), rows examined, rows returned,
  median/p90 ms, overlap@10. Include the key EXPLAIN excerpts.
- The quality comparison for 2–3 questions (side by side, with a verdict line each).
- The path `docs/memory/research/wayb-spike.md` and its "What we found" bullets pasted in.
- The `chunk_vector` count before and after (equal), and the HTTP codes of :8000/:8001/:8002.
- Time spent against the timebox, open issues, and assumptions.

## Failure semantics
Any of these means the Task failed:
- the selftest fails
- there is no findings note
- there is no one-article (1256) result
- the AS OF `rev_id` check does not match
- any change to `chunk_vector`, `chunk`, `article_vector`, a wikihistory table, or the organizers'
  apps.

A refused index, a scan fallback, or "Way B is not better" is **not** a failure. These are findings.
