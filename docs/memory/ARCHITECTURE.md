# Architecture — wikimemory

Facts every spec and worker relies on. README.md has the product story.

## Product in one paragraph
A 3D galaxy of Finnish-history Wikipedia articles (Vite + vanilla JS + three.js). Click a star →
"Summarize": the article as 3D cards, one per section, plus ghost sections (removed in the past).
"Through time" reads any article as of any date, with edits, reverts and edit wars per month.
"Ask" gives a cited answer and how that answer changed over the years. A topic road ("Talvitie")
offers related articles to keep reading. Judges are the authors of the organizers' repos.

## Infrastructure (Ubuntu 24.04 VPS, 2 vCPU, 7.8 GB RAM + 4 GB swap, no GPU, 76 GB disk free)
- SSH: `ssh -i ~/.ssh/id_serverTech -o IdentitiesOnly=yes root@72.61.20.120` (plain `ssh root@...`
  is rejected). `scp` takes the same `-i ... -o IdentitiesOnly=yes` flags.
- Both MariaDB servers are Docker containers. There is **no `mariadb` client on the host**: use
  `docker exec [-i] <container> mariadb -u<user> -p<pass> <db>`.
  - `mariadb-vector-wikipedia-rag-mariadb-1`: 127.0.0.1:3307->3306, database `wikirag`,
    user/pass `wikirag`/`wikirag`.
  - `mariadb-system-versioning-wikipedia-mariadb-1`: 127.0.0.1:3308->3306, database `wikihistory`,
    user/pass `wikihistory`/`wikihistory`. Keep it running (the organizers' time machine uses it).
  - **Merged (spec 002):** `wikihistory` (50 articles, 31,848 versions, `WITH SYSTEM VERSIONING`
    and `INVISIBLE` `row_start`/`row_end`) now also lives on the 3307 server alongside `wikirag`
    (both `wikirag` and `wikihistory` have `ALL PRIVILEGES ON wikihistory.*`), so one SQL
    statement can join vectors with `FOR SYSTEM_TIME`. Container 3308 remains the source for
    reloads; after loading full dataset M into 3308, rerun the merge in tmux with
    `tmux new -d -s merge 'bash ~/wikimemory/db_merge.sh merge > ~/wikimemory/merge.log 2>&1 && bash ~/wikimemory/db_merge.sh verify >> ~/wikimemory/merge.log 2>&1'`
    (and check parity anytime with `bash ~/wikimemory/db_merge.sh verify`).
- Organizers' apps run in tmux: `app` (RAG search, 127.0.0.1:8000), `tm` (time machine,
  127.0.0.1:8001). **Never stop, restart or edit them**, nor their repos/venvs.
- Dataset M: FULLY loaded 2026-11-14 into 3307 `wikihistory` (19,742 fi articles / 862,076 versions;
  19,285 of them also in wikirag). 3308 keeps the organizers' 50 (their `tm` reads it); our backend uses 3307 only.
  3307 CPU cap: `docker update --cpus 0` does NOT clear a cap, use `--cpus 2`.
