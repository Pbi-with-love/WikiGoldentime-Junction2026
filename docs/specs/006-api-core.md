# Spec 006: API core (FastAPI: stars, search, article, timeline, asof, diff)

Read docs/memory/ARCHITECTURE.md first (Infrastructure: SSH command, containers, no host `mariadb`
client, `~/wikimemory/.venv`, tmux rules, "never touch the organizers' apps"; Rules: vector search,
SVT; Reuse list; API contract).

## Goal
A read-only FastAPI backend in `backend/`, running on the VPS at 127.0.0.1:8002 (tmux session `api`),
that serves the frontend build (`dist/`) and implements the seven core endpoints below with the exact
response shapes of the mock layer (`src/mock/index.js`). The contract test passes against it, then
each endpoint's mock flag is switched off.

## Depends on (start only when all are done)
- 002 db-merge: `wikihistory` on the 3307 server.
- 003 umap-coords: `wikirag.article_coord` (x, y, z for stars).
- 004 per-endpoint mock flags in `src/api.js` + contract test runnable against a real API base URL.
  Read `docs/specs/004-*.md` for the flag names and the exact contract-test command.
- 005 history-stats: `wikihistory.history_stats`, `wikihistory.month_stats`.

## Response shapes (the contract; names used in this spec)
All JSON. Timestamps in responses are ISO UTC `YYYY-MM-DDTHH:MM:SSZ`. Errors use FastAPI's default
`{"detail": "..."}` with the status code given. No field may contain mock text; data we do not have
yet is `null` (or `[]`), never invented.

1. **StarRow** — `GET /api/stars` returns `StarRow[]` (all 29,460 articles, one per (lang, page_id)):
   `{lang, page_id, wikidata_id|null, title, url, length, category|null, x, y, z, has_history,
   first_edit_year|null, event_year|null, lat|null, lon|null}`
   - `length` = `CHAR_LENGTH(article.text)` (if the 9 verbatim lengths in the contract test match
     byte `LENGTH` instead, use that and report it).
   - `x, y, z` from `article_coord`.
   - `category` = `MIN(article_category.category)` of the fi article with the same `wikidata_id`
     (the article itself when lang = 'fi'); `null` when none.
   - `has_history` = a `wikihistory.history_stats` row exists for this page_id and lang = 'fi'
     (expected 50 today). `first_edit_year` = `YEAR(history_stats.first_edit)` when `has_history`,
     else `null`.
   - `event_year` = first year matching `\b(1[0-9]{3}|20[0-2][0-9])\b` in the first 1,000 characters
     of the text after the title line (SQL `REGEXP_SUBSTR`), as a number; `null` if none.
   - `lat`, `lon` = `null` (no geo source yet).
2. **SearchResponse** — `GET /api/search?q=&lang=&limit=10`:
   `{rows: [{lang, page_id, wikidata_id|null, title, url, distance}], also: {<wikidata_id>: [[lang, title, url], ...]}}`
   - `lang` empty = all languages, else fi|sv|en. `limit` clamped to 1..50. Empty/blank `q` returns
     `{rows: [], also: {}}` without embedding.
   - `also[qid]` lists the other-language siblings of each row (from `other_languages()`), only for
     rows with a wikidata_id and at least one sibling.
3. **ArticleResponse** — `GET /api/article/{lang}/{page_id}`:
   `{lang, page_id, rev_id, wikidata_id|null, title, url, date_modified, length, words,
   reading_minutes, station_count, text, categories, other_languages, has_history, thumb_url, thumb_file}`
   - `text` = stored Markdown as is (starts with `# <title>\n`). `words` = whitespace word count of
     `text`; `reading_minutes` = `max(1, ceil(words / 240))`; `station_count` = number of lines
     starting with `## `.
   - `categories` = `article_category` rows of the fi article with the same wikidata_id (or itself),
     sorted; `[]` if none. `other_languages` = `[[lang, title, url], ...]` from `other_languages()`.
   - `thumb_url`, `thumb_file` = `null` (spec 007 fills them).
   - 404 if (lang, page_id) does not exist; 422 if lang not in fi|sv|en.
