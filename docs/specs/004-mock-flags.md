# Spec 004: Per-endpoint mock flags

Read docs/memory/ARCHITECTURE.md first (section "API contract": `src/api.js` + `src/mock/contract.test.js`
are the single source of truth; each endpoint goes real on its own flag after the contract test passes
against it).

## Goal
Replace the single `USE_MOCK = true` in `src/api.js` with one flag per endpoint, so each endpoint can
switch to the real FastAPI backend on its own. Make `src/mock/contract.test.js` able to run a chosen
subset of endpoints against a real base URL, while today's all-mock run stays 11/11 green and the
frontend behaves exactly as before.

## Acceptance criteria
- [ ] `src/api.js` exports one mutable flag object (replaces `USE_MOCK`; nothing else imports it today):
      ```js
      export const MOCK = {
        stars: true, search: true, article: true, timeline: true, asof: true, diff: true,
        summary: true, ask: true, threads: true, road: true, "topic-road": true,
      };
      ```
      Keys are the `/api/<key>` path names. Mapping: `getStars`→`stars`, `search`→`search`,
      `getArticle`→`article`, `getArticleTimeline` and `getGlobalTimeline`→`timeline`, `getAsOf`→`asof`,
      `getDiff`→`diff`, `getSummary`→`summary`, `ask`→`ask`, `getThreads`→`threads`, `getRoad`→`road`,
      `getTopicRoad`→`topic-road`. Every `if (USE_MOCK)` becomes `if (MOCK.<key>)`; no other logic change.
- [ ] Real calls use a base URL: `const API_BASE = globalThis.process?.env?.API_BASE ?? "";` and
      `fetchJson(API_BASE + "/api/...")`. In the browser `API_BASE` is `""`, so URLs stay relative
      (`/api/...`) exactly as today. No Vite env/config change.
- [ ] The header comment of `src/api.js` says how to switch one endpoint (set its `MOCK` key to `false`
      after the contract test passes against the real API).
- [ ] `src/mock/contract.test.js` reads two env vars:
      - `REAL` = comma-separated keys from `MOCK` (e.g. `REAL=stars,search`). For each key it sets
        `MOCK[key] = false` before any test runs. Unknown key → throw at load with the list of valid keys.
      - `API_BASE` (e.g. `http://127.0.0.1:8002`). If `REAL` is non-empty and `API_BASE` is unset → throw
        at load with a clear message (Node `fetch` needs an absolute URL).
      With neither set, behaviour is identical to today.
- [ ] Assertions that check the `"[mock]"` marker run only while that endpoint is mocked
      (e.g. `if (MOCK.ask) assert.ok(res.answer.includes("[mock]"))`); real text must never be required
      to contain `"[mock]"`. Every other assertion (shapes, counts, demo-path values) is unchanged.
- [ ] The error-mode test (`setMockConfig({ error: true })` → `getStars` rejects) is skipped when
      `MOCK.stars` is false (`test(name, { skip: !MOCK.stars }, fn)`).
- [ ] `npm test` (no env) → 11 pass, 0 fail, 0 skipped. `npm run build` OK.
- [ ] Real-mode wiring proven without a backend: `REAL=stars API_BASE=http://127.0.0.1:9 npm test`
      → the `GET /api/stars` test fails with a connection error (it really fetched
      `http://127.0.0.1:9/api/stars`), the error-mode test is skipped, the other 9 pass.
- [ ] `REAL=bogus API_BASE=http://127.0.0.1:9 npm test` and `REAL=stars npm test` both exit non-zero
      with the load-time messages above.
- [ ] Frontend unchanged: dev server loads the galaxy, search and Summarize work on mock data, no
      console errors (Playwright flow below).

## Assumptions
- No real API exists yet (api-core is a later spec), so this spec proves real mode only with the
  unreachable-port check above. The first real endpoint's spec runs
  `REAL=<key> API_BASE=http://127.0.0.1:8002 npm test` through an SSH tunnel and then flips `MOCK.<key>`.
- One flag per path name; `timeline` covers both the global and per-article timeline (same backend
  module, same spec).
- Flags stay in code (edit + rebuild to switch). No URL/env override in the browser.

## Scope
- May edit: `src/api.js`, `src/mock/contract.test.js`.
- Must not touch: `src/mock/index.js` and other mock fixtures, `src/ui.js`, `src/scene.js`, `index.html`,
  `src/styles.css`, `vite.config.*`, `package.json` (no new scripts or dependencies), `docs/memory/*`,
  other specs.

## Boundaries
- Always: run `npm test` and `npm run build` before reporting; follow docs/memory/CONVENTIONS.md.
- Ask first (via `orca orchestration ask`): loosening or deleting any non-`[mock]` assertion, new
  dependencies, edits outside scope.
- Never: change mock data or mock text (it stays marked "[mock]"); change function signatures or
  return shapes in `src/api.js`; commit secrets; delete failing tests.

## Open questions (defaults chosen)
- Flag key for topic road: `"topic-road"` (matches the path and the `REAL` value). Alternative
  `topicRoad`; default keeps path names.
- Browser override (e.g. `?real=stars`) for demoing a half-real frontend? Default: no, not requested.
- Value assertions that come from mock fixtures (e.g. Talvisota 2,143 versions, ghost thread 2007/2014,
  ask top = 52097 with 3 milestones) may not hold on real data. Default: keep them; the backend spec that
  hits a mismatch asks the orchestrator before changing the contract.

## Approach (Hydrogen)
1. Edit `src/api.js`: `MOCK` object, `API_BASE`, replace the 12 `USE_MOCK` checks, update header comment.
2. Edit `src/mock/contract.test.js`: import `MOCK`, apply `REAL`/`API_BASE` at load, guard the
   `"[mock]"` assertions and the error-mode test.
3. Run the commands below until all checks match the criteria.
4. Playwright smoke on the dev server.

## Commands
- Test (mock): `npm test`
- Build: `npm run build`
- Real-mode wiring: `REAL=stars API_BASE=http://127.0.0.1:9 npm test` (expected: 9 pass, 1 fail, 1 skipped)
- Bad config: `REAL=bogus API_BASE=http://127.0.0.1:9 npm test`; `REAL=stars npm test` (expected: non-zero exit, clear message)
- Run: `npm run dev` → http://127.0.0.1:5173

## Playwright
Screenshots go to `artifacts/screenshots/004-mock-flags/`.
1. http://127.0.0.1:5173 → wait for the galaxy canvas → stars render, 0 console errors.
2. Search "Talvisota" → results list shows rows → click the fi result → article panel opens.
3. Click "Summarize" → summary cards with "[mock]" text appear, 0 console/request errors.

## Evidence required in worker_done
One consolidated report:
- Files changed (only the two in scope) and the final `MOCK` object.
- `npm test` output: 11 pass / 0 fail / 0 skipped.
- `npm run build` result.
- Real-mode wiring output: pass/fail/skip counts and the stars failure line showing `127.0.0.1:9`.
- Both bad-config runs: exit code and the message.
- Playwright screenshot paths and console error count.
- Open issues / assumptions.

## Failure semantics
Non-zero `npm test` (no env) or `npm run build`, or any edit outside scope = Task failed (not a deliverable).
