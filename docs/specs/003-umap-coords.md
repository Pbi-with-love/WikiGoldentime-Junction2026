# Spec 003: UMAP star coordinates (article_coord)

Read docs/memory/ARCHITECTURE.md first (Infrastructure section: SSH command, container names, no host
`mariadb` client, `~/wikimemory/.venv`, tmux rules, "never touch the organizers' apps").

## Goal
Build `wikirag.article_coord(lang, page_id, x, y, z)`: one 3D position per article (all 29,460) from
the bge-m3 article vectors, laid out with UMAP so similar articles sit together, scaled to the range
the frontend galaxy already uses. Feeds the Meaning lens of `/api/stars` (a later spec).

## Acceptance criteria
- [ ] `scripts/umap_coords.py` reads `~/mariadb-vector-wikipedia-rag/data/vectors-bge-m3-{fi,sv,en}.parquet`,
      runs one joint UMAP over all three languages (bge-m3 is multilingual, so translations of a topic
      land close, as in the mock), and writes `wikirag.article_coord`.
- [ ] Table: `article_coord(lang, page_id, x FLOAT NOT NULL, y FLOAT NOT NULL, z FLOAT NOT NULL,
      PRIMARY KEY (lang, page_id))`, with `lang`/`page_id` types copied from `SHOW CREATE TABLE wikirag.article`.
      This table is pre-approved (listed in ARCHITECTURE "New tables"); no other schema change.
- [ ] `SELECT COUNT(*) FROM article_coord` = 29,460; per lang fi 19,285 / sv 4,921 / en 5,254.
- [ ] Every row joins `wikirag.article` on (lang, page_id): anti-join count = 0, both directions.
- [ ] No NULL/NaN; coordinates fit the frontend frame (camera at (0, 6, 62) looking at the origin;
      mock stars in `src/mock/stars.js` span about x -40..40, y -25..25, z -31..31): center each axis on
      its median, scale each axis so its 1st..99th percentile maps to x -36..36, y -22..22, z -28..28,
      then clip to x ±40, y ±25, z ±32. The script asserts these bounds before writing.
- [ ] Deterministic: `random_state=42`; a rerun gives the same coordinates (check 3 sample rows).
- [ ] Re-runnable without a window of missing data: write to `article_coord_new`, then
      `RENAME TABLE article_coord TO article_coord_old, article_coord_new TO article_coord; DROP TABLE article_coord_old`
      (first run: plain rename).
- [ ] Resource budget on the VPS: peak RSS < 3 GB, wall time < 20 min, measured with
      `/usr/bin/time -v`. The organizers' `app` (:8000) and `tm` (:8001) still answer during/after.
- [ ] The script ends with assert-based self-checks (row count equals the Parquet row count, bounds,
      no NaN) and exits non-zero on failure.

## Assumptions
- Runs on the VPS (data is there; no 120 MB scp; 2 vCPU is enough for 29k points). Memory plan:
  load the embedding column straight to numpy without Python lists
  (`pq.read_table(f, columns=[...]).column('embedding').combine_chunks().values.to_numpy().reshape(-1, 1024)`,
  float32, ~120 MB total), PCA to 50 dims (sklearn, float32), then
  `umap.UMAP(n_components=3, n_neighbors=15, min_dist=0.1, metric='cosine', random_state=42)`.
  Run under `nice -n 10` inside `tmux new -d -s umap '...'`. Fallback if the budget fails: run the
  same script on the Mac after `scp` of the three Parquet files and write through an SSH tunnel to
  127.0.0.1:3307 (`--db-host/--db-port` flags, default 127.0.0.1:3307).
- Parquet has 29,460 rows in total, one model (`bge-m3`). The script asserts one distinct `model` and
  unique (lang, page_id); if not, stop and ask.
- DB driver and connection: the same driver and connect() settings as
  `~/mariadb-vector-wikipedia-rag/common.py` (look at its imports); no second driver. User
  `wikirag`/`wikirag`, db `wikirag`, 127.0.0.1:3307. Insert with `executemany` in batches of 1,000.
- Python env: `~/wikimemory/.venv` (create with `python3 -m venv` if missing);
  `pip install umap-learn pyarrow numpy scikit-learn` plus the organizers' DB driver. Never install into
  the organizers' venvs.
