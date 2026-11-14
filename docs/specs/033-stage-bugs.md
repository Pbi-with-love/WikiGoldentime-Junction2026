# Spec 033: Stage bugs from dry run 4 (slow As of, language-switch reload, sv count, 390 px legend)

You are an Orca implementation worker (Claude Sonnet 5.5), not the orchestrator. Follow HYDROGEN.md and this spec.
Read docs/memory/ARCHITECTURE.md first (Definition of done, Frontend deploy, Rules, multilingual rule), then
docs/memory/research/demo-dryrun-4.md (table + "Remaining bugs"), docs/specs/028-lang-switch-everywhere.md,
029-slow-steps.md, 030-mobile-map.md, 031-lang-switch-summary-card.md and docs/DEMO.md.

## Goal
Fix the four bugs that a judge would see on stage, most visible first. Bug 1 is backend, bug 2 and 4 are frontend,
bug 3 is investigate-then-maybe-fix. Each bug is a separate checkpoint: finish, test and record evidence for one before
starting the next. If a bug is blocked, record why and go on to the next one. Do not leave a half-done edit.

## Bug 1: intermittent slow `/api/asof` and `/api/diff` (backend)
Facts: spec 029 put `functools.lru_cache(maxsize=256)` on `_get_asof_cached(page_id, moment)` and
`_get_diff_cached(page_id, from, to)` in `backend/main.py`, plus a pre-warm thread for fi:1256 in `lifespan`. The VPS
runs ONE uvicorn process (tmux `api`, port 8002), so a per-worker cache is not the cause. Warm calls usually take
70–300 ms, but about 1 click in 3 takes 1.3–2.6 s (server TTFB) on the same URL. VPS load was 0.01, so it is not CPU load.

**Profile first. Do not guess.** Candidate causes to measure, not to assume:
- a cache miss (the URL the browser sends normalises to another key than the pre-warm, or the entry was evicted);
- FastAPI re-encoding the large cached dict (`jsonable_encoder`) and GZip on every request, on the event loop;
- threadpool wait: sync handlers queue behind other sync work (Ask 3 s auto-poll, summary/ask background tasks,
  `/api/stars`), or GIL contention with a CPU-bound background task;
- MariaDB connection open or lock wait (should be zero on a hit);
- gen-2 GC pauses over the large cached object graph.

Steps:
1. Find the exact URLs the UI sends for the 3 demo clicks (browser network log on the local build). These are the
   "3 demo clicks": **As of 2006** (`/api/asof/1256?at=…2006…`), **As of 2012** (`/api/asof/1256?at=…2012…`) and the
   **2006–2020 card** (`/api/diff/1256?from=1862876&to=<today rev>`).
2. Add temporary timing logs (one log line per request with: cache hit/miss, time waiting before the handler starts,
   handler time, SQL, `clean`, diff, encode, total; plus `gc.callbacks` timing of gen-2 collections). Put them behind
   the env var `WM_TIMING=1` (off by default), or remove them before reporting. Deploy to the VPS (see Commands).
3. Reproduce on the VPS (curl to 127.0.0.1:8002, no tunnel): 30 calls of each of the 3 URLs, 1–8 s random gaps, while
   a second loop calls the hero Ask `/api/ask?q=How%20did%20the%20Winter%20War%20end%3F&ui=en` every 3 s (the
   auto-poll) and `/api/stars` once a minute. Record TTFB (`%{time_starttransfer}`) and the timing log lines.
4. Name the measured cause (with the log lines that prove it) and fix that cause in `backend/main.py`. Example fixes,
   only if the measurement points to them: cache the encoded JSON bytes and return `Response(content=…,
   media_type="application/json")` (body must stay byte-identical); `gc.freeze()` after the pre-warm; a lock so two
   concurrent misses do not both build; fix the cache key. Keep `# shortcut: process-lifetime cache, restart api after
   data reloads`. Keep the 029 rules: errors (404/422) are never cached, `at` missing / `to` missing is never cached.
