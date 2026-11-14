# Spec 034: Real edit-war years on stars (remove the mock war colouring)

You are an Orca implementation worker, not the orchestrator (Claude Sonnet 5.5). Follow HYDROGEN.md and this spec.
Read docs/memory/ARCHITECTURE.md first (Rules: edit-war month = >= 3 disputes, precompute / no whole-history query
per request, mock text never presented as real; Definition of done; Infrastructure; tables `history_stats` /
`month_stats` from `scripts/history_stats.py`).

## Goal
Star edit-war colouring (the red "Edit war" pulse when the slider year is a war year) must come only from real data.
Today `getEditWarYearsForStar` in `src/scene.js` (~line 313) is a leftover mock from the 50-article era: every
`has_history` star gets 2007, even page_ids get 2006 + 2014, page_id % 3 == 0 gets 2008 + 2018, plus fixed lists for
1256/1150/52097/440. With dataset M loaded (19,285 fi stars with `has_history`) about 9,600 stars turn red at 2014.
Fix: `/api/stars` returns real `war_years` for fi stars, `src/scene.js` uses it, and the mock function is deleted.

## Facts (verified by the orchestrator)
- Deployed build `index-Cbgx6MAa.js`: slider 2014 -> almost every star red; 2013 -> white.
- Real distinct fi pages with an edit-war month (`month_stats.disputes >= 3`) per year:
  2004 1, 2005 16, 2006 43, 2007 65, 2008 67, 2009 38, 2010 44, 2011 31, 2012 34, 2013 32, **2014 44**, 2015 33,
  2016 27, 2017 44, 2018 30, 2019 41, 2020 37, 2021 40, 2022 30, 2023 28, 2024 18, 2025 15, 2026 7.
  (Counted over all of `wikihistory`; a few of these pages may have no star. See criterion 3.)
- `history_stats.war_months = 7` for Talvisota (fi 1256).
- `/api/stars` today: 29,460 rows, keys `category, created_year, event_year, first_edit_year, has_history, lang, lat,
  length, lon, page_id, title, url, wikidata_id, x, y, z`; no war data. The payload is built once per process
  (`_build_stars_payload` / `_get_stars_payload` in `backend/main.py`, cached bytes) and was 0.37-0.41 s, 1.77 MB gzip.
- `backend/neighbours.py` already has `war_years_from_months(rows)` (rows = `(month 'YYYY-MM', disputes)`, returns
  sorted years with >= 3 disputes) and already queries `wikihistory.month_stats` from the wikirag connection.
- The Talvitie road station beacon (`src/scene.js` ~line 1644, `station.history?.war_years || station.war_years`) reads
  `/api/road`, which is already real (spec 024, `neighbours.item_meta`). It is not a caller of the mock. Leave it alone.
- `isEditWarInYear` (scene ctrl, ~line 3218) has no caller outside `src/scene.js`; `window.__wikimemory.sceneCtrl`
  exposes it for verification.

## Chosen approach (no schema change)
Inside `_build_stars_payload` (runs once per process, result already cached as bytes), run ONE extra query on the same
connection: `SELECT page_id, month, disputes FROM wikihistory.month_stats WHERE disputes >= 3` (~890 rows), group by
page_id, and reuse `neighbours.war_years_from_months` (import it; do not copy it). Add `"war_years": [...]` only to
fi stars that have at least one war year; omit the key otherwise (keeps payload growth to a few KB). No per-request
query, no new table, `scripts/history_stats.py` is not touched.

## Acceptance criteria
- [ ] 1. `/api/stars` rows: `war_years` is present only on `lang == "fi"` rows with `has_history == true` and at least
      one war year; it is a sorted array of unique ints, each `>= first_edit_year` and `<= 2026`. sv/en rows never
      have it. All other keys and values are byte-identical in meaning (same 29,460 rows, same counts).
- [ ] 2. Talvisota (fi 1256) `war_years` equals the distinct years of its `month_stats` rows with `disputes >= 3`
      (7 war months). List the 7 months and the resulting years in the report.
- [ ] 3. In the browser (local preview against the real API), at slider year 2014 the number of stars with
      `sceneCtrl.isEditWarInYear(star, 2014) === true` equals the number of `/api/stars` rows whose `war_years`
      includes 2014, ±0. That number equals 44 minus any war page that has no fi star; report the SQL join count that
      proves it (`month_stats` war pages in 2014 joined with `wikirag.article` lang 'fi'). Same check for 2013 (32)
      and 2007 (65). No sv/en star is ever counted.
