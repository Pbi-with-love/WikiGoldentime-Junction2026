# Spec 014: Display fixes (HTML entities in Through time, "changed N times" count)

Read docs/memory/ARCHITECTURE.md first (Infrastructure: SSH flags, tmux, 127.0.0.1 binding; Reuse:
`history.py` is the organizers' code and is reused as-is).

## Goal
Two small display bugs, one Hydrogen task, no response-shape change:
1. Wikitext HTML entities (`&ndash;`, `&nbsp;`, `&amp;` ...) show literally in the Through-time AS OF
   text and the diff view (e.g. Talvisota at 2006: "30. marraskuuta 1939 &ndash; 13.").
2. The Ask strip says "This answer changed N times" with N = number of milestones; the number of
   changes is milestones − 1.

## Root causes (verified by the orchestrator)
1. `history.clean()` (backend/history.py, organizers') keeps entities. `GET /api/asof/{page_id}`
   (backend/main.py `get_asof`, line ~576) and `GET /api/diff/{page_id}` (`get_diff`, lines
   ~600–601) pass them through; the UI escapes `&` again (`escapeHtml`, src/ui.js ~2717), so the
   entity is shown as text.
2. src/ui.js line ~489: `const n = askRes.milestones.length;` then line ~591
   `t("ask.changedTimes", { count: n })`.

## Acceptance criteria
Fix 1 (backend/main.py only)
- [ ] A small helper in backend/main.py, e.g.
      `def _clean_blocks(text): return [(tag, html.unescape(txt)) for tag, txt in history.clean(text)]`
      (stdlib `import html`), used by `get_asof` (blocks) and by `get_diff` (both `old_blocks` and
      `new_blocks`, before `_diff_blocks`). Nothing else in main.py changes; response shape unchanged.
- [ ] New `backend/tests/test_display_fixes.py`: (a) the helper turns a block containing
      `&ndash;`, `&nbsp;`, `&amp;` into `–` (U+2013), U+00A0 and `&`; (b) `get_asof` called with
      `_open_svt` and `history.as_of` monkeypatched to return a fake row whose text contains
      `&ndash;` returns blocks with `–` and no `&ndash;`. No DB needed for this test.
- [ ] VPS, after deploy: `curl -s 'http://127.0.0.1:8002/api/asof/1256?at=2006-12-31' | grep -c '&ndash;'`
      prints `0`, and the same response contains `–` (`grep -c '–'` >= 1).
- [ ] The UI keeps escaping (safe: an unescaped `&lt;script&gt;` becomes text `<script>`, which
      `escapeHtml` re-escapes). Confirm the AS OF and diff render paths in src/ui.js go through
      `escapeHtml`; do not change them.

Fix 2 (src/ui.js milestone strip + i18n)
- [ ] With `m = askRes.milestones.length`:
      - `m >= 2`: title = `t("ask.changedTimes", { count: m - 1 })`.
      - `m === 1`: title = `t("ask.unchangedSince", { year: askRes.milestones[0].from_year })`.
      - `m === 0` or `!history_available`: unchanged, today's behaviour = the existing
        `<p class="ask-no-history">` with `t("ask.noHistory")` ("No edit history for this article
        yet.") and no strip (src/ui.js ~486).
- [ ] New key `ask.unchangedSince` in src/i18n.js for all three languages (plain string, not plural):
      en "This answer has not changed since {year}", fi "Vastaus ei ole muuttunut vuoden {year}
      jälkeen", sv "Svaret har inte ändrats sedan {year}". Year passed as-is (never through the
      number formatter).
- [ ] src/i18n.test.js extended: `t("ask.unchangedSince", { year: 2003 }, code)` contains "2003" and
      equals the exact string above for each of fi/sv/en; existing assertions untouched.
- [ ] Mock mode: the mock hero ask has 3 milestones, so the strip reads "changed 2 times" (expected,
      not a regression; the contract test's milestone counts are unchanged).

## Out of scope (say so in worker_done; do not change)
- backend/summary.py and backend/ask.py: their `source` / `source_sentence` are grounded by substring
  match against `history.clean()` text, and summary_cache / answer_cache rows were built from it.
  Unescaping there would break grounding and invalidate cached rows. Facts/milestone answers may still
  contain entities; a later spec if it shows in the demo.
- The Summarize string "Added {year} · changed {count} times" (src/i18n.js ~205): counts section
  changes, different semantics, left as is.
- backend/history.py (organizers' code, reused as-is).

## Assumptions
- `history.clean()` returns `(tag, text)` pairs (ARCHITECTURE.md: blocks `["h"|"li"|"p", text]`).
- `_diff_blocks` compares `history.to_html([b])`; unescaping before it is fine (to_html re-escapes
  consistently on both sides).
- The Ask milestone inline diff also calls `/api/diff`, so it gets the fix for free.

## Scope
- May edit: `backend/main.py` (the helper + `get_asof` blocks + `get_diff` blocks only, plus
  `import html`), `backend/tests/test_display_fixes.py` (new), `src/ui.js` (milestone strip title
  only, ~lines 486–591), `src/i18n.js` (add `ask.unchangedSince` x3), `src/i18n.test.js`,
  `artifacts/screenshots/014-display-fixes/`.
- On the VPS may: copy `backend/main.py` and `backend/tests/test_display_fixes.py` to
  `~/wikimemory/backend/`, restart only our `api` tmux session.
- Must not touch: `docs/memory/*`, `docs/specs/*`, `docs/design/*`, `backend/history.py`,
  `backend/summary.py`, `backend/ask.py`, any table or cache row, `MOCK` flag values, the organizers'
  repos/venvs and tmux sessions `app`/`tm`/`svt`, container 3308.

## Boundaries
- Always: run `npm test`, `npm run build` and the VPS pytest before reporting.
- Ask first (via `orca orchestration ask`): any edit outside scope, any response-shape change.
- Never: commit secrets, delete or weaken tests, rebuild caches.

## Open questions (defaults chosen)
- Which 1-milestone question to screenshot? Default: run
  `curl -s 'http://127.0.0.1:8002/api/ask?q=<q>'` on the VPS for "When did Finland declare its
  independence?" and "Which peace treaty ended the Winter War?" (data/demo-questions.tsv); use the
  first with `history_available: true` and exactly 1 milestone. If neither, pick any cached
  question from that file with 1 milestone and name it in the report (STATUS: 5 history questions
  have 1 milestone).

## Approach (Hydrogen)
1. TDD: write test_display_fixes.py and the i18n test first, then the fixes.
2. Deploy main.py to the VPS, restart `api`, run pytest + curl.
3. Playwright flows below against `npm run dev` with the tunnel up (real API).

## Commands
- Unit + contract, mock (local): `npm test`
- Build: `npm run build`
- Copy (local): `scp -i ~/.ssh/id_serverTech -o IdentitiesOnly=yes backend/main.py root@72.61.20.120:~/wikimemory/backend/`
  and `scp -i ~/.ssh/id_serverTech -o IdentitiesOnly=yes backend/tests/test_display_fixes.py root@72.61.20.120:~/wikimemory/backend/tests/`
- Restart API (VPS): `tmux kill-session -t api; tmux new -d -s api 'cd ~/wikimemory && set -a && . ./.env && set +a && .venv/bin/uvicorn backend.main:app --host 127.0.0.1 --port 8002 > api.log 2>&1'`
- Pytest (VPS): `cd ~/wikimemory && .venv/bin/pytest backend/tests/test_display_fixes.py backend/tests/test_ask.py -q`
- Curl (VPS): see Fix 1 criteria; also `curl -s 'http://127.0.0.1:8002/api/ask?q=How%20did%20the%20Winter%20War%20end%3F' | python3 -c 'import json,sys; print(len(json.load(sys.stdin)["milestones"]))'` (expect 4).
- Tunnel (local): `ssh -i ~/.ssh/id_serverTech -o IdentitiesOnly=yes -N -L 8002:127.0.0.1:8002 root@72.61.20.120`; run: `npm run dev`.

## Playwright
`playwright-cli` against `npm run dev` + real API. Screenshots to `artifacts/screenshots/014-display-fixes/`. 0 console errors.
1. UI en -> open Talvisota (fi 1256) -> Through time -> AS OF 2006-12-31 -> text shows
   "1939 – 13." with no literal `&ndash;` -> `01-asof-2006.png`.
2. Same article -> diff view across a 2006 revision -> dashes render as `–`, no `&...;` text ->
   `02-diff.png`.
3. UI en -> Ask "How did the Winter War end?" -> strip reads "This answer changed 3 times" (4
   milestones) -> `03-ask-hero-en.png`.
4. UI en -> Ask the 1-milestone question -> "This answer has not changed since <year>" ->
   `04-ask-unchanged-en.png`.
5. UI fi -> same question -> "Vastaus ei ole muuttunut vuoden <year> jälkeen" ->
   `05-ask-unchanged-fi.png`.

## Evidence required in worker_done
One consolidated report:
- Files changed (must match Scope).
- `npm test` pass/fail counts; `npm run build` result; VPS pytest counts.
- Curl output: `grep -c '&ndash;'` = 0 and `grep -c '–'` for asof 1256 at 2006-12-31; hero milestone
  count; measured asof response time (`curl -w '%{time_total}'`).
- The 5 screenshot paths, and which 1-milestone question was used.
- Confirmation that AS OF and diff render via `escapeHtml`; the out-of-scope notes above.

## Failure semantics
Non-zero `npm test`, `npm run build` or pytest exit, a literal entity in the 2006 AS OF response, or
any response-shape change = Task failed.