4. **GlobalTimeline** — `GET /api/timeline`: `{months: [{month: "YYYY-MM", edits, reverts, disputes}]}`
   = `month_stats` summed over all pages by month, ascending, with every month from the first month
   to the latest month present (missing months filled with zeros).
5. **ArticleTimeline** — `GET /api/timeline/{page_id}`:
   `{summary: {versions, reverts, disputes, war_months, first_edit}, months: [{month, edits, reverts, disputes}]}`
   from `history_stats` + `month_stats` for that page (months gap-filled as above). 404 if no
   `history_stats` row (e.g. 23612, any sv/en page_id).
6. **AsOfSnapshot** — `GET /api/asof/{page_id}?at=YYYY-MM-DD HH:MM:SS`:
   `{title, rev_id, user, comment, row_start, row_end|null, blocks: [["h"|"li"|"p", text], ...]}`
   - Uses the organizers' `as_of()` and `clean()`. `at` accepts `YYYY`, `YYYY-MM-DD` or the full form
     and is normalized to the full `YYYY-MM-DD HH:MM:SS` before binding (`YYYY` -> `YYYY-12-31 23:59:59`,
     date -> `00:00:00`); anything else = 422. Default `at` = now (UTC).
   - `row_end` = `null` for the current version (row_end is the max timestamp).
   - 404 if the page has no history or did not exist at `at` (e.g. 52097 at 2003-01-01).
7. **DiffResponse** — `GET /api/diff/{page_id}?from=&to=`:
   `{parts: [{op: "same", count} | {op: "edit", words: [{t: "eq"|"del"|"ins", text}]} |
   {op: "del", block: [tag, text]} | {op: "ins", block: [tag, text]}]}`
   - `from`/`to`: a value of 5+ digits is a `rev_id` of this page (looked up in
     `FOR SYSTEM_TIME ALL`); otherwise it is an `at` value resolved exactly like AsOfSnapshot.
     404 if either side cannot be resolved.
   - Port the block and word diff from the organizers' `app.py` (`~/mariadb-system-versioning-wikipedia`);
     emit the part shape above (`words[].text` keeps its whitespace so joining texts rebuilds the
     sentence; adjacent same-op words are merged, as `diffWords` in `src/mock/fixtures.js` does).

## Acceptance criteria
- [ ] `backend/` contains: `main.py` (FastAPI app), copied `rag_common.py`, `svt_common.py`,
      `history.py`, `requirements.txt` (pinned), `test_api.py` (pytest).
- [ ] Organizers' files are copied verbatim with their MIT license header kept at the top. Only allowed
      changes: connection settings (3307 server; `wikihistory` database for the SVT side) and import
      paths, each marked with a `# wikimemory: changed` comment. No rewrite of `search`, `as_of`,
      `versions`, `clean`, `other_languages`, `embed`, `connect`.
- [ ] Every DB connection runs `SET time_zone = '+00:00'` and `SET mhnsw_ef_search = 80` before use.
      Prepared SVT timestamps are bound as full `YYYY-MM-DD HH:MM:SS` strings.
- [ ] Vector search: the organizers' `search()` is used. The worker confirms it uses the subquery
      pattern (vector table alone, `ORDER BY VEC_DISTANCE_COSINE(...) LIMIT n`, JOIN outside). If it
      does not, stop and `ask` before changing anything.
- [ ] No per-request whole-history query: timeline endpoints read only `history_stats`/`month_stats`;
      asof/diff read only the requested page's versions. `/api/stars` is built once per process
      (first request or startup) and served from memory, gzip-compressed (Starlette `GZipMiddleware`).
      Mark it `# shortcut: stars cached for process lifetime, restart api after data reloads`.
- [ ] All seven shapes above are returned exactly (field names, types, nulls); no endpoint returns
      text containing "[mock]".
- [ ] `/api/*` routes are registered before `app.mount("/", StaticFiles(directory=<dist>, html=True))`;
      `curl http://127.0.0.1:8002/` returns `index.html` from the deployed `dist/`.
- [ ] Deployed on the VPS: code in `~/wikimemory/backend/`, frontend build in `~/wikimemory/dist/`,
      venv `~/wikimemory/.venv`, running in tmux session `api`, bound to 127.0.0.1:8002 only
      (`ss -ltnp | grep 8002` shows 127.0.0.1).