- [ ] 4. `getEditWarYearsForStar` is deleted; `editWarYearsByIndex[i]` comes from `s.war_years || []`. Visual
      behaviour otherwise unchanged (same shader attribute `aIsEditWar`, same pulse, same legend, same road beacons).
      `grep -n "getEditWarYearsForStar\|% 2 === 0\|% 3 === 0" src/scene.js` shows no war mock left.
- [ ] 5. Contract: `src/api.js` JSDoc of `getStars` documents `war_years` (optional, fi only, sorted ints, from
      `month_stats` disputes >= 3). `src/mock/contract.test.js` stars test asserts criterion 1 for every row that has
      the key, and under `REAL=stars,timeline` asserts that Talvisota's `war_years` equals the years of the
      `getArticleTimeline(1256)` months with `disputes >= 3` and that at least 100 stars carry `war_years`.
      Mock mode passes unchanged (mock stars have no `war_years`; that is allowed).
- [ ] 6. `/api/stars` cost before/after on the VPS (curl to 127.0.0.1:8002, warm, 5 calls each): `time_total` and
      gzip `size_download`. After must stay <= 0.5 s warm and gzip growth <= 20 KB. Also report the cold first-call
      build time (from api restart) before/after.
- [ ] 7. Tests: `npm test` green; VPS pytest `>= 89 passed` plus the new test; `REAL=stars,timeline` contract green
      against the VPS; `npm run e2e` 13/13 against the local preview. `e2e/**` is not edited.

## Assumptions
- `month_stats.month` is a `'YYYY-MM'` string (as `war_years_from_months` expects); verify with one `SELECT` first.
- History data is static (dataset M fully loaded), so the process-lifetime stars cache stays valid; restart the api
  after any future history reload (the existing shortcut comment covers this).
- A pulse is per calendar year: a star is red in year Y iff Y is in its `war_years`.

## Scope (May edit = for this worker)
- `backend/main.py`: `_build_stars_payload` (and an import of `war_years_from_months` from `backend.neighbours`,
  matching how main.py imports its other modules). Nothing else in main.py.