5. Repeat step 3 after the fix.

## Bug 2: language switch in the Summary Trail reloads the whole galaxy (frontend)
Facts: `setLang()` (src/i18n.js) does `location.reload()`. After the reload the app fetches `/api/stars` + global
timeline, builds the scene, then `restoreViewState` (src/main.js) reopens the trail (031 waits up to 3 s for compare).
On stage: 4–10 s blank page with "Laddar…", the slider shows 2001, then the trail reopens on the right card.

**Decision (default): keep the reload and make the restore fast.** Why: `lang` is a module-level `const` in
src/i18n.js, imported by 6 files, and translated strings are written into the DOM and 3D labels when they are created.
Re-rendering in place means touching almost every view, the night before the demo. The reload path is already
proven by 028/031. Keep the sessionStorage view state (028) and `cardRef` mapping (031) unchanged as the mechanism.

Steps:
1. Measure first. Add `performance.mark` from the language-button click to the trail card visible after the reload:
   unload, HTML/JS load, `getStars` (bytes and ms), global timeline, scene build, summary fetch, compare wait,
   trail open. Measure on the built bundle (`npm run build && npm run preview`) through the tunnel (5 runs, warm).
2. Cut the biggest parts. Options, in order of preference. Use only the ones your numbers need:
   - Start the restore fetches (summary `?ui=` and compare for fi pages) at boot, in parallel with `getStars` and the
     global timeline. Do not run them after the scene is built.
   - Apply the saved slider year before the first paint. Never start the intro sweep when a saved view state exists,
     so the slider never shows 2001 on a restore.
   - If `getStars` dominates: keep the stars response across the reload with the browser Cache Storage API
     (`caches.open`, frontend only, available on 127.0.0.1/localhost and https). Write it before the reload, read it
     once on a restore, then delete it. Fall back to the network on any error.
   - Do not show the full-page loading state on a restore if the scene can draw first.
3. Remove or gate the marks (no console output in production).
4. If the numbers show that 1.5 s cannot be reached with a reload (for example, the scene build alone takes more than
   1.5 s), stop and send a `question` with the measured split before you start an in-place re-render.

## Bug 3: sv hero says "changed 4 times", en and fi say 3 (investigate, maybe backend)
Facts: sv native chip answer: "Baserat på Wikipedia (engelska, svenska, finska)", periods 2003–2004 / 2005 /
2006–2008 / 2009–2025 (Peltimikko, 6 Dec 2009) / 2026 (Jesper Vire, 9 Sep 2026). en: 2003–2004 / 2005 / 2006–2020 /
2021–2026. fi: 2003–2004 / 2005 / 2006–2010 / 2011–2026. The rule (ARCHITECTURE, DEMO "What we learned"): a milestone
needs a change in the numbers of the cited source sentences between FOR SYSTEM_TIME snapshots. LLM rewording is not a
change. The en and fi hero 2006 milestone must stay oldid 1862876 (Whiskey~fiwiki).

Steps:
1. Dump the `answer_cache` rows (default and ui rows) for the en, fi and sv hero questions. For each milestone, list
   year, changed_by (user, oldid), the cited source sentences, and the numbers that `material_tokens` / `change_holds`
   saw change. Find which sentences the sv answer cites that en/fi do not, and why (different retrieved passages:
   sv question → different chunks/articles).
2. Classify each extra or shifted sv milestone (2006–2008 end, 2009 Peltimikko, 2026 Jesper Vire):
   - **Real**: a real number change in a real cited fi source sentence at that revision (check the two snapshot texts).
     Then do not change code. Write it in the report, and update the presenter note in docs/DEMO.md
     ("Language question from judges" bullet) with one sentence of the reason.
   - **Artifact**: for example a number from markup, a reference, a footnote or date formatting, a token compared on
     the LLM `facts[].text` instead of the source sentence, or a whitespace/locale difference. Then fix it in
     the milestone code of `backend/ask.py`, add a failing-then-passing test, and rebuild only the affected sv hero
     rows. First save the old JSON to `artifacts/033/`.