- [ ] `pytest backend/test_api.py` passes on the VPS (FastAPI `TestClient` against the real DB). At
      minimum: one shape check per endpoint, `at` normalization + 422, asof 404 before creation,
      diff by rev_id returns at least one `edit` part, timeline 404 for 23612, month gap-fill.
- [ ] Contract test (`src/mock/contract.test.js`, run per spec 004 against `http://127.0.0.1:8002`
      through an SSH tunnel) passes for the stars, search, article, timeline, asof/diff tests.
      Only allowed contract edits: `thumb_url`/`thumb_file` and `event_year` assertions may accept
      `null` (`x === null || typeof x === "string"` / `"number"`); the mock must still pass. Any other
      failing assertion (e.g. search distance range, Talvisota 2143/328): report real values and `ask`;
      never loosen it silently.
- [ ] After its contract test passes, each of the seven endpoints' mock flags in `src/api.js` is set to
      real (flag names from spec 004). `npm test` (mock mode) still passes and `npm run build` succeeds.
- [ ] Measured median of 3 warm runs on the VPS (`curl -s -o /dev/null -w '%{time_total}\n'`),
      targets: stars < 0.5 s, search < 2 s (includes CPU embedding), article < 0.3 s,
      timeline (both) < 0.2 s, asof < 0.5 s, diff 1256 2006 rev vs today < 2 s. Misses are reported,
      not hidden.
- [ ] tmux `app` (:8000) and `tm` (:8001) still answer after deployment.

## Assumptions
- One MariaDB server (3307) serves both databases; user `wikirag`/`wikirag` has rights on both
  (spec 002). The SVT side may use the `wikihistory` user if the copied `svt_common.py` needs it.
- `other_languages()` returns siblings by `wikidata_id`; the endpoint maps its result to
  `[lang, title, url]` triples.
- `history.as_of()` / `clean()` take the arguments the organizers' `app.py` passes them; read how
  `app.py` calls them and do the same.
- `article.date_modified` may be stored as DATETIME or string; convert to the ISO `...Z` form.
- Embedding at request time calls Ollama on 127.0.0.1:11434 with `bge-m3` and
  `{"num_ctx": 8192, "num_batch": 8192}` (through the copied `embed()`).
- The API is read-only: no tables are created or changed.

## Scope
- May edit: `backend/**` (new), `src/api.js` (only the seven endpoints' mock flag values),
  `src/mock/contract.test.js` (only the null-tolerance lines named above).
- On the VPS may create: `~/wikimemory/backend/`, `~/wikimemory/dist/`, packages in
  `~/wikimemory/.venv`, tmux session `api`.
- Must not touch: other files in `src/`, `index.html`, `scripts/`, `docs/**` (including other specs
  and `docs/memory/*`), any database schema or table data, the organizers' repos/venvs, tmux sessions
  `app`/`tm`, both containers' configuration.

## Boundaries
- Always: read ARCHITECTURE.md first; run pytest and the contract test before reporting; reuse the
  organizers' code, never rewrite it; bind to 127.0.0.1; follow docs/memory/CONVENTIONS.md.
- Ask first (via `orca orchestration ask`): dependencies beyond `fastapi`, `uvicorn` and what the
  copied organizers' files import; any schema change; changing a contract assertion other than the
  null-tolerance ones; any edit to the organizers' `search()` behaviour.
- Never: commit secrets; stop/restart containers or `app`/`tm`; bind to 0.0.0.0; return mock or
  invented text; delete failing tests.

## Open questions (defaults chosen)
- `thumb_url`/`thumb_file`: THIS spec wires them (orchestrator decision; 007 only fills the table).
  ArticleResponse (and stars, if it carries thumbs) does `LEFT JOIN wikirag.article_image` on
  (lang, page_id); if the table does not exist yet (007 not run) or has no row, return `null`.
  Contract relaxed to allow null for these two fields only.
- `event_year`: default = first year in the lead text, `null` if none (the History lens falls back to
  1900). A better source (Wikidata dates) is out of scope.
- `lat`/`lon`: always `null` until a geo source exists; the Geography lens shows no real positions.
- `category` for sv/en via the fi sibling: chosen because `article_category` is Finnish only.
- Year-only `at`/`from`/`to` resolves to the end of that year (mock used 1 Oct); frontend unaffected.
- If the real search distances fall outside the contract's 0.35–0.65 window, the orchestrator decides
  whether to change the contract.

## Approach (Hydrogen)
1. On the VPS: read the organizers' `common.py` (both repos), `history.py`, `app.py` (diff + timeline
   code, how `as_of`/`clean` are called); check `history_stats`/`month_stats`/`article_coord` exist.
2. Copy the three files into `backend/` (MIT header kept), write `main.py`, `requirements.txt`,
   `test_api.py`.
3. `npm run build`; copy `backend/` and `dist/` to the VPS; install into `~/wikimemory/.venv`; start
   tmux `api`; run pytest on the VPS.
4. Tunnel 8002, run the contract test against it; measure response times; flip the seven flags;
   rerun `npm test` (mock) and `npm run build`.

## Commands
- SSH: `ssh -i ~/.ssh/id_serverTech -o IdentitiesOnly=yes root@72.61.20.120`
- Copy: `scp -i ~/.ssh/id_serverTech -o IdentitiesOnly=yes -r backend dist root@72.61.20.120:~/wikimemory/`
- Install: `ssh ... 'cd ~/wikimemory && .venv/bin/pip install -r backend/requirements.txt'`
- Run: `ssh ... "tmux new -d -s api 'cd ~/wikimemory && set -a && . ./.env && set +a && .venv/bin/uvicorn backend.main:app --host 127.0.0.1 --port 8002 > api.log 2>&1'"`
  (`~/wikimemory/.env` already exists, mode 600, holds `ANTHROPIC_API_KEY` for specs 009/010; never
  read it into logs or reports, never overwrite it — `scp` copies only `backend` and `dist`.)
  (restart: `tmux kill-session -t api` first; only the `api` session).
- Test (VPS): `ssh ... 'cd ~/wikimemory && .venv/bin/python -m pytest -q backend/test_api.py'`
- Tunnel: `ssh -i ~/.ssh/id_serverTech -o IdentitiesOnly=yes -N -L 8002:127.0.0.1:8002 root@72.61.20.120`
- Contract vs real API: the command defined in spec 004 with base URL `http://127.0.0.1:8002`.
- Contract vs mock + build: `npm test && npm run build`
- Timing (VPS), e.g.:
  `for i in 1 2 3; do curl -s -o /dev/null -w '%{time_total}\n' 'http://127.0.0.1:8002/api/search?q=Talvisota&lang=&limit=10'; done`
- Curl samples (VPS, trimmed with `| head -c 600`): `/api/stars`, `/api/search?q=Talvisota&lang=&limit=10`,
  `/api/article/fi/1256`, `/api/timeline`, `/api/timeline/1256`,
  `/api/asof/1256?at=2006-06-01%2000:00:00`, `/api/diff/1256?from=<rev 2006>&to=<rev today>`, plus
  the 404 cases `/api/timeline/23612` and `/api/asof/52097?at=2003-01-01%2000:00:00`.

## Evidence required in worker_done
One consolidated report (per-subtask sections if the work was split):
- Files changed (repo) and files created on the VPS.
- The diff of each copied organizers' file vs its original (only `# wikimemory: changed` lines).
- pytest output (pass/fail counts).
- Contract test output against the real API (pass/fail counts, per test name) and against the mock.
- Curl sample (trimmed) and status code for every endpoint and both 404 cases.
- Median response time per endpoint (table) vs the targets.
- `/api/stars` stats: total and per-lang counts, `has_history` count, count of null `event_year`,
  null `category`.
- Mock flags flipped (names) and `npm run build` result.
- `ss -ltnp` line for 8002; HTTP codes of :8000 and :8001 after deployment.
- Open issues / assumptions (including any contract assertion that failed on real data).

## Failure semantics
Non-zero pytest exit, a failing contract test for any of the seven endpoints (other than an open
`ask`), mock text in any response, a service bound outside 127.0.0.1, or any change to `app`/`tm`
= Task failed (not a deliverable).
