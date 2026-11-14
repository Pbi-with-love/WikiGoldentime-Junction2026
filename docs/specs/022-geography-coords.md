# Spec 022: Real coordinates for the Geography lens

Read docs/memory/ARCHITECTURE.md first.

## Bug
The sky's Geography lens (scene.js `posGeography`, `latLonToGeoPoint`, Finland outline) shows an empty map: every star
falls into the "unlocated" cluster. Root cause (verified by the orchestrator): `GET /api/stars` hard-codes
`"lat": None, "lon": None` (backend/main.py ~line 277) and no coordinate table exists in wikirag. The mock had coords,
so it looked fine in development. History lens is fine (event_year on 27,664 / 29,460 stars).

## Goal
Fill lat/lon from Wikidata for every star whose item has a location, so the Finland map lens shows real places.

## Acceptance criteria
- [ ] New table `wikirag.article_geo(wikidata_id PK, lat DOUBLE, lon DOUBLE, source ENUM('P625','P276'), checked_at)`
      via migration `backend/scripts/migrate_022_article_geo.sql` (approved). Rows also for items with no coordinate
      (lat/lon NULL, so a resume skips them).
- [ ] Script `scripts/fetch_geo.py`: distinct wikidata_ids from wikirag.article; Wikidata `wbgetentities`
      (ids batched 50, props=claims) — take P625 (first preferred/normal value). For items without P625, collect
      their P276 (location) item ids and fetch those items' P625 in a second batched pass (source 'P276').
      Resumable (skip checked ids), polite: same User-Agent constant as scripts/fetch_images.py (repo URL contact),
      maxlag=5, sleep between batches, one sequential process, run on the VPS in tmux with nice -n 19.
      Report: ids, requests, runtime, coverage % (P625 / P276 / none), and how many fall inside the map box
      lat 59.5–70.5, lon 19.0–33.5 (Finland incl. ceded Karelia).
- [ ] `/api/stars` returns lat/lon from article_geo (LEFT JOIN by wikidata_id) — one query, keep the response shape;
      stars outside the map box keep their coords (the frontend decides). Measure /api/stars time (was ~0.3 s, gz 1.7 MB);
      must stay < 1 s.
- [ ] Frontend: stars with coords outside the map box must go to the unlocated cluster (check scene.js; minimal
      change if needed) — no star may be drawn far off the map.
- [ ] Tests: backend/test_api.py stars test asserts lat/lon present for a known place (e.g. Helsinki's article) and
      null for a known non-place; contract test unchanged shape (npm test mock + REAL=stars via tunnel on 18032).
- [ ] Playwright screenshot of the Geography lens on the real API (vite on 5182, temp config outside the repo),
      then `npm run build` + deploy dist per ARCHITECTURE (show served hash).

## Scope
May edit: backend/main.py (stars route only), backend/test_api.py (stars test only), scripts/fetch_geo.py (new),
backend/scripts/migrate_022_article_geo.sql (new), src/scene.js (geography bucket only, if needed).
VPS: run the migration and the fetch; deploy main.py and restart the `api` tmux once (spec 020 worker may also
restart it: check ~/wikimemory/api.log quiet for 60 s first and say when). Must not touch backend/summary.py,
backend/ask.py, backend/compare.py, docs/, organizers' app/tm, container 3308. Never edit docs/memory/*.

## Evidence (worker_done)
Coverage numbers, request count/runtime, /api/stars timing before/after, test counts, screenshot path, deployed hash.