3. After any rebuild: en and fi hero rows unchanged (diff the JSON), 2006 → 1862876 in both.

## Bug 4: geography legend overlaps the south of the map at 390 px (frontend, cosmetic)
At 390×844 the `.legend` ("Finnish Swedish English Edit war") and "Edits per month" sit on Helsinki/Viipuri, and the
east edge touches the screen border. Fix it either way: the 030 framing helper in `src/scene.js` uses the top of the
legend (real rect) as the bottom of the safe area, or the legend moves/compacts on narrow viewports in `src/styles.css`.
Pick the smaller change. 1280×720 must not change. The 030 checks (all labels inside viewport, no overlap with
header/timeline) must still hold.

## Acceptance criteria
- [ ] **Bug 1:** cause named with timing-log evidence. After the fix, 30 repeated VPS curl calls of each of the 3 demo
      URLs under the Ask-poll load from step 3: **all < 500 ms** TTFB. Report p50 / p95 / max per URL, before and after.
      Responses are byte-identical to before (compare `sha256sum` of each body before and after). New or extended test
      in `backend/tests/` covers the fix (e.g. the cached path returns identical bytes, errors not cached).
- [ ] **Bug 2:** in the Summary Trail, fi *Moskovan rauha* (Osio 5/13) → **Svenska** → the trail reopens on
      *Fredsavtalet* in **≤ 1.5 s** from click (median of 5, warm, built bundle via tunnel), the slider shows the saved
      year the whole time (never 2001), and no blank "Loading…" page is shown longer than 0.5 s. **English** from there
      → *Soviet breakthrough in February*, same limits. The 028/031 restores still work (road station, Ask hero, panel,
      ghost/overview/fiHistory mapping). The sessionStorage restore stays as the fallback when the faster path fails.
- [ ] **Bug 3:** report with the per-milestone table (step 1) and the verdict real/artifact per milestone. If it is an
      artifact: fixed and tested, the sv row is rebuilt, and en/fi are unchanged with 2006 → 1862876. If it is real:
      no code change and the DEMO.md note is updated.
- [ ] **Bug 4:** at 390×844 en and fi, the legend and "Edits per month" do not intersect the projected map outline
      bbox, and the outline is ≥ 8 px from every viewport edge. 1280×720 is unchanged (same outline bbox ±4 px).
- [ ] `npm test` green (31+ tests; add tests for new pure logic). VPS pytest `>= 89 passed`, plus new tests.
      REAL contract tests pass against the VPS api: `REAL=asof,diff,ask` (and `summary,compare,stars` if bug 2 changes
      how they are called).
- [ ] No API contract change, no schema change, no new dependency, no new i18n string.

## Assumptions
- One uvicorn process on the VPS. History data is static (dataset M fully loaded).
- Cache Storage is available at `http://127.0.0.1:<port>` (a secure context). The stage uses the tunnel to 127.0.0.1.
- The sv hero chip sends a Swedish question, so it has its own `answer_cache` default row (native answer). It is not
  a translation of the en row.

## Scope (May edit = for this worker)
- Bug 1: `backend/main.py` (asof/diff helpers, routes, lifespan pre-warm, timing logs), `backend/tests/test_033_*.py`
  (new), existing `backend/tests/test_asof_diff_cache.py` (extend only).
- Bug 2: `src/main.js` (boot sequence, `restoreViewState`, `enterSummaryTrail`, `captureViewState`, loading state),
  `src/ui.js` (language-switch handler and loading overlay only), `src/i18n.js` (`setLang`, view-state helpers),
  `src/i18n.test.js`, `src/api.js` only for a stars-cache read path that keeps the same function signature and
  response shape (ask first if you need more).
