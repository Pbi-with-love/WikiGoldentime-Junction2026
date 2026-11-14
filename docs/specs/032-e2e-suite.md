# Spec 032: Playwright E2E suite in the repo (one command, deployed build)

Read docs/memory/ARCHITECTURE.md first ("Definition of done", "Frontend deploy", "Infrastructure"), then
docs/DEMO.md (the flows and real button labels) and docs/memory/research/demo-dryrun-3.md (measured labels and timings).
Also read the Playwright skill at its absolute path, because it is untracked and missing in worktrees:
`/Users/camlynh/Documents/Anh_Tai/temp/setup-template/WikiGoldentime/.agents/skills/hydrogen-playwright-verify/SKILL.md`.

## Goal
Add a Playwright Test suite to the repo. One command, `npm run e2e`, runs every demo flow end to end against the
deployed build (or any `BASE_URL`). Each flow asserts visible text or state, 0 console errors and 0 failed requests,
and saves one screenshot. The suite is a test of the app: it reports failures and does not fix them.

## Acceptance criteria
- [ ] `npm run e2e` runs the whole suite in Chromium. `BASE_URL` env var sets the target, default
      `http://127.0.0.1:18322` (the SSH tunnel to VPS 127.0.0.1:8002, see Commands). The suite opens no tunnel itself.
- [ ] A global setup fetches `BASE_URL`. If it is unreachable, the run stops with one clear message that prints the
      tunnel command. If it is reachable, it logs the served bundle hash (`assets/index-XXXX.js` from the HTML) so every
      report names the bundle it tested.
- [ ] Shared fixture (`e2e/fixtures.js`, extends `test`): it collects `console` messages of type `error`, `pageerror`,
      `requestfailed` and responses with status ≥ 400 (with the URL). After each test it attaches the list and fails
      the test if the list is not empty. A test may not opt out of this check.
- [ ] Helpers (`e2e/helpers.js`): `ready(page)` waits until the slider reads 2026 (or clicks once to end the intro
      sweep, as in DEMO.md warm-up). `setLang(page, 'en'|'fi'|'sv')` clicks the `#lang-switcher` button (English /
      Suomi / Svenska) and waits for the reload. `shot(page, name)` writes `artifacts/screenshots/e2e/<name>.png`.
      Use role/text locators and the stable ids in index.html (`#search-input`, `#search-form`,
      `#search-results-panel`, `#ask-panel`, `#lens-switcher`, `#lang-switcher`, `#sky-top-bar`, `#timeslider-root`).
      Do not use CSS-class chains that change with styling.
- [ ] One test per flow below, in `e2e/*.spec.js`. Each flow asserts the listed visible state and writes its
      screenshot(s). Assertions must be **tolerant where data legitimately varies**: ranges or regexes for counts,
      similarity %, the number of search results and LLM wording. Assertions stay **exact for static history facts**:
      fi 1256 Talvisota, rev 1862876, the Höyhens 2006 revision and the 2,143/328/88/7 stats. Compare numbers as
      digits, so the separators in "2,143" and "2 143" do not matter.
- [ ] Config `playwright.config.js` at the repo root: `testDir: 'e2e'`, `workers: 1` (the VPS has 2 vCPU),
      `retries: 0` (flakes must show), test timeout 60 s, `use.baseURL` from `BASE_URL`, viewport 1280×720 unless a
      test sets 390×844, `outputDir: 'artifacts/e2e/test-results'`, reporters `list` +
      `['json', { outputFile: 'artifacts/e2e/results.json' }]`. All output goes under `artifacts/`, which is
      already gitignored.
- [ ] `npm test` stays green and does not pick up e2e files. `npm run build` is not affected.
- [ ] Run the suite **twice** against the deployed build. A flow that passes once and fails once is reported as flaky.

## Flows (test name -> steps -> must assert -> screenshot)
Fixtures: fi 1256 Talvisota, fi 1150 Suomen sisällissota, fi 440 Jatkosota, rev 1862876 (2006 treaty-date edit,
Whiskey~fiwiki). Do not type new Ask questions. Uncached questions take ~25 s and change the cache.
1. `slider` (en): `ready` -> focus the slider, **Home** -> year 2001 and a star count in 40–120 (if the UI shows one,
   otherwise slider value 2001) -> **End** -> 2026 -> `01-slider.png`.
