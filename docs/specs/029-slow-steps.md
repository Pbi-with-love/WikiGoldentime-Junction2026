# Spec 029: Fast "As of", 2006 card and article panel (cache /api/asof + /api/diff)

Read docs/memory/ARCHITECTURE.md first (Definition of done, Rules: no whole-history query per request).
Source: docs/memory/research/demo-dryrun-3.md, bug 3.

## Goal
Make the three slow demo clicks fast on the deployed build by caching `/api/asof` and `/api/diff`, which have no
cache today. Each click must finish well under 500 ms once warm. Reuse the existing `history.as_of`, `_clean_blocks`,
`_diff_blocks` and `_resolve_diff_side` code and change only how results are kept.

## Why these three clicks are slow (read from the code, measure to confirm)
- `src/main.js` `openStarArticle` runs `getArticle` -> `getArticleTimeline` -> `getAsOf(page, "<year>-12-31")` ->
  `getDiff(page, asof.rev_id, article.rev_id)` one after another and only then opens the panel. The panel, and with it
  the image credit, therefore waits for asof (~0.8 s) + diff (~1 s). This one function serves "As of 2006", the
  Talvisota panel and the end of the 2006 card click.
- The 2006 card click (`selectMilestone`) calls `getDiff(page, ms.rev_id, today_rev)`, then `openStarArticle`.
- Server side, each call reads `FOR SYSTEM_TIME` rows and runs `history.clean()` (a per-character Python loop) over the
  whole wikitext, and `/api/diff` also runs a block + word diff. Nothing is cached.

## Acceptance criteria
- [ ] **Profile first.** Split the server time of `/api/asof/1256?at=2006-12-31` and
      `/api/diff/1256?from=1862876&to=<today rev>` into SQL, `clean`, and diff, and add the split to the report.
- [ ] **Cache.** Add an in-process cache in `backend/main.py` (default: `functools.lru_cache(maxsize=256)` on helpers
      that build the response dict):
      - asof: key `(page_id, normalized moment)`. Skip the cache when `at` is missing (the moment is "now").
      - diff: key `(page_id, from, to)` (raw params after `.strip()`).
      - Errors (404/422) are never cached. `lru_cache` already behaves this way for raised exceptions; a test proves it.
      - Add a one-line comment `# shortcut: process-lifetime cache, restart api after data reloads` (same rule as stars).
      - Response shapes stay byte-identical (no API contract change).
- [ ] **Startup pre-warm.** In `lifespan`, start a daemon thread (never block startup) that fills the cache for
      Talvisota fi 1256: asof at `2006-12-31` and `2026-12-31`, plus diff `1862876 -> today` and `2114325 -> today`,
      where "today" is `wikirag.article.rev_id` for fi 1256. Log failures and continue; a failure must not crash the api.
      This means a restart by another worker (027) does not leave the stage cold.
- [ ] **Server timings on the VPS** (curl, median of 5): before (current api) and after (warm): asof 1256 @2006, diff
      1862876→today (the hero 2006 card), diff 2114325→today, article fi 1256. Warm target: each ≤ 100 ms.
      Also give one cold number for a non-demo article (e.g. fi 440 @2010), before and after. It is allowed to stay slow.
- [ ] **UI timings, deployed build** (Playwright, see below). Measure click to visible result, warm, each **< 500 ms**:
      (1) hero 2006–2020 card click -> word diff shown; (2) Through Time "As of 2006" -> 2006 text + "Edited by Höyhens";
      (3) Talvisota search result click -> image credit line visible. Give before and after numbers. If a target is missed
      only because of the serial fetch chain in `src/main.js`, do not edit it: send a `question` with the measured split.
- [ ] Tests: new `backend/tests/test_asof_diff_cache.py` with a fake cursor/connection (monkeypatch `_open_svt`): the second
      identical asof/diff call opens no DB connection and returns the same JSON; a 404 is not cached; `at=None` is not
      cached. Existing pytest stays green.
- [ ] Contract: `REAL=asof,diff` contract test passes against the deployed api.
- [ ] No new table, no schema change, no whole-history query, no frontend change.

## Assumptions
- History data is static (dataset M fully loaded). A data reload needs an api restart, as for `/api/stars`.
- Memory: 256 entries × ~100–300 KB worst case ≈ < 80 MB. That fits the 7.8 GB VPS. If one Talvisota entry is
  > 1 MB, report it and lower maxsize.

## Scope
- May edit: `backend/main.py` (asof/diff routes, new cached helpers, lifespan pre-warm only),
  `backend/tests/test_asof_diff_cache.py` (new), `artifacts/screenshots/029/`, `artifacts/029/` (timing notes).
