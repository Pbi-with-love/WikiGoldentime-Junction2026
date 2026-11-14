# Spec 008: Section chunks + chunk vectors, and hit@k before/after

Read docs/memory/ARCHITECTURE.md first (Infrastructure: SSH command, container names, no host `mariadb`
client, Ollama bge-m3 options, "bulk embedding on a Mac through an SSH tunnel", tmux rules, "never touch
the organizers' apps"; Schemas; Rules: vector-search subquery pattern; Chunking paragraph).

> **Orchestrator decision (2026-11-14, final) — split VPS / Mac:**
> - **VPS (now, cheap):** `chunk.py` fills `chunk`, and single-chunk articles get their existing
>   article vector copied into `chunk_vector` in SQL. **No bulk embedding on the VPS** (2 vCPU,
>   measured ~3.6 s per chunk; it would slow every other worker and the API). Stop any VPS embed job.
> - **Mac (user runs it):** `embed_chunks.py` runs on the user's Mac with local Ollama bge-m3,
>   writing to 127.0.0.1:3307 through
>   `ssh -i ~/.ssh/id_serverTech -o IdentitiesOnly=yes -N -L 3307:127.0.0.1:3307 root@72.61.20.120`.
>   Resumable: skips chunks that already have a vector. Mac bge-m3 digest must equal the VPS's
>   (`790764642607`); the script checks `ollama list`/`/api/tags` and refuses on mismatch.
>   Options: `--pages-from small` (first batch) or `--all`; `--lang`.
> - **Small batch first:** chunks of the articles behind the 37 test questions (`data/test-questions.tsv`
>   answer pages) + the 50 `wikihistory.article_list` articles. Early hit@k: `eval_chunks.py --partial`
>   ranks by chunk vectors where a page has them, else its article vector; labelled "partial" in output.
> - The worker delivers the exact Mac commands (Ollama install/pull, venv, tunnel, run, resume) in
>   `scripts/EMBED_ON_MAC.md`, and tests the Mac script itself on a handful of chunks only if a Mac
>   Ollama is available; otherwise test against the VPS Ollama through a tunnel with `--limit 5`.

## Goal
Split every `wikirag.article` into section chunks, embed them with bge-m3 on the Mac, store them in
`wikirag.chunk` + `wikirag.chunk_vector`, then measure retrieval on the organizers' 37 test questions:
article-level vs chunk-level hit@5/hit@10 (optional: hybrid with FULLTEXT). The before/after table is a
headline result for the judges (organizers' README: 76% top-5 / 86% top-10; president-fact questions
miss). These tables are the base for Ask with answer history (spec 010) and the later Way B spike
(system-versioned `chunk_vector`).

## Acceptance criteria
Chunker (`scripts/chunk.py`)
- [ ] Reads `wikirag.article` (all langs: fi, sv, en) and writes `wikirag.chunk`. Rules, in order:
  1. Split `text` on lines starting with `## ` (exactly two hashes; `###` and deeper stay inside their
     section). Text before the first `## ` (minus the `# <title>` line) is the intro, section = NULL.
  2. Drop sections whose heading (trimmed, case-insensitive) is in this fixed list (reference/link
     noise): fi `Lähteet`, `Viitteet`, `Kirjallisuutta`, `Aiheesta muualla`, `Katso myös`; sv `Källor`,
     `Referenser`, `Noter`, `Externa länkar`, `Se även`; en `References`, `Notes`, `External links`,
     `See also`, `Further reading`. Drop sections with 0 words.
  3. Short article: if the remaining words of the whole article are <= 300, emit ONE chunk
     (chunk_no 0, section NULL, `text` = the article's `text` unchanged, `reused = 1`); its vector is
     copied from `article_vector`, not re-embedded.
  4. Otherwise per section: words = `body.split()`; window 300 words, step 250 (50 overlap); window
     starts are `range(0, max(len(words) - 50, 1), 250)`; a section of <= 300 words is one chunk.
  5. Each chunk's stored `text` = prefix + `"\n\n"` + window words joined by a space, where prefix =
     `"<title> — <section>"` (U+2014 em dash, spaces around) or `"<title>"` for the intro. `text` is
     exactly the string that gets embedded.
  6. `chunk_no` = 0..n-1 per (lang, page_id) in document order; deterministic (rerun = same rows).
- [ ] `python3 scripts/chunk.py --selftest` runs without a DB: asserts on a synthetic article covering
      intro, `###` inside a section, a dropped `Lähteet` section, an empty section, a 700-word section
      (expect 3 windows: starts 0, 250, 500), the short-article path, and the em-dash prefix. Exit 0.
- [ ] Re-run safety: creates the tables if missing; if `chunk` is non-empty it exits non-zero unless
      `--rebuild`, which drops and recreates BOTH `chunk_vector` and `chunk` (chunk_no would shift).

Tables (pre-approved, listed in ARCHITECTURE "New tables"; no other schema change)
- [ ] `chunk(lang, page_id, chunk_no SMALLINT UNSIGNED NOT NULL, rev_id, section VARCHAR(255) NULL,
      words SMALLINT UNSIGNED NOT NULL, reused TINYINT(1) NOT NULL DEFAULT 0, text TEXT NOT NULL,
      PRIMARY KEY (lang, page_id, chunk_no))`. `lang`, `page_id`, `rev_id` types copied from
      `SHOW CREATE TABLE wikirag.article`; `rev_id` = the article's rev_id at chunk time.
- [ ] `chunk_vector(lang, page_id, chunk_no, model, embedding VECTOR(1024) NOT NULL,
      PRIMARY KEY (lang, page_id, chunk_no), VECTOR INDEX (embedding) M=16 DISTANCE=cosine)`;
      `model` type and the VECTOR INDEX clause copied from `SHOW CREATE TABLE wikirag.article_vector`.
- [ ] Way B compatibility: both tables plain InnoDB, no foreign keys, no triggers, no partitioning, no
      generated columns, no columns named `row_start`/`row_end`, explicit PK; so a later
      `ALTER TABLE chunk_vector ADD SYSTEM VERSIONING` needs no other change. Do NOT add versioning now.

Embedder (`scripts/embed_chunks.py`, runs on the Mac)
- [ ] Connects through an SSH tunnel (`--db-host 127.0.0.1 --db-port 3307` defaults) and to local
      Ollama `http://127.0.0.1:11434/api/embed`, model `bge-m3`,
      `options: {"num_ctx": 8192, "num_batch": 8192}`, batches of `--batch 16` texts.
- [ ] First step: for `reused = 1` chunks, `INSERT ... SELECT` the vector from `article_vector`
      (same lang, page_id; chunk_no 0) in SQL, no round-trip through Python.
- [ ] Resumable: each loop selects up to `--batch` chunks with no `chunk_vector` row
      (`LEFT JOIN ... WHERE cv.page_id IS NULL ORDER BY lang, page_id, chunk_no`), embeds, inserts,
      commits. Killing it (Ctrl-C) and restarting continues where it stopped; no duplicates (PK).
- [ ] Embedding request and vector insert format match the organizers' code: read `embed()` and the
      loader that fills `article_vector` in `~/mariadb-vector-wikipedia-rag/` (any prefix/normalisation,
      `VEC_FromText(...)` or binary) and do the same, so query vectors from their `embed()` are
      comparable. The Mac's `ollama list` digest for `bge-m3` must equal the VPS's; if not, stop and ask.
- [ ] Prints progress (done/total, chunks/s, ETA) every ~30 s and a final line with total wall time.
- [ ] End state: `COUNT(chunk_vector) = COUNT(chunk)`, anti-join 0 both ways, one distinct `model`.

Evaluation (`scripts/eval_chunks.py`, runs on the VPS in `~/wikimemory/.venv`)
- [ ] Baseline: run the organizers' `evaluate.py` unchanged (their repo, their venv, read-only, just
      executed) on `data/test-questions.tsv`; record hit@5/hit@10. It should be close to the README's
      76% / 86%; if not, report the difference before going on.
- [ ] Chunk-level: reuse `evaluate.py`'s question loading, hit definition and scoring by importing it
      (`sys.path` insert of the organizers' repo; never copy-edit or modify their files) and swap only
      the retrieval function, e.g. by monkeypatching the search function it calls. If `evaluate.py`
      cannot be driven that way (e.g. it calls the :8000 HTTP app), ask first before writing scoring code.
- [ ] Chunk retrieval = top 50 chunks by vector, grouped to articles by best (smallest) distance, first
      k distinct articles; same language filter as their search. SQL (subquery on the vector table
      alone, then join; `SET mhnsw_ef_search = 80` per session):
      `SELECT c.lang, c.page_id, MIN(c.d) d FROM (SELECT lang, page_id, chunk_no,
      VEC_DISTANCE_COSINE(embedding, VEC_FromText(?)) d FROM chunk_vector ORDER BY d LIMIT 50) c
      GROUP BY c.lang, c.page_id ORDER BY d LIMIT ?`
      (add the lang filter the way their `search()` does it). This query is what spec 010 reuses.
- [ ] Output: a Markdown table to stdout and `~/wikimemory/eval_chunks.md`:
      `| method | hit@5 | hit@10 | median query ms |` for `article (evaluate.py)`, `chunk`, and (if
      done) `hybrid`; then the list of questions that changed (miss→hit, hit→miss) with their text.
- [ ] Optional hybrid (only after the above is done): `FULLTEXT KEY (text)` on `chunk` (pre-approved),
      top 50 by `MATCH(text) AGAINST(? IN NATURAL LANGUAGE MODE)`, fused with the vector top 50 by
      reciprocal rank fusion (k = 60) at chunk level, then grouped to articles as above.

## Assumptions
- Chunk counts: ARCHITECTURE estimates ≈12,870 of 19,285 fi articles short and ≈22,800 fi chunks to
  embed; sv/en add more. Report actual numbers; they are a sanity check, not a criterion.
- All three languages are chunked so the chunk-level eval covers the same articles as the
  article-level baseline. If embedding all three exceeds ~4 h on the Mac, embed fi first
  (`--lang fi`), run the eval on what exists, report it as partial, and ask.
- Article vectors were embedded from (possibly truncated) full text; reuse is only for short articles,
  where `article_vector.truncated` should be 0 (assert; report any exceptions).
- Mac has Ollama installed; `ollama pull bge-m3` is allowed. Mac Python env outside the repo:
  `python3 -m venv ~/.venvs/wikimemory` + the organizers' DB driver (same as their `common.py`).
  No new dependency beyond that driver; HTTP via stdlib `urllib`.
- DB connection settings mirror `~/mariadb-vector-wikipedia-rag/common.py` connect() (user/db
  `wikirag`, 127.0.0.1:3307). `chunk.py` may run on the Mac through the tunnel too (light work).
- Independent of specs 004–007, 009; spec 010 depends on this one.

## Scope
- May edit: `scripts/chunk.py`, `scripts/embed_chunks.py`, `scripts/eval_chunks.py` (all new);
  `scripts/requirements.txt` (append the DB driver if missing; create if absent).
- On the VPS may create: tables `wikirag.chunk`, `wikirag.chunk_vector` (and the optional FULLTEXT
  key on `chunk`); files under `~/wikimemory/` (script copies, logs, `eval_chunks.md`).
- Must not touch: `src/`, `index.html`, `backend/`, `docs/`, other specs, other `scripts/*` files, any
  existing `wikirag`/`wikihistory` table (`article`, `article_vector` are read-only), the organizers'
  repos/venvs/Parquet/`evaluate.py`, tmux sessions `app` and `tm`, both containers' configuration.

## Boundaries
- Always: run `--selftest` and the SQL checks below before reporting; follow docs/memory/CONVENTIONS.md.
- Reuse the organizers' code (here: `evaluate.py` scoring, `embed()` request format, connect settings,
  vector insert format); never rewrite it.
- Precompute: chunks and vectors are built once into tables; nothing here runs per request.
- Bulk embedding never on the VPS CPU (only the 37 eval queries are embedded there).
- Ask first (via `orca orchestration ask`): new dependencies, schema changes beyond the two tables and
  the optional FULLTEXT key, writing own scoring code, Ollama digest mismatch.
- Never: commit secrets; stop or restart containers or the `app`/`tm` sessions; publish any port
  beyond 127.0.0.1; delete failing tests.

## Open questions (defaults chosen)
- Chunk sv/en too, or fi only? Default: all three (fair comparison with the article-level baseline);
  fi-first fallback above.
- Drop reference/link sections? Default: yes (fixed list above); they add noise and embed cost.
- Store chunk text with the prefix? Default: yes, exactly the embedded string (spec 010 feeds it to the
  LLM; the prefix gives it title and section).
- Hybrid is optional; the judges' headline is article vs chunk.

## Approach (Hydrogen)
1. On the VPS: `SHOW CREATE TABLE` for `article` and `article_vector`; read the organizers'
   `common.py` (connect, embed, search), their vector loader and `evaluate.py`; `ollama list` digest.
2. Write `chunk.py` with `--selftest`; make it pass; run it (Mac through the tunnel or VPS).
3. Open the tunnel on the Mac, check the digest, run `embed_chunks.py`; interrupt once after a few
   batches and restart to prove resumability.
4. `scp` `eval_chunks.py` to `~/wikimemory/`; run baseline + chunk eval (+ optional hybrid).

## Commands
- SSH: `ssh -i ~/.ssh/id_serverTech -o IdentitiesOnly=yes root@72.61.20.120`
- Tunnel (Mac, keep open): `ssh -i ~/.ssh/id_serverTech -o IdentitiesOnly=yes -N -L 3307:127.0.0.1:3307 root@72.61.20.120`
  (if local 3307 is busy, use `-L 13307:...` and `--db-port 13307`).
- Self-test: `python3 scripts/chunk.py --selftest`
- Chunk: `~/.venvs/wikimemory/bin/python scripts/chunk.py --db-port 3307`
- Embed: `/usr/bin/time -l ~/.venvs/wikimemory/bin/python scripts/embed_chunks.py --db-port 3307 2>&1 | tee embed.log`
- Copy: `scp -i ~/.ssh/id_serverTech -o IdentitiesOnly=yes scripts/eval_chunks.py root@72.61.20.120:~/wikimemory/`
- Baseline (VPS): `cd ~/mariadb-vector-wikipedia-rag && .venv/bin/python evaluate.py` (with the args its
  usage requires for `data/test-questions.tsv`)
- Chunk eval (VPS): `cd ~/wikimemory && .venv/bin/python eval_chunks.py`
- Test SQL (VPS): `docker exec mariadb-vector-wikipedia-rag-mariadb-1 mariadb -uwikirag -pwikirag wikirag -e "SELECT lang, COUNT(DISTINCT page_id) articles, COUNT(*) chunks, SUM(reused) reused, AVG(words) avg_words, MAX(words) max_words FROM chunk GROUP BY lang WITH ROLLUP; SELECT COUNT(*) FROM chunk_vector; SELECT COUNT(*) FROM chunk c LEFT JOIN chunk_vector v USING (lang, page_id, chunk_no) WHERE v.page_id IS NULL; SELECT COUNT(*) FROM chunk_vector v LEFT JOIN chunk c USING (lang, page_id, chunk_no) WHERE c.page_id IS NULL; SELECT COUNT(*) FROM article a LEFT JOIN chunk c USING (lang, page_id) WHERE c.page_id IS NULL; SELECT COUNT(DISTINCT model) FROM chunk_vector; SELECT chunk_no, section, words, LEFT(text, 80) FROM chunk WHERE lang='fi' AND page_id=1256; SHOW CREATE TABLE chunk_vector\G"`
  (the article→chunk anti-join should be 0; any article with no chunk must be listed and explained).

## Evidence required in worker_done
One consolidated report (per-step evidence if split):
- Files changed.
- `--selftest` output (exit 0).
- Test SQL output: per-lang articles/chunks/reused/avg/max words, `chunk_vector` count, both
  anti-joins = 0, article→chunk anti-join, distinct model = 1, Talvisota (fi 1256) chunk list,
  `SHOW CREATE TABLE chunk_vector`.
- Embedding: Mac model, total wall time, chunks/s, and the resume proof (count before kill, count
  after restart, final count = chunk count). Ollama digest on Mac and VPS.
- Eval table (`eval_chunks.md`) with the baseline vs README numbers and the changed questions; median
  chunk-query latency on the VPS.
- HTTP codes of :8000 and :8001 after the run.
- Open issues / assumptions.

## Failure semantics
Non-zero self-test or script exit, `chunk_vector` count != `chunk` count, any vector anti-join > 0, or
no eval table = Task failed (not a deliverable). A chunk-level score lower than the baseline is NOT a
failure: report it honestly.