- `backend/test_api.py`: `test_stars_shape_counts_and_gzip` only (allow the optional `war_years` key, assert
  criterion 1 and Talvisota's years vs `month_stats`).
- `backend/tests/test_034_stars_war_years.py` (new): unit test of the grouping/attach step (fi-only, omitted when
  empty, sorted, threshold 3) without a DB, e.g. by monkeypatching the cursor or by testing a small pure helper you
  add next to `_build_stars_payload`.
- `src/api.js` (`getStars` JSDoc only), `src/mock/contract.test.js` (stars test only).
- `src/scene.js`: edit-war parts only (`getEditWarYearsForStar` removal, line ~559 assignment). Nothing else.
- Evidence: `artifacts/034/`, `artifacts/screenshots/034/`.
- Must not touch: `e2e/**`, `scripts/**`, `src/main.js` (not needed: scene reads `star.war_years` directly),
  `src/mock/**` except `contract.test.js`, `backend/neighbours.py`, `backend/road.py`, other `backend/*.py`,
  `backend/history.py`, `backend/rag_common.py`, `backend/svt_common.py`, `docs/**`, `package*.json`,
  `vite.config.js`, table schemas, container 3308, organizers' repos and tmux `app`/`tm`/`svt`.

## Boundaries
- Always: prepared statements; run all tests before reporting; before the api restart check that
  `~/wikimemory/api.log` has been quiet for 60 s and report the restart time; services bind to 127.0.0.1.
- Ask first (`orca orchestration ask`): a precomputed column/table instead of the startup query (then
  `scripts/history_stats.py` and a tmux rebuild come into scope); any change to `src/main.js` or `src/mock/stars.js`;
  any response change beyond the optional `war_years` key; new dependencies.
- Never: deploy the frontend (no `dist/` rsync; the orchestrator deploys after merge); git checkout/stash/add -A/commit;
  delete or weaken tests; keep any synthetic war years in the real path; query `month_stats` per request.

## Open questions (defaults chosen)
- Should the mock stars (`src/mock/stars.js`, has `edit_war_years` on 3 topics but never emits it) carry `war_years`
  for offline dev? Default: no; mock is out of scope and the real API is the demo path. Offline mode then shows no red.
- Omit the key vs. always send `[]`? Default: omit when empty (payload size); the frontend treats missing as `[]`.
- If the browser count at 2014 is below 44 because some war pages have no fi star: accepted, provided the SQL join
  count matches exactly.

## Commands
- SSH: `ssh -i ~/.ssh/id_serverTech -o IdentitiesOnly=yes root@72.61.20.120`
- Check month format: `docker exec mariadb-vector-wikipedia-rag-mariadb-1 mariadb -uwikirag -pwikirag wikihistory -e "SELECT page_id, month, disputes FROM month_stats WHERE page_id=1256 AND disputes>=3 ORDER BY month"`
- 2014 join count: `docker exec mariadb-vector-wikipedia-rag-mariadb-1 mariadb -uwikirag -pwikirag wikirag -e "SELECT COUNT(DISTINCT m.page_id) FROM wikihistory.month_stats m JOIN article a ON a.lang='fi' AND a.page_id=m.page_id WHERE m.disputes>=3 AND m.month LIKE '2014-%'"` (repeat for 2013, 2007)
- Cost (VPS, run BEFORE the change too): `for i in 1 2 3 4 5; do curl -s -H 'Accept-Encoding: gzip' -o /dev/null -w '%{time_total} %{size_download}\n' http://127.0.0.1:8002/api/stars; done`
- Copy backend: `scp -i ~/.ssh/id_serverTech -o IdentitiesOnly=yes backend/main.py backend/test_api.py root@72.61.20.120:/root/wikimemory/backend/` and `backend/tests/test_034_stars_war_years.py` to `/root/wikimemory/backend/tests/`.
- Restart API (VPS): `tmux kill-session -t api; tmux new -d -s api 'cd ~/wikimemory && set -a && . ./.env && set +a && .venv/bin/uvicorn backend.main:app --host 127.0.0.1 --port 8002 > api.log 2>&1'`
- Pytest (VPS): `cd ~/wikimemory && .venv/bin/python -m pytest backend/test_api.py backend/tests -q` (>= 89 passed + new)
- Contract tunnel (this spec's port): `ssh -i ~/.ssh/id_serverTech -o IdentitiesOnly=yes -N -L 18342:127.0.0.1:8002 root@72.61.20.120`
- Tests: `npm test`; `REAL=stars,timeline API_BASE=http://127.0.0.1:18342 npm test`
- Local build against the real API (vite proxies `/api` to local 8002; if local 8002 is busy, ask first):
  `ssh -i ~/.ssh/id_serverTech -o IdentitiesOnly=yes -N -L 8002:127.0.0.1:8002 root@72.61.20.120`, then
  `npm run build && npm run preview` -> `http://127.0.0.1:4173/`
- E2E: `BASE_URL=http://127.0.0.1:4173 npm run e2e` (expect 13/13). Backend must already be deployed + restarted.

## Playwright (local preview with the deployed backend; the orchestrator re-runs on the deployed build after merge)
Screenshots to `artifacts/screenshots/034/`. Record console errors and failed requests per flow (must be 0).
1. en 1280x720: load, stop the intro, set the slider to 2013 -> wait 1 s -> screenshot `01-2013.png`; in the page run
   `const w = window.__wikimemory; w.stars.filter(s => w.sceneCtrl.isEditWarInYear(s, 2013)).length` and
   `w.stars.filter(s => s.war_years?.includes(2013)).length`; both numbers equal the SQL join count.
2. Same at 2014 -> `02-2014.png` (count ±0 vs the join count, only a few dozen red stars, not thousands).
3. Same at 2007 -> `03-2007.png`.
4. Check `w.stars.filter(s => s.lang !== 'fi' && s.war_years).length === 0`.
5. fi UI: Talvitie road (existing entry) -> station beacons still red/white as before -> `04-road-fi.png`.

## Evidence required in worker_done (one consolidated report)
- Files changed (`git status`, limited to scope).
- Talvisota: its 7 war months and resulting `war_years`; the `/api/stars` row for fi 1256 (curl + jq).
- Counts table for 2013 / 2014 / 2007: SQL join count, star-data count, `isEditWarInYear` count.
- `/api/stars` before/after: warm `time_total` (5 calls), gzip bytes, cold build time; number of stars with
  `war_years`.
- `npm test` counts, VPS pytest counts, `REAL=stars,timeline` counts, `npm run e2e` result (13/13).
- Playwright flows: steps, viewport, UI language, pass/fail, console errors, failed requests, screenshot paths.
- API restart time. State clearly that the frontend was NOT deployed. Open issues and assumptions.

## Failure semantics
Non-zero test exit, e2e below 13/13, any count mismatch in criterion 3, any sv/en star with `war_years`, a remaining
synthetic war year in `src/scene.js`, a per-request `month_stats` query, or missing evidence = Task failed (not a
deliverable).