- Must not touch: `backend/compare.py`, `scripts/calibrate_compare.py` (spec 027 is editing them now), any other
  `backend/*.py`, `backend/history.py` (organizers' code, import only), `src/**`, `index.html`, `scripts/**`,
  `docs/**`, table schemas/rows, container 3308, organizers' repos and tmux `app`/`tm`.

## Boundaries
- Always: read ARCHITECTURE.md first; prepared statements; run pytest before reporting; check `~/wikimemory/api.log` is
  quiet for 60 s before the one api restart (027 may restart it too) and report the restart time.
- Ask first (`orca orchestration ask`): a MariaDB cache table, any frontend edit, any response-shape change, new deps.
- Never: git checkout/stash/add -A/commit; edit `docs/memory/*`; delete or weaken tests; stop the organizers' apps.

## Open questions (defaults chosen)
- Persistent cache table instead of in-process? Default no: the pre-warm thread covers restarts and needs no schema.
- Parallelise `getArticleTimeline` and `getAsOf` in `openStarArticle`? Default no (spec 031 edits `src/main.js`). This
  is a follow-up only if the UI numbers miss 500 ms.

## Commands
- SSH: `ssh -i ~/.ssh/id_serverTech -o IdentitiesOnly=yes root@72.61.20.120`
- Tunnel (this spec's port): `ssh -i ~/.ssh/id_serverTech -o IdentitiesOnly=yes -N -L 18292:127.0.0.1:8002 root@72.61.20.120`
- Copy: `scp -i ~/.ssh/id_serverTech -o IdentitiesOnly=yes backend/main.py backend/tests/test_asof_diff_cache.py` to
  `root@72.61.20.120:/root/wikimemory/backend/` (tests into `backend/tests/`).
- Restart API (VPS): `tmux kill-session -t api; tmux new -d -s api 'cd ~/wikimemory && set -a && . ./.env && set +a && .venv/bin/uvicorn backend.main:app --host 127.0.0.1 --port 8002 > api.log 2>&1'`
- Pytest (VPS): `cd ~/wikimemory && .venv/bin/python -m pytest backend/tests/test_asof_diff_cache.py -q`, then
  `.venv/bin/python -m pytest backend/test_api.py backend/tests -q` (expect 82+ passed plus the new tests)
- Today's rev: `docker exec mariadb-vector-wikipedia-rag-mariadb-1 mariadb -uwikirag -pwikirag wikirag -e "SELECT rev_id FROM article WHERE lang='fi' AND page_id=1256"`
- Timing (VPS): `for i in 1 2 3 4 5; do curl -s -o /dev/null -w '%{time_total}\n' "http://127.0.0.1:8002/api/asof/1256?at=2006-12-31"; done`
  (same loop for each diff URL and `/api/article/fi/1256`)
- Contract: `npm test`; `REAL=asof,diff API_BASE=http://127.0.0.1:18292 npm test` (tunnel up)

## Playwright (deployed build, `http://127.0.0.1:18292/`, 1280×720)
Screenshots go to `artifacts/screenshots/029/`. Record console errors and failed requests per flow, and time each click
from click to the expected element (`performance.now()` around `click` + `waitFor`). Run each flow once right after the
api restart plus pre-warm, and again warm. Run the "before" pass on the current api before deploying.
1. en: wait for slider 2026 -> chip **How did the Winter War end?** -> click the **2006–2020** card -> word diff
   ("Word diff against today") visible -> `01-hero-2006-card-en.png`.
2. en: search `talvisota` -> *Talvisota* -> **Through Time** -> **As of 2006** -> "Edited by Höyhens on 29 Dec 2006"
   visible -> `02-asof-2006-en.png`; repeat in fi UI (**Suomi**) -> `03-asof-2006-fi.png`.
3. en: search `talvisota` -> click *Talvisota* -> image credit line ("Image: …") visible -> `04-panel-credit-en.png`.

## Evidence required in worker_done
- Files changed (`git status` limited to the scope above).
- Profile split (SQL / clean / diff) and a before/after table: endpoint curl medians and UI click times (cold + warm).
- Pytest counts (new file + full suite), `npm test` + `REAL=asof,diff` counts.
- API restart time and the pre-warm log line(s) from `api.log`.
- Playwright: each flow with steps, UI language, pass/fail, console errors (0), failed requests (0), screenshot paths.
- Open issues and assumptions.

## Failure semantics
Non-zero test exit, a warm UI click ≥ 500 ms, or missing Playwright evidence = Task failed (not a deliverable).