- Bug 3: `backend/ask.py` (milestone detection only: `material_tokens`, `change_holds`, `scan_change_window`,
  `build_milestones` and helpers they call), `backend/tests/test_033_*.py`, `answer_cache` rows of the sv hero only
  (after a JSON backup), `docs/DEMO.md` ("Language question from judges" bullet only).
- Bug 4: `src/styles.css` (`.legend` and timeline mobile rules), `src/scene.js` (030 geography framing helper only).
- Evidence: `artifacts/033/`, `artifacts/screenshots/033/`.
- Must not touch: `e2e/**`, `docs/memory/*`, `docs/specs/*`, `package.json`, `package-lock.json`, `vite.config.js`,
  `src/mock/**`, `backend/history.py`, `backend/rag_common.py`, `backend/svt_common.py` (organizers' code), other
  `backend/*.py`, `scripts/**`, table schemas, container 3308, the organizers' repos and tmux `app`/`tm`/`svt`.

## Boundaries
- Always: profile before fixing (bugs 1 and 2); prepared statements; run `npm test` and VPS pytest before reporting;
  before the api restart check that `~/wikimemory/api.log` is quiet for 60 s; report the restart time and the
  pre-warm log line. Every service binds to 127.0.0.1.
- Ask first (`orca orchestration ask`): an in-place re-render instead of the reload; any backend change for bug 2 or 4
  (for example a `Cache-Control` header on `/api/stars`); `src/timeslider.js` edits; a cache table; any response-shape
  change; rebuilding more than the sv hero rows; new deps.
- Never: deploy the frontend (`dist/` rsync is the orchestrator's step after merge); git checkout/stash/add -A/commit;
  delete or weaken tests; change the en/fi hero milestones; call a live LLM on the stage path; present mock text as
  real.

## Open questions (defaults chosen)
- Re-render in place instead of reload? Default **no** (see bug 2, reason). Ask first with numbers if 1.5 s is out of
  reach.
- Keep the timing logs? Default: keep behind `WM_TIMING=1`, off by default (useful for the next dry run).
- If the bug 1 cause is only another worker's load (e.g. an E2E run), the fix must still keep the 3 URLs < 500 ms
  under the Ask-poll load. Report what the other load was.
- The sv 2026 milestone (Jesper Vire, 9 Sep 2026): if real, should the sv chip be removed from DEMO.md? Default: no,
  keep it as the language-question backup with a one-line reason.

## Commands
- SSH: `ssh -i ~/.ssh/id_serverTech -o IdentitiesOnly=yes root@72.61.20.120`
- Tunnel for contract tests (this spec's port): `ssh -i ~/.ssh/id_serverTech -o IdentitiesOnly=yes -N -L 18332:127.0.0.1:8002 root@72.61.20.120`
- Tunnel for the local build (vite.config.js proxies `/api` to local 8002; if local 8002 is busy, ask first):
  `ssh -i ~/.ssh/id_serverTech -o IdentitiesOnly=yes -N -L 8002:127.0.0.1:8002 root@72.61.20.120`, then
  `npm run build && npm run preview` → `http://127.0.0.1:4173/` (preview reuses `server.proxy`). `npm run dev` is fine
  while you code, but take bug-2 timings on preview.
- Copy backend (bugs 1/3 only): `scp -i ~/.ssh/id_serverTech -o IdentitiesOnly=yes backend/main.py backend/ask.py root@72.61.20.120:/root/wikimemory/backend/`
  (tests into `/root/wikimemory/backend/tests/`).
- Restart API (VPS): `tmux kill-session -t api; tmux new -d -s api 'cd ~/wikimemory && set -a && . ./.env && set +a && .venv/bin/uvicorn backend.main:app --host 127.0.0.1 --port 8002 > api.log 2>&1'`
  (prefix `WM_TIMING=1` inside the quotes while profiling, restart without it at the end).
- Pytest (VPS): `cd ~/wikimemory && .venv/bin/python -m pytest backend/test_api.py backend/tests -q` (expect >= 89 passed).
- Today's rev: `docker exec mariadb-vector-wikipedia-rag-mariadb-1 mariadb -uwikirag -pwikirag wikirag -e "SELECT rev_id FROM article WHERE lang='fi' AND page_id=1256"`
- TTFB loop (VPS): `for i in $(seq 30); do curl -s -o /dev/null -w '%{time_starttransfer}\n' "<url>"; sleep $((RANDOM%8+1)); done`
- Answer rows: `docker exec mariadb-vector-wikipedia-rag-mariadb-1 mariadb -uwikirag -pwikirag wikirag -e "SELECT q, ui, model, LENGTH(json) FROM answer_cache WHERE q LIKE '%inter%ar%' OR q LIKE '%interkrig%' OR q LIKE '%alvisota%'"`
- Tests: `npm test`; `REAL=asof,diff,ask API_BASE=http://127.0.0.1:18332 npm test`

## Playwright (local build via tunnel; the orchestrator re-runs on the deployed build after merge)
Screenshots go to `artifacts/screenshots/033/`. Record console errors and failed requests per flow (must be 0).
1. en 1280×720: hero chip **How did the Winter War end?** → **2006–2020** card → "Word diff against today", 10 times
   with reloads between; Talvisota **Through Time** → **As of 2006** / **As of 2012**, 10 times each. Click→content
   times (all < 500 ms + tunnel overhead, report raw) → `01-asof-2006.png`, `02-card-2006.png`.
2. fi: search `talvisota` → *Talvisota* → **Tiivistä** → **Seuraava** to **Osio 5 / 13** *Moskovan rauha* →
   **Svenska** (time to *Fredsavtalet*, slider year screenshot taken mid-switch) → **English** (time to *Soviet
   breakthrough in February*) → `03-fi.png`, `04-mid-switch.png`, `05-sv.png`, `06-en.png`.
3. 028/031 regression: road station 5 fi → en, Ask hero en → fi, overview → Suomi, ghost card → English → `07-*.png`.
4. sv: **Svenska** → sv hero chip → count line + periods → `08-sv-hero.png` (and en/fi for comparison).
5. 390×844 en and fi: **Geography** → legend and map outline bbox numbers → `09-geo-390-en.png`,
   `10-geo-390-fi.png`; 1280×720 en → `11-geo-1280-en.png`.

## Evidence required in worker_done (one consolidated report, one section per bug)
- Files changed (`git status`, limited to scope) per bug, and which checkpoints are done / blocked.
- Bug 1: the timing-log lines that show the cause, the fix, a p50/p95/max table before and after for the 3 URLs
  (30 calls each, under load), body sha256 before and after, api restart time, pre-warm log line.
- Bug 2: the before/after split (stars, scene, summary, compare, total), the chosen approach and why, the 5-run click →
  card times for sv and en, and the year shown mid-switch.
- Bug 3: per-milestone table for en/fi/sv, verdict, and either the fix + test + JSON diff of the rebuilt row (en/fi
  unchanged, 2006 → 1862876) or the DEMO.md diff.
- Bug 4: outline and legend rects at 390 (en, fi) and 1280, before/after.
- `npm test` counts, VPS pytest counts, REAL contract counts.
- Playwright flows: steps, viewport, UI language, pass/fail, console errors, failed requests, screenshot paths.
- Open issues and assumptions. State clearly that the frontend was NOT deployed.

## Failure semantics
Non-zero test exit, any of the 3 demo URLs ≥ 500 ms in the after run, a bug-1 fix without a measured cause, a bug-2
switch over 1.5 s or showing 2001 without a `question` sent, an en/fi hero milestone changed, or missing evidence for a
bug marked done = Task failed (not a deliverable). A bug marked "blocked" with its reason and measurements is
acceptable. The orchestrator decides on it.