- This spec does not depend on 002 (only `wikirag` is used); it can run in parallel with it.

## Scope
- May edit: `scripts/umap_coords.py` (new), `scripts/requirements.txt` (new: the pip list above, pinned
  to the installed versions).
- On the VPS may create: `~/wikimemory/` (script copy, `.venv`, log), tables `wikirag.article_coord`
  (and transient `article_coord_new`/`_old`).
- Must not touch: `src/` (frontend stays on mock data; `/api/stars` is a later spec), `index.html`,
  `docs/memory/*`, other specs, any existing `wikirag` table, the organizers' repos/venvs/Parquet files,
  tmux sessions `app` and `tm`, both containers' configuration.

## Boundaries
- Always: run the script's self-checks and the SQL checks below before reporting; follow
  docs/memory/CONVENTIONS.md.
- Reuse the organizers' code (search, as_of, versions, clean; here: their DB connect settings);
  never rewrite it.
- Precompute: coordinates are computed once into the table; no UMAP at request time.
- Ask first (via `orca orchestration ask`): dependencies beyond the list above, schema changes beyond
  `article_coord`, running anything that would push the VPS into swap while `app`/`tm` serve.
- Never: commit secrets; stop or restart containers or the `app`/`tm` sessions; delete failing tests.

## Open questions (defaults chosen)
- Joint UMAP over fi+sv+en vs. Finnish only? Default: joint (one shared galaxy, all 29,460 stars).
- Uniform vs. per-axis scaling? Default: per-axis percentile scaling (fills the mock's wide frame);
  the frontend can rescale later if the shape looks stretched.
- UMAP parameters are visual defaults; tuning is out of scope.

## Approach (Hydrogen)
1. On the VPS: inspect Parquet schema/row counts and `SHOW CREATE TABLE wikirag.article`; read the
   organizers' `common.py` connect().
2. Write `scripts/umap_coords.py` + `scripts/requirements.txt`; `scp` both to `~/wikimemory/`; set up
   the venv.
3. Run in tmux with `/usr/bin/time -v`, log to `~/wikimemory/umap.log`; run the SQL checks.
4. Rerun once and compare 3 sample rows for determinism.

## Commands
- SSH: `ssh -i ~/.ssh/id_serverTech -o IdentitiesOnly=yes root@72.61.20.120`
- Copy: `scp -i ~/.ssh/id_serverTech -o IdentitiesOnly=yes scripts/umap_coords.py scripts/requirements.txt root@72.61.20.120:~/wikimemory/`
- Run: `ssh ... "tmux new -d -s umap 'cd ~/wikimemory && nice -n 10 /usr/bin/time -v .venv/bin/python umap_coords.py > umap.log 2>&1'"`
- Test (exit 0 of the script, then on the VPS):
  `docker exec mariadb-vector-wikipedia-rag-mariadb-1 mariadb -uwikirag -pwikirag wikirag -e "SELECT lang, COUNT(*), MIN(x), MAX(x), MIN(y), MAX(y), MIN(z), MAX(z) FROM article_coord GROUP BY lang WITH ROLLUP; SELECT COUNT(*) FROM article a LEFT JOIN article_coord c USING (lang, page_id) WHERE c.page_id IS NULL; SELECT COUNT(*) FROM article_coord c LEFT JOIN article a USING (lang, page_id) WHERE a.page_id IS NULL; SELECT c.*, a.title FROM article_coord c JOIN article a USING (lang, page_id) WHERE (lang, page_id) IN (('fi',1256),('sv',23612),('en',33924),('fi',1150),('fi',440));"`

## Evidence required in worker_done
One consolidated report:
- Files changed.
- Script exit code and the tail of `umap.log` (self-check lines).
- Output of the Test SQL: per-lang counts summing to 29,460, min/max per axis, both anti-joins = 0,
  the 5 sample rows (Talvisota fi/sv/en should be near each other).
- `/usr/bin/time -v` lines: elapsed wall time and maximum resident set size; where UMAP ran (VPS or Mac).
- Determinism check: the 3 sample rows from both runs.
- HTTP codes of :8000 and :8001 after the run.
- Open issues / assumptions.

## Failure semantics
Non-zero script exit, row count != 29,460, or any anti-join > 0 = Task failed (not a deliverable).