- Our own Python on the VPS: `~/wikimemory/` with its own `.venv` (never the organizers' venvs).
- Ollama on 127.0.0.1:11434, model `bge-m3`; always `{"num_ctx": 8192, "num_batch": 8192}`.
  Request-time embedding only on the VPS (CPU). Bulk embedding (chunks, spec 008) runs
  on the Mac (local Ollama bge-m3, same digest as VPS `790764642607`) through an SSH tunnel to 3307;
  never bulk-embed on the VPS (measured ~3.6 s per 300-word chunk on 2 vCPU).
- Organizers' repos on the server: `~/mariadb-vector-wikipedia-rag`, `~/mariadb-system-versioning-wikipedia`
  (each with its own `.venv`).
- Every service binds to 127.0.0.1; access through SSH tunnel. Docker ignores ufw: publish ports as
  "127.0.0.1:PORT:3306". Long jobs: `tmux new -d -s NAME 'command'`.
- Backend target: FastAPI on 127.0.0.1:8002, also serving the frontend build (`dist/`).
  **Frontend deploy (every spec that changes src/, index.html or styles):** `npm run build` locally, then
  `rsync -az --delete -e "ssh -i ~/.ssh/id_serverTech -o IdentitiesOnly=yes" dist/ root@72.61.20.120:/root/wikimemory/dist/`
  (no api restart needed). Check `curl -s http://127.0.0.1:8002/ | grep assets/index-` on the VPS shows the new hash.
  Layout: frontend at the repo root (index.html, src/, vite.config.js -> dist/), backend in backend/ + scripts/.

## Schemas
wikirag (dataset S, current text):
- `article(lang, page_id, rev_id, wikidata_id, title, url, date_modified, text)`, PK (lang, page_id).
  page_id unique only within a language. text = Markdown starting with "# <title>"; sections are "##".
  Counts: fi 19,285 / sv 4,921 / en 5,254. 410 without wikidata_id. 2,919 topics in all three languages.
- `article_vector(lang, page_id, model, truncated, embedding VECTOR(1024))`, VECTOR INDEX M=16 cosine.
- `category_link(parent, child)`, `article_category(lang, page_id, category)`: Finnish categories only.
- Vectors also as Parquet: `~/mariadb-vector-wikipedia-rag/data/vectors-bge-m3-{fi,sv,en}.parquet`
  (lang, page_id, model, truncated, embedding list<float32>[1024]).

wikihistory (dataset M, Finnish only):
- `article(page_id PK, title, rev_id, user, comment, minor, sha1, len, text MEDIUMTEXT COMPRESSED)`
  WITH SYSTEM VERSIONING; `row_start`/`row_end` INVISIBLE = real Wikipedia edit times (UTC).
  `KEY (page_id, row_start)`. Also `article_list`.
- Loaded now: 50 articles, 31,848 versions. Full: ~19,750 articles, ~862,000 versions (5–7 GB).
- Join key: wikihistory.page_id = wikirag.page_id where lang = 'fi'.

## Reuse, don't rewrite (copy into backend/, keep MIT header)
- `rag_common.py` ← `~/mariadb-vector-wikipedia-rag/common.py`: connect(), embed(), search(), other_languages()
- `svt_common.py` ← `~/mariadb-system-versioning-wikipedia/common.py`
- `history.py` ← `~/mariadb-system-versioning-wikipedia/history.py`: as_of(), versions() (is_revert,
  undid_anonymous), clean() (wikitext → blocks ["h"|"li"|"p", text])
- Diff and month-timeline logic: port from `~/mariadb-system-versioning-wikipedia/app.py`.
- Evaluation: `~/mariadb-vector-wikipedia-rag/evaluate.py` + `data/test-questions.tsv` (37 questions).

## Definition of done (user rule, 2026-11-14) — applies to every spec, Hydrogen and Claude workers
- A feature ships only after a **Playwright end-to-end run of every user flow the spec touches, on the DEPLOYED
  build** (VPS :8002 serving the new dist/ through an SSH tunnel on your own local port), in the UI languages the
  flow supports — not only `vite dev`, not only curl. Backend-only changes that show up in the UI count as UI flows.
- worker_done lists each flow (steps, UI language, pass/fail), console errors (must be 0), failed requests (must be 0),
  and screenshot paths under artifacts/screenshots/<spec-id>/. Missing Playwright evidence = not done; the
  orchestrator sends the task back.

## Rules
- Vector search: subquery on the vector table alone (`ORDER BY VEC_DISTANCE_COSINE(...) LIMIT n`),
  then JOIN outside; a flat join is ~50× slower. `SET mhnsw_ef_search = 80` per session.
- SVT: `SET time_zone = '+00:00'`; prepared `TIMESTAMP ?` needs full "YYYY-MM-DD HH:MM:SS".
- Revert = sha1 equals an earlier version but not the previous one. Dispute = revert that undid a named
  user (not IPv4, IPv6 or "~2026-..." temporary account). Edit-war month = >= 3 disputes.
- Precompute heavy aggregates into tables; never whole-history queries per request.
- LLM: only from the text given; every fact keeps its source sentence; JSON with fixed schema;
  cached in MariaDB (summaries keyed by lang, page_id, rev_id). The demo never waits for a live LLM call.
- Mock text marked "[mock]". Wikipedia text CC BY-SA 4.0: link back (`?curid=` / `?oldid=`);
  images credited to Commons.

## API contract
Source of truth: `src/api.js` + `src/mock/contract.test.js`, all under `/api/...`:
stars · search · article/{lang}/{page_id} · timeline (+ /{page_id}) · asof/{page_id} ·
diff/{page_id} · summary/{lang}/{page_id} · ask · threads/{lang}/{page_id} · road.
Each endpoint switches from mock to real on its own flag, after the contract test passes against it.

## New tables (backend)
| Table | DB | Used by | Built by |
|---|---|---|---|
| `article_coord(lang, page_id, x, y, z)` | wikirag | stars | `scripts/umap_coords.py` |
| `article_image(lang, page_id, file_name, thumb_url, license, artist, license_url, non_free, credit_checked_at)` | wikirag | article | `scripts/fetch_images.py` (`--credits-only` for credits; UA = repo URL) |
| `history_stats(page_id, first_edit, versions, reverts, disputes, war_months)` | wikihistory | stars, timeline | `scripts/history_stats.py` |
| `month_stats(page_id, month, edits, reverts, disputes)` | wikihistory | timeline | `scripts/history_stats.py` |
| `global_month_stats(month, edits, reverts, disputes)` | wikihistory | timeline (global) | `scripts/history_stats.py` |
| `chunk`, `chunk_vector` | wikirag | search, ask | `scripts/chunk.py`, `scripts/embed_chunks.py` |
| `summary_cache(lang, page_id, rev_id, ui, json, source_hash)` | wikirag | summary | on demand + pre-warm; ui='' = default row; ui rows = translations of the default (source_hash = sha256 of the default JSON, mismatch -> re-translate) |
| `answer_cache(q_hash, q, ui, json, model, source_hash)` | wikirag | ask | same rule: ui variant = translation of the default answer, never a rebuild |
| `section_history(page_id PK, rev_id, svt_rev_id, end_year, ..., json)` | wikihistory | summary (history + ghosts, history_status) | `scripts/section_history.py` (19,285 rows, resumable, no LLM) |
| `chunk_vector_hist` (system-versioned, research only) | wikirag | none (Way B spike, kept for inspection) | `scripts/wayb_build.py` |
| `snapshot_chunk_vector` | wikirag | Way B source | `scripts/snapshot_vectors.py` |

Multilingual rule: native first (sv/en sibling by `wikidata_id` is its own source of truth), translation of
the fi result second (label "Machine-translated from Finnish Wikipedia"); edit history only from fi.
Cross-language compare: `GET /api/compare/fi/{page_id}` on request (best sv/en chunk per fi section,
cosine threshold 0.35, see docs/memory/research/compare-threshold.md).

Chunking: split by "##", then ~300 words with ~50 overlap, prefix "Title — Section"; articles shorter
than one chunk reuse their existing article vector (≈12,870 of 19,285 fi); ≈22,800 chunks to embed.