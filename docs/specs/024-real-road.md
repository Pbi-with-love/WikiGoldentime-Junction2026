# Spec 024: A real road (and real memory threads) for every article

Read docs/memory/ARCHITECTURE.md first (Infrastructure, Rules, "Definition of done", API contract).

## Bug / goal
"See as a road" shows the same road for every article. Root cause: `src/api.js` still has
`MOCK["topic-road"] = true` and `mockGetTopicRoad()` falls back to the Talvisota fixture, whose first
event is "Porvoon valtiopäivät 1809" (fake page_id 300008). Memory threads (`MOCK.threads = true`) are
mock too and show "[mock]" under the Ask answer and as sky pills.

Goal: for any of the 29,460 stars (fi/sv/en), `GET /api/topic-road?lang=&page_id=` returns a road built
from real data for that article: the article itself plus its 12 most similar articles (one station per
Wikidata item), ordered by year, each card with real lead text, history numbers, image credit and the
reason it is on the road. `GET /api/threads/{lang}/{page_id}` returns real threads from the same
neighbour data.

**Amendment 024-A (orchestrator, after Part B merged as 72e7406):** sample roads checked on the VPS. Talvisota 1256
is clean. Hallin Janne (fi 375415) is mostly on topic (Antti Rannanjärvi, Matti Haapoja, Kustaa Nummelin, Mommilan
veriteot…) but includes unrelated films ("Kiljusen herrasväki (elokuva)", "Jäähyväiset presidentille (elokuva)",
"Veturimiehet heiluttaa"). Part A must reduce this noise with a simple, explainable rule (e.g. prefer neighbours that
share a category with the seed when enough exist in the 40-item pool, or a similarity floor) and show the before/after
station list for Hallin Janne and Talvisota in worker_done. Also handle the lead-year quirk Part B reported (a station
taking a misleading year from its lead sentence, e.g. "Suomi toisessa maailmansodassa" -> 1920): prefer event_year from
the stars data; state the rule.

**Amendment 024-B (user bug, 2026-11-14): Part A1 = threads only, ahead of the road.** User report: selecting a star
draws link lines to a few neighbours only for some stars; most stars get no lines at all. Cause (orchestrator): the
lines are memory threads (src/main.js ~543 -> sceneCtrl.setThreads); `MOCK.threads` is still true, so only the ~50 mock
fixture stars have threads, the rest get `[]`. **Part A1 (Claude Sonnet, starts as soon as spec 022 is merged):** add the
real threads route in backend/main.py using Part B's backend/threads.py, set `MOCK.threads = false`, keep the contract
shape (ghost check mock-only as Part B decided), make sure every star with neighbours gets lines (check the year filter
in main.js ~564 `filteredThreads` does not hide them all, given created_year from spec 023), deploy, and Playwright on
the deployed build: open 5 random stars (fi/sv/en) and Talvisota, each shows >= 1 line + the threads list; screenshots;
0 console errors. The road itself stays Part A2 (Hydrogen, after the 024 design).

## How the UI reaches it (no new endpoint)
- Panel button "See as a road" (`#panel-road-btn`, ui.js ~2585) -> `onEnterRoad({lang, page_id})` ->
  main.js `enterTalvitieRoad` -> `getTopicRoad({lang, page_id})`. Unchanged; only the flag flips.
- Road top-bar chips (index.html: 1256, 1150, category "Autonomian aika") and the 3 sky islands
  (scene.js ~385) keep working against the real endpoint (category mode, below).
- `GET /api/road/{lang}/{page_id}` (station-per-section road) is NOT used by the UI any more (superseded by
  `/api/summary`, the Summary Trail). It stays mock (`MOCK.road = true`), untouched. The user's
  "REAL=road" therefore means `REAL=topic-road,threads`.

## Assumptions
- Article-level vectors (`article_vector`, bge-m3, 1 row per article, multilingual) are the similarity
  source; no embedding call is needed (the seed's stored vector is the query).
- `event_year` = the same expression as `STARS_SQL` in backend/main.py (first 4-digit year 1000–2029 in
  the lead), so road years equal History-lens years. 27,664 / 29,460 stars have one.
- Per-request computation fits < 300 ms warm (one HNSW query ~17 ms + PK lookups on ≤ 40 rows). Part B
  measures this first; precompute only if it does not.
- No LLM. Card text is extractive (lead), never paraphrased.

## Split and dependencies
- **Part B (parallel, Claude Sonnet) — neighbour core + threads backend.** New files only; can start now,
  in parallel with 022/023 (own worktree `--worktree new-child`). No main.py / src/ edits.
- **Part A (Hydrogen) — road backend, routes, contract, UI, deploy, E2E.** Starts only after spec 022 is
  merged (both edit backend/main.py; 022 also edits src/scene.js) AND Part B is merged (A imports
  `backend/neighbours.py` and registers the threads route). Do not run A in parallel with 023 Part B
  (both edit backend/main.py); run it after.
- Argon design step for the small UI additions (`## Design`) can run any time before Part A.

---

## Part B (parallel, Claude Sonnet): neighbour core + threads

### B1. `backend/neighbours.py` (new)
- `nearest_items(cur, lang, page_id, pool=40) -> list[dict]`:
  1. `SELECT embedding FROM article_vector WHERE lang=? AND page_id=?` (404-worthy `None` if missing).
  2. Vector-index subquery pattern (ARCHITECTURE Rules), JOIN outside:
     ```sql
     SELECT v.lang, v.page_id, v.d, a.wikidata_id, a.title, a.url
     FROM (SELECT lang, page_id, VEC_DISTANCE_COSINE(embedding, ?) AS d
           FROM article_vector ORDER BY d LIMIT 40) v
     JOIN article a ON a.lang = v.lang AND a.page_id = v.page_id
     ORDER BY v.d
     ```
     Pass the seed embedding as the parameter; show with EXPLAIN that the vector index is used. If the
     driver cannot bind the raw bytes, use `VEC_FromText(?)` with `VEC_ToText` of the seed.
  3. Group rows by `wikidata_id` (rows without one: key `lang:page_id`); keep the smallest `d` per group;
     drop the seed's own group. Return groups in ascending `d`: `{key, wikidata_id, distance, hit_lang,
     hit_page_id}`.
- `item_meta(cur, groups, prefer_lang) -> list[dict]` for ≤ 13 groups, batched queries only (no per-row loop
  of queries beyond one per table):
  - siblings: `article` by `wikidata_id IN (...)` (index exists) -> `siblings {fi|sv|en: {page_id, title, url} | null}`,
    `lanes` = present langs in order fi, sv, en. Representative page = `prefer_lang` if present, else fi, sv, en.
  - `event_year` with the STARS_SQL expression (copy it as a constant, comment: "same as main.STARS_SQL").
  - lead text: `LEFT(text, 4000)` of the representative page -> `summary_short = compare.format_passage(text, 240)`,
    `summary_long = compare.format_passage(text, 600)` (reuse, do not copy). Must not start with "#" or the title.
  - image: first row with `non_free = 0` among representative, fi, sv, en in `article_image` -> `thumb_url`,
    `thumb_file`, and `image {thumb_url, file_page_url, license, license_url, artist, credit}` (same shape as
    `/api/article`), else nulls.
  - history (fi sibling only): `wikihistory.history_stats` -> `has_history`, `first_added_year = YEAR(first_edit)`,
    `changes = versions`, `history_stats {versions, reverts, disputes, war_months}`; `war_years` = distinct years
    of `month_stats` rows with `disputes >= 3` (ARCHITECTURE: edit-war month). Else `has_history=false`, nulls, `[]`.
  - coords: `article_coord` x, y, z of the representative page.
  - categories: fi categories of the fi sibling (`article_category`), sorted.
- CLI self-check: `python -m backend.neighbours --sample 20` picks 20 random stars (8 fi / 6 sv / 6 en,
  seeded `ORDER BY CRC32(page_id)`), runs `nearest_items` + `item_meta(12)` 5× each warm, prints
  p50 / p95 / max ms and the 12th-neighbour distance per star.
- **Decision rule:** max warm ≤ 300 ms -> compute per request (expected). Otherwise send a `question` with the
  numbers before building anything; the fallback would be `wikirag.article_neighbour(lang, page_id, rank,
  n_wikidata_id, distance)` filled by a resumable `scripts/build_neighbours.py` in `tmux new -d -s neighbours
  'nice -n 19 ...'` — schema change, needs approval.

### B2. `backend/threads.py` (new): `get_threads_response(lang, page_id, exclude: str = "")`
Contract shape (unchanged): `{"threads": [{type, target{lang, page_id, wikidata_id, title, x, y, z}, reason,
summary, first_year, removed_year}]}`, 1–4 items.
- 422 bad lang; 404 unknown article or no vector.
- `exclude` = comma list of bare page_ids or `lang:page_id` (as the mock); a group is excluded if any of its
  sibling pages matches. The source is always excluded.
- From `nearest_items` (pool 40) + `item_meta`, with Y = source event_year:
  `before` = nearest group with year < Y, `after` = nearest with year > Y, then `semantic` = nearest remaining
  until 4 (Y null -> all semantic). Output sorted by distance. Target = representative page (prefer source lang).
- `reason` is language-neutral: before `"← 1918"`, after `"1944 →"`, semantic `"≈ 69 %"` (round((1-d)*100)).
- `summary` = `compare.format_passage(lead, 200)`; `first_year = removed_year = null`; **no `ghost` type**
  (no real link history exists; the mock keeps its ghost).
- Tests `backend/tests/test_neighbours.py` (pure, no DB): grouping/dedupe by wikidata_id incl. null ids,
  seed-group drop, representative-language pick, war_years from month rows, thread type selection
  (Y null, all older, exclusion by bare id and `lang:id`), reason strings.

### Part B scope
- May edit: `backend/neighbours.py`, `backend/threads.py`, `backend/tests/test_neighbours.py` (all new).
  VPS: copy these files to `~/wikimemory/backend/`, run the CLI; do NOT restart `api` (no route yet).
- Must not touch: everything else, in particular `backend/main.py`, `src/*`, `docs/*`.

### Part B evidence (worker_done)
Files + `git diff --stat`; pytest count; EXPLAIN output; the 20-star timing table (p50/p95/max per star,
overall max) and the decision; for fi 1256, the Hallin Janne article (find it with
`curl -s "http://127.0.0.1:8002/api/search?q=Hallin%20Janne&limit=5"`) and one en star: the 12 groups
(title, year, distance, lanes) and `get_threads_response` JSON. Confirm 0 embedding / 0 LLM calls.

---

## Part A (Hydrogen): road endpoint, routes, contract, UI, deploy

### A1. `backend/road.py` (new): `get_topic_road_response(lang=None, page_id=None, category=None)`
- Article mode (`lang` + `page_id`): stations = seed + 12 nearest groups (`neighbours.nearest_items`, always
  the 12 nearest — no threshold; the similarity is shown so weak links are visible) via `item_meta(prefer_lang=lang)`.
  Seed station uses the seed page itself.
- Category mode (`category`): fi pages in `article_category` with that category or a direct child category
  (`category_link`; check whether names carry a "Luokka:" prefix), top 13 by `history_stats.versions` desc,
  then text length desc; deduped by wikidata_id. 404 if none. "Autonomian aika" must give ≥ 10 (contract);
  if fewer, send a `question` with the count.
- Order: dated stations by `event_year` asc (ties: seed first, then distance); undated stations last, by distance.
- Response (existing topic-road shape + additive fields; UI tolerates extras):
  ```json
  {"topic": {"title": "Talvisota", "lang": "fi", "page_id": 1256, "category": null},
   "eras": [{"from_year": 1918, "to_year": 1939, "label": "1918–1939"}],
   "events": [{"lang","page_id","wikidata_id","title","url","event_year","event_label",
               "lanes":["fi","sv","en"], "siblings":{"fi":{...},"sv":null,"en":{...}},
               "summary_short","summary_long","thumb_url","thumb_file","image",
               "has_history","first_added_year","changes","war_years","history_stats",
               "branches":[], "why":{"kind":"seed|similar|category","similarity":0.69,"category":"Talvisota"}}]}
  ```
  - `event_label` = `str(event_year)` or `""`. `why.similarity` = round(1-d, 2) (null for seed/category);
    `why.category` = first shared fi category of seed and station (alphabetical) or null; category mode: the category.
  - `eras`: dated stations split into min(4, n_dated) contiguous groups by index; label `"from–to"` (or one year).
  - Category mode topic: `{title: category, lang: "fi", page_id: null, category}`.
- Errors: 422 bad lang or neither page_id nor category; 404 unknown article / no vector.
- `backend/tests/test_road.py` (pure): ordering with null years, eras split (0, 1, 3, 13 dated), seed exactly once,
  no duplicate wikidata_id, why fields.

### A2. Routes in `backend/main.py` (append next to the compare route; no other change)
`from backend import road, threads` (extend the existing import line) and:
`GET /api/topic-road` (query `lang`, `page_id`, `category`) -> `road.get_topic_road_response`;
`GET /api/threads/{lang}/{page_id}` (query `exclude`) -> `threads.get_threads_response`.

### A3. Contract (`src/mock/contract.test.js`, `src/api.js`)
- threads block: wrap the hop-0 ghost assertions in `if (MOCK.threads)`; add real-only checks: every thread
  has numeric `target.x`, `type` in before/after/semantic, no "[mock]" in summary.
- topic-road block: keep existing asserts; add for both modes `getTopicRoad({lang:"sv", page_id:23612})`
  has ≥ 5 events; real-only (`if (!MOCK["topic-road"])`): for fi 1256 exactly one `why.kind==="seed"` with
  page_id 1256, no duplicate wikidata_id, dated years non-decreasing, undated only at the end, no "[mock]";
  fi 1150's event set differs from 1256's.
- After `REAL=topic-road,threads` passes: set `threads: false, "topic-road": false` in `MOCK`. `road` stays true.
- Mock fixtures unchanged and still "[mock]".

### A4. UI (`src/ui.js`, `src/i18n.js`, `src/styles.css`) — per `docs/design/024-real-road.md`
1. `isRoadEligibleArticle` -> true for any loaded article (button on every star).
2. `normalizeRoadData` (topic branch): carry `why`, `image`, `history_stats`, `siblings`; lanes from the array
   as-is (fi only when present).
3. Lane dots / coverage: fi dot only when the station has fi; for a non-fi station the coverage text names
   the other present languages, or "Only in {lang} Wikipedia" (new key).
4. Card "why" line under the title: seed / similar ({pct} %) / same category ({category}); hidden when `why`
   is missing (mock fixtures).
5. Memory badge: `fmtNumber` for the count; add reverts · disputes when `history_stats` exists.
6. Thumb caption: when `st.image` exists, fill it with the existing `renderImageCreditCaption` (after
   innerHTML); else the current Commons fallback.
7. New i18n keys fi/sv/en for 3–5 above only.
No change to scene.js or main.js is expected; if one is unavoidable, ask first.

### A5. Deploy (VPS) and E2E
- Copy `backend/road.py`, `backend/main.py` to `~/wikimemory/backend/`; check `~/wikimemory/api.log` quiet
  for 60 s, then restart `api` once (command below) and say when.
- `npm run build`, rsync dist per ARCHITECTURE, show the served `assets/index-` hash.

### Part A scope
- May edit: `backend/road.py` (new), `backend/tests/test_road.py` (new), `backend/main.py` (import line +
  2 routes only), `src/api.js` (MOCK line only), `src/mock/contract.test.js` (threads + topic-road blocks only),
  `src/ui.js` (A4 only), `src/i18n.js` (new keys), `src/styles.css` (why/stats line only),
  `artifacts/screenshots/024-real-road/`, `artifacts/024-real-road/`.
- Must not touch: `docs/memory/*`, `docs/specs/*`, `docs/design/*`, `backend/summary.py`, `backend/ask.py`,
  `backend/history.py`, `backend/compare.py`, `backend/rag_common.py`, `backend/neighbours.py` /
  `backend/threads.py` (Part B's; send a `question` if they need a fix), the stars route, `src/mock/index.js`,
  fixtures, `src/scene.js`, `src/main.js`, any table schema or rows, container 3308, organizers' repos and
  tmux `app`/`tm`.

---

## Acceptance criteria
- [ ] (B) Timing table for 20 random stars; max warm ≤ 300 ms or a `question` before any table.
- [ ] (B) `backend/tests/test_neighbours.py` green; threads JSON for 3 articles, no "[mock]", no ghost.
- [ ] (A) `curl` JSON of `/api/topic-road` for: Hallin Janne (page_id/lang found via search), Talvisota fi 1256,
      the real "Porvoon valtiopäivät/maapäivät" article (found via search; report the title), 1 random sv and
      1 random en star — 5 different, sensible roads (no Porvoo 1809 fixture unless it is genuinely similar).
- [ ] (A) Quality table (station title, year, why) for Hallin Janne, 1256 and the sv star; any odd station
      explained (e.g. lead year is a birth year).
- [ ] (A) Every event: real lead text (no "[mock]", not the title, not starting with "#"), one per wikidata_id,
      lanes correct, history fields only for items with a fi page in history_stats, image only if non_free = 0.
- [ ] (A) Endpoint warm time on the VPS (median of 5) for the 5 roads, each < 300 ms; threads likewise.
- [ ] (A) pytest (test_road + test_neighbours + full `backend/tests/`) green; `npm test` mock green;
      `REAL=topic-road,threads` green; MOCK flags flipped; `npm run build` OK; dist deployed (hash shown).
- [ ] (A) **Definition of done — Playwright E2E on the DEPLOYED build** (VPS :8002 via tunnel on local port
      18062; no vite dev for this run), all flows below pass, 0 console errors, 0 failed requests,
      screenshots per state.

## Boundaries
- Always: read ARCHITECTURE.md first; prepared statements; vector-index subquery pattern; `SET mhnsw_ef_search`
  via the existing session init; reuse `compare.format_passage`; run tests before reporting.
- Ask first (`orca orchestration ask`): any new table/index (incl. the precompute fallback), new dependency,
  response-shape change beyond the additive fields above, edits outside scope.
- Never: embedding or LLM calls; whole-history queries per request (only `history_stats` / `month_stats`);
  presenting mock text as Wikipedia; deleting or weakening tests (gating the ghost assertion to mock mode is
  the only allowed change); touching 3308 or the organizers' apps.

## Open questions (defaults chosen)
- Similarity threshold? Default: none, always 12 nearest; similarity shown on the card. Revisit if the quality
  table shows junk tail stations.
- Category boost in ranking? Default: no; shared category is only shown in `why` (one explainable rule).
- Station language: the seed's language when the item has it, else fi > sv > en. Not the UI language.
- Branches ("road from here") from each station: default skipped (`branches: []`); easy follow-up.
- Ghost threads: dropped in real mode (no link history in the data).
- Undated stations go to the road's end without a year marker (scene.js already treats a null year as the
  previous year, so no gap is drawn).

## Design (UI specs only)
Brief for Argon; write `docs/design/024-real-road.md` only. Follow `docs/design/001-kaamos-sky.md` and
`docs/design/013-i18n.md` (language-dot rule, sentence case, no ALL-CAPS). Small additions to the existing
road card (ui.js `renderRoadCards`, `.road-card is-nearest`), no new screens:
1. "Why on this road" line under the card title: seed ("This article"), similar ({pct} %), same category
   ({category} — Finnish category names, shown as-is). Placement, token, size; quiet, one line, wraps at 340 px.
2. Reverts · disputes next to/inside the memory badge (badge already: "Added {year}, changed {count} times";
   count is now versions, e.g. 2,143).
3. Lane coverage for non-fi stations ("Only in Swedish Wikipedia", "Also in Finnish, English").
4. Image credit line on the card thumb, reusing the panel caption style (`panel.imageCredit`).
5. Exact fi/sv/en strings for 1–3.
Hydrogen implements from the handoff; Hydrogen's May edit excludes `docs/design/`.

## Commands
- SSH: `ssh -i ~/.ssh/id_serverTech -o IdentitiesOnly=yes root@72.61.20.120`
- Tunnel (this spec's port): `ssh -i ~/.ssh/id_serverTech -o IdentitiesOnly=yes -N -L 18062:127.0.0.1:8002 root@72.61.20.120`
- Part B CLI (VPS): `cd ~/wikimemory && .venv/bin/python -m backend.neighbours --sample 20`
- Pytest (VPS): `cd ~/wikimemory && .venv/bin/pytest backend/tests/test_neighbours.py backend/tests/test_road.py -q`, then `.venv/bin/pytest backend/tests -q`
- EXPLAIN: `docker exec mariadb-vector-wikipedia-rag-mariadb-1 mariadb -uwikirag -pwikirag wikirag -e "EXPLAIN SELECT ..."`
- Restart API (VPS): `tmux kill-session -t api; tmux new -d -s api 'cd ~/wikimemory && set -a && . ./.env && set +a && .venv/bin/uvicorn backend.main:app --host 127.0.0.1 --port 8002 > api.log 2>&1'`
- Samples (VPS): `curl -s "http://127.0.0.1:8002/api/topic-road?lang=fi&page_id=1256" | python3 -m json.tool`,
  `curl -s "http://127.0.0.1:8002/api/threads/fi/1256?exclude=" | python3 -m json.tool`
- Timing (VPS): `for i in 1 2 3 4 5; do curl -s -o /dev/null -w '%{time_total}\n' "http://127.0.0.1:8002/api/topic-road?lang=fi&page_id=1256"; done`
- Contract: `npm test`; `REAL=topic-road,threads API_BASE=http://127.0.0.1:18062 npm test` (tunnel up)
- Build/deploy: `npm run build`; `rsync -az --delete -e "ssh -i ~/.ssh/id_serverTech -o IdentitiesOnly=yes" dist/ root@72.61.20.120:/root/wikimemory/dist/`;
  VPS `curl -s http://127.0.0.1:8002/ | grep assets/index-`
- Local dev while building UI only (optional): vite on port 5186 with a temp config outside the repo proxying
  `/api` to `http://127.0.0.1:18062`. The final E2E run is on `http://127.0.0.1:18062/` (deployed build).

## Playwright (deployed build, `http://127.0.0.1:18062/`)
Screenshots to `artifacts/screenshots/024-real-road/`; record console errors and failed requests per flow.
1. UI fi: search "Hallin Janne" -> open star -> "Näytä tienä" -> road loads, first card + year markers ->
   `01-hallin-janne-fi.png`; step Next twice -> `02-hallin-janne-step-fi.png` (why line, lanes, badge visible).
2. UI en: open fi 1256 Talvisota -> "See as a road" -> `03-talvisota-en.png`; a station with an image ->
   credit caption -> `04-talvisota-credit-en.png`.
3. UI en: a random en (or sv) star -> "See as a road" -> `05-random-en.png`; its titles differ from flows 1–2.
4. UI fi: road top-bar chip "Autonomian aika" (category mode) -> `06-category-fi.png`.
5. UI en: Ask "How did the Winter War end?" -> memory threads under the answer show real titles and
   `← year` / `year →` / `≈ %` reasons, no "[mock]" anywhere on the page -> `07-ask-threads-en.png`;
   click a thread target -> its article opens.
6. Failure: block `/api/topic-road*` -> "See as a road" shows the network error, sky still usable ->
   `08-road-blocked.png`.

## Evidence required in worker_done
One consolidated report per Part (A and B are separate workers):
- Files changed + `git diff --stat`; pytest counts; `npm test` counts mock and `REAL=topic-road,threads`;
  `npm run build` result; deployed hash; API restart time.
- Part B: items listed under "Part B evidence".
- Part A: the 5 trimmed `curl` roads (topic + first 3 events + event count each), threads sample for 1256,
  the quality table for 3 roads, timings (median of 5) per road and threads, the `src/api.js` MOCK diff.
- Playwright: per flow the steps, UI language, pass/fail, console error count (0), failed request count (0),
  screenshot paths 01–08.
- Confirmation: 0 embedding calls, 0 LLM calls, no table created or changed.
- Open issues / assumptions.

## Failure semantics
Any of these means the Task failed (not a deliverable):
- A non-zero pytest, `npm test` (mock or REAL) or `npm run build` exit.
- Any warm road or threads request ≥ 300 ms without a reported `question`.
- Two of the 5 sample roads with the same event set, or any "[mock]" text in real mode.
- Missing Playwright evidence on the deployed build, any console error or failed request in flows 1–5.
- Any embedding/LLM call, a new table without approval, or a touch to 3308 / `app` / `tm`.
- Part A started before spec 022 and Part B are merged.