2. `search-also` (en): search `talvisota` -> results panel lists ≥ 5 results; *Talvisota* shows also-language dots or
   chips for sv and en; *Vinterkriget* and *Winter War* are listed -> `02-search-also.png`.
3. `article-panel` (en): open *Talvisota* from the results -> panel title Talvisota, an image, a credit line matching
   `/^Image: .+, (Public domain|CC .+)/` within 5 s, buttons Summarize / See as a road / Close -> `03-article-panel.png`.
4. `star-click` (en): `ready`, close panels, click the canvas at a fixed grid of points until an article panel opens
   (max 15 points). Assert that the panel has a title and that no "Loading…" text is left after 5 s. Log which point
   worked -> `04-star-click.png`.
5. `asof-2006` (en, then fi): Talvisota -> **Through Time** -> stats 2143 versions / 328 reverts / 88 disputes /
   7 edit-war months -> **As of 2006** -> "Edited by Höyhens on 29 Dec 2006" + `oldid=2114325`, and the slider reads
   2006. Repeat in fi, with the same oldid and a Finnish label -> `05-asof-2006-en.png`, `05-asof-2006-fi.png`.
6. `hero-ask` (en, fi, sv): chip **How did the Winter War end?** (en and sv UI). In fi, use the cached
   `Miten talvisota päättyi?` the way DEMO.md describes. Assert: an answer with a provenance label ("Based on …" /
   "Perustuu …" / "Maskinöversatt från …"); a "changed N times" line in the UI language with N ≥ 1; a period card
   that names Whiskey~fiwiki with 7 Nov 2006 / 7.11.2006 / 7 nov. 2006; and `1862876` in that card's text or link
   -> `06-hero-{en,fi,sv}.png`.
7. `hero-2006-diff` (en): from the hero, click the period card that contains 1862876 -> facts with a Finnish source
   sentence containing "12. maaliskuuta" -> "Word diff against today" shown with at least one insert or delete mark ->
   `07-hero-2006-diff.png`.
8. `summarize` (en, fi): en Talvisota **Summarize** -> native en summary (Winter War), section count 4–20, card
   counter advances on **Next**, "Edit history of Finnish Wikipedia" card present. fi **Tiivistä** -> "N osiota" with
   N 4–20, ≥ 1 ghost (removed-section) card, **Seuraava** to *Moskovan rauha* -> "Myös ruotsinkielisessä
   Wikipediassa" -> `08-summarize-en.png`, `08-summarize-fi.png`.
9. `through-time-trail` (en): Through Time -> **See as a road** -> the trail/road renders -> **Back to the sky**
   returns to the sky -> `09-through-time-trail.png`.
10. `topic-road` (en): chip **Talvitie: Talvisota** -> "N historical milestones · YYYY–YYYY" with N ≥ 5 -> a card
    with a "Similar (NN%)" line and history stats -> **Next** twice changes the station -> **Back to the sky** ->
    `10-topic-road.png`.
11. `lang-switch-views` (028): in each view (sky, article panel, Summary Trail, road, Ask answer), switch fi -> sv ->
    en. After each switch: the switcher is visible, the same view is restored (same article / road station / Ask
    question), and one known label is in the new language (e.g. Summarize / Tiivistä / Sammanfatta) ->
    `11-lang-<view>-<lang>.png`.
12. `lang-switch-summary-section` (031): fi Talvisota **Tiivistä** -> **Seuraava** to *Moskovan rauha* -> **Svenska**
    -> focused card is a kept section (not a ghost), expected *Fredsavtalet* -> **English** -> a kept section, not a
    ghost. Record the card heading and kind before and after -> `12-summary-section-{fi,sv,en}.png`.
13. `geography` (en 1280×720, en 390×844, fi 390×844): **Geography** / **Maantiede**, wait 3 s. In the page: every
    `.projected-lens-guide` rect lies inside the viewport, intersects neither `#sky-top-bar` nor `#timeslider-root`,
    and no two labels intersect. At both sizes Helsinki, Turku, Tampere, Oulu and Rovaniemi are visible. "Unlocated
    articles" / "Paikantamattomat artikkelit" is fully inside the viewport -> `13-geo-1280-en.png`,
    `13-geo-390-en.png`, `13-geo-390-fi.png`.

## Failing flows (expected today: 029/030/031 are still being merged)
- A failing flow is a **result**. Report it in worker_done as `flow | expected | actual | screenshot`.
- Never "fix" a failure by editing app code. Never weaken, skip (`test.skip`/`fixme`) or loosen an assertion to get
  green. The one exception: an assertion that contradicts this spec or docs/DEMO.md may be corrected, with the reason
  in the report.
- A locator that cannot find an element the spec names is reported too (the label may have changed). Do not delete
  the check.

## Assumptions
- The deployed build on VPS :8002 is the target. The worker does not deploy, restart the api or touch the VPS beyond
  opening the tunnel.
- History stats and rev ids are static (dataset M is fully loaded). Search counts, similarity % and LLM wording may vary.
- The hero answers (en/fi/sv) and Talvisota summaries are cached (pre-warmed), so no flow waits for a live LLM call.
- `@playwright/test` is not installed in the repo yet. A config and specs that `import` it need it as a local
  devDependency (an `npx` run without a local install cannot resolve the import).

## Scope
- May edit (new files only): `e2e/**`, `playwright.config.js`, `package.json` (add the line
  `"e2e": "playwright test"` under `scripts`, plus one exact-pinned `@playwright/test` entry in `devDependencies`) and
  `package-lock.json` (the resulting install only). Output goes to `artifacts/screenshots/e2e/` and `artifacts/e2e/`.
- Must not touch: `src/**`, `backend/**`, `scripts/**`, `index.html`, `vite.config.js`, `docs/**`, `.gitignore`,
  `dist/`, the VPS (no deploy, no api restart), the organizers' apps.

## Boundaries
- Always: work in your isolated worktree. Run `npm ci` first if `node_modules` is missing, and
  `npx playwright install chromium` if the browser is missing. Run `npm test` and `npm run e2e` before reporting.
- Ask first (`orca orchestration ask`): any dependency other than `@playwright/test`, any edit outside scope, and any
  flow you think is wrong in this spec.
- Never: edit app code to make a test pass; weaken/skip assertions; commit; git checkout/stash/add -A; edit
  `docs/memory/*`; deploy; type new Ask questions.

## Open questions (defaults chosen)
- Dependency: the orchestrator brief said "package.json scripts line only", but a repo-kept Playwright Test suite
  needs `@playwright/test` locally. Default: one pinned devDependency + lockfile (see Scope). The orchestrator may veto
  this before dispatch.
- Should `npm run e2e` open the SSH tunnel itself? Default no: it needs the private key path. The global setup prints
  the command instead.
- Star click is a WebGL canvas with no test hook (src is out of scope). Default: grid probing (flow 4), tolerant.

## Commands
- Tunnel (this spec's port): `ssh -i ~/.ssh/id_serverTech -o IdentitiesOnly=yes -N -L 18322:127.0.0.1:8002 root@72.61.20.120`
- Bundle check: `curl -s http://127.0.0.1:18322/ | grep -o 'assets/index-[^"]*\.js'`
- Install: `npm ci` (if needed); `npm i -D -E @playwright/test`; `npx playwright install chromium`
- Unit tests: `npm test`
- E2E: `npm run e2e` (default target), or `BASE_URL=http://127.0.0.1:18322 npm run e2e`; one flow: `npm run e2e -- -g hero-ask`
- Time: `time npm run e2e`

## Playwright
The suite itself is the Playwright deliverable. Screenshots go to `artifacts/screenshots/e2e/`, named as in Flows.

## Evidence required in worker_done (one consolidated report)
- Files added/changed (`git status`), limited to the scope above.
- `npm test` pass count.
- Bundle hash tested (from the global setup log).
- For **each of the 2 runs**: the exact command, total pass/fail counts, wall time, and a per-flow table
  `flow | UI langs | viewport | pass/fail | console errors | failed requests | screenshot(s)`.
- Failing flows: `flow | expected | actual | screenshot`, and flaky flows (differ between runs).
- Screenshot list (`ls artifacts/screenshots/e2e/`) and the path of `artifacts/e2e/results.json`.
- Open issues and assumptions (e.g. labels that differ from DEMO.md, the star-click point used).

## Failure semantics
The suite is the deliverable, so failing app flows do not fail the Task. The Task fails if any of these happen:
`npm run e2e` cannot run, a flow above has no test, an assertion was weakened or skipped, app code was edited,
`npm test` is red, or evidence is missing.
