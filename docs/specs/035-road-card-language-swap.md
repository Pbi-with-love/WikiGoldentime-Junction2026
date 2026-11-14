# Spec 035: Road card language swap (fi / sv / en on each Talvitie milestone)

You are an Orca implementation worker, not the orchestrator (Claude Sonnet 5.5). Follow HYDROGEN.md and this spec.
Read docs/memory/ARCHITECTURE.md first (multilingual rule: native sv/en article first, translation second; Rules;
Definition of done; Frontend deploy; API contract; Infrastructure).

## Goal
On a Talvitie (topic road) milestone card that says "Also covered in: English" (or Swedish), the reader can swap the
card between the languages that exist for that milestone and read the native article lead in that language. Today
the card shows only the station-language (Finnish) title, lead and targets. Example: "Milestone 3 of 13 · 1890 —
Toivo Alavirta, Also covered in: English", lead Finnish only.

## Facts (verified by the orchestrator / spec-writer)
- `GET /api/topic-road?lang=fi&page_id=1150` returns `{topic, eras, events}`; 13 events with keys `lang, page_id,
  wikidata_id, title, url, x, y, z, event_year, event_label, lanes (e.g. ["fi","sv","en"]), siblings ({fi|sv|en:
  {page_id, title, url} | null}), summary_short, summary_long, thumb_url, thumb_file, image, has_history,
  first_added_year, changes, war_years, history_stats, branches, why`. `summary_*` exist for the station language only.
- Route: `backend/main.py` `get_topic_road` -> `backend/road.py` `get_topic_road_response` -> `_article_road` /
  `_category_road` -> `neighbours.item_meta(...)` (builds `siblings`, `lanes`, and the lead with
  `compare.format_passage(neighbours.lead_text(LEFT(text, 4000)), 240 | 600)`).
- The road response is **not cached** today (computed per request; 30–53 ms warm per spec 024). The orchestrator's
  "cache it like the road" therefore means: no new cache; the extra work is one primary-key query.
- `neighbours.item_meta` is shared with `/api/threads` (`backend/threads.py`); do not change it.
- Frontend: `src/ui.js` `normalizeRoadData` (~line 129, maps events to stations, keeps `siblings`), `renderLaneCoverageHtml`
  (~line 1420), `renderRoadCards` (~line 1463; station card ~1747–1840; "Read milestone" toggles `st.text` reader;
  `#btn-road-read-full` calls `onSelectStarByKey(st.lang, st.page_id, {glide:false, openTab:"today"})` ~line 1928),
  `activeRoadState` (~line 1304). i18n: `setLang` reloads the page, so per-card choices kept in `activeRoadState`
  reset automatically on a UI language change. Existing keys to reuse: `lang.fi|sv|en`, `road.alsoCoveredIn`,
  `road.finnishOnly`, `road.onlyInWiki.*`, `summary.fiHistoryLabel` ("Edit history of Finnish Wikipedia").
- Lane dot styles: `src/styles.css` `.dot-fi` / `.dot-sv` / `.dot-en` (~line 84), `.road-card-lanes` (~2026),
  `.lane-coverage-text` (~2044).
- e2e `04-summarize-and-road.spec.js` (en UI) asserts on `.road-card-title` changing on Next, "Similar (NN%)" and
  "N reverts" text on the card, and button name "Next". Those must keep passing (en UI will now default to English
  cards where available; titles still differ per station).

## Acceptance criteria
Backend (`/api/topic-road`)
- [ ] 1. Every non-null `siblings[lg]` of every event carries `summary_short` (<= 240) and `summary_long` (<= 600),
      built with exactly the same code as the event lead (`compare.format_passage(neighbours.lead_text(LEFT(text,
      4000)), 240|600)`) from `wikirag.article` by `(lang, page_id)` PK. For the station's own language the values
      equal the event's `summary_short` / `summary_long`. Event-level keys and all other values are unchanged.
- [ ] 2. One extra SQL query per response (OR of `(lang = ? AND page_id = ?)` pairs, prepared params) for the
      non-station siblings, added in `backend/road.py` for both article and category mode. No LLM, no embedding,
      no wikihistory query, no change to `neighbours.item_meta`.
- [ ] 3. Cost on the VPS (curl to 127.0.0.1:8002, `lang=fi&page_id=1150`, warm, 5 calls before and after):
      `time_total` and `size_download` (plain and gzip). Warm time growth <= 20 ms median; report payload growth.
- [ ] 4. Sample: in the 1150 road, the events for "Suomen itsenäistyminen" and "Toivo Alavirta" (find them in the
      response; report their `lanes` and page_ids) have English (and for Suomen itsenäistyminen Swedish) sibling leads
      that are English / Swedish text, non-empty, no "[mock]", not starting with "#".

Contract
- [ ] 5. `src/api.js` JSDoc of `getTopicRoad` documents the event shape incl. `siblings[lg] = {page_id, title, url,
      summary_short, summary_long} | null`. `src/mock/contract.test.js` topic-road test: under `REAL=topic-road`, for
      every event of fi 1150 and fi 1256, every lang in `lanes` has a sibling with non-empty `summary_short` (no
      "[mock]", not starting "#"), and the station's own sibling lead equals the event lead. Mock mode passes unchanged
      (if the mock fixture lacks sibling leads the check is skipped in mock mode; do not edit `src/mock/**` fixtures
      unless the contract test cannot pass otherwise -> ask first; any added mock text contains "[mock]").

Frontend (road card only)
- [ ] 6. Language pills on the "Also covered in" line (inside `.road-card-lanes`): one `<button type="button">` per
      language in `lanes` (the station language always included), order fi, sv, en, each with the lane dot colour and
      the short code (FI/SV/EN), `aria-pressed` true on the shown language, `aria-label` / `title` = "Show in
      {language}" (new i18n key in fi/sv/en). A card with a single language shows no pills (the existing
      "Finnish only" / "Only in ... Wikipedia" text stays).
- [ ] 7. Default card language = UI language if that sibling exists, else the station language. Clicking a pill swaps
      the card's title, lead (`summary_short`), "Read milestone" reader text (`summary_long`), "Open article" target
      (opens that sibling: `onSelectStarByKey(lg, sibling.page_id, {glide:false, openTab:"today"})`), the `lang`
      attributes of title/lead/reader, the image `alt`, and the "Also covered in" list (= the other languages).
      If a sibling has no lead (e.g. mock data), show its title and hide the lead; never show the Finnish lead under a
      non-Finnish title.
- [ ] 8. Unchanged on swap: image + credit, year, milestone counter, why line, Previous/Next, minimap, 3D scene.
      The memory badge (history stats) stays but, when the shown language is not fi, gets the label
      `summary.fiHistoryLabel` ("Edit history of Finnish Wikipedia" / fi / sv translations) so the reader knows the
      numbers are Finnish Wikipedia's.
- [ ] 9. The choice is remembered per station while moving Previous/Next / arrow keys / minimap within the same road
      (store in `activeRoadState`, e.g. `cardLang: {[stationIdx]: lg}`); opening a new road or reloading (UI language
      change reloads) resets to defaults. Not persisted to storage.
- [ ] 10. Keyboard: pills reachable by Tab, activate with Enter/Space; focus stays on the clicked pill after re-render
      (restore focus by language after `renderRoadCards`). The road-wide arrow-key station navigation (~line 2860) stays
      as is. No layout jump: card height and footer position do
      not change when swapping between languages with similar lead length; pills fit on one line at 390x844 and
      1280x720 (no overflow, no wrap of the counter row onto three lines).
- [ ] 11. Tests: `npm test` green; VPS pytest `>= 89 passed` plus the new sibling-lead test; `REAL=topic-road`
      contract green against the VPS; `BASE_URL=http://127.0.0.1:4176 npm run e2e` 13/13 against a local preview of
      this branch with the updated VPS backend. `e2e/**` is not edited.

## Assumptions
- Sibling rows exist in `wikirag.article` for every non-null sibling (siblings come from that table), so the PK query
  returns them all; a missing row yields empty leads (handled by criterion 7).
- 13 events x <= 2 siblings = <= 26 PK lookups in one query: a few ms; payload grows by roughly 26 x 840 chars raw.
- History stays Finnish-only (ARCHITECTURE multilingual rule); there is no sv/en history to swap to.
- Translation of the fi lead for missing languages is out of scope (pills appear only for native siblings).

## Scope (May edit = for this worker)
- `backend/road.py`: a small helper (e.g. `_attach_sibling_leads(cur, items)`) called after `neighbours.item_meta` in
  `_article_road` and `_category_road`; reuse `neighbours.lead_text` and `compare.format_passage` (import, do not copy).
- `backend/tests/test_road.py`: new pure test of the helper with a fake cursor (own-lang sibling copies the event
  lead, other siblings get lead from the fake rows, null siblings stay null, one `execute` call).
- `src/api.js`: `getTopicRoad` JSDoc only. `src/mock/contract.test.js`: topic-road test only.
- `src/ui.js`: road-card parts only (`normalizeRoadData` topic branch if needed, `renderLaneCoverageHtml`,
  `renderRoadCards` station card + its wiring, `activeRoadState` init in `openRoadView`).
- `src/i18n.js`: new road-card keys in fi/sv/en (e.g. `road.showCardIn`). `src/styles.css`: road-card pill rules.
- Evidence: `artifacts/035/`, `artifacts/screenshots/035/`.
- Must not touch: `backend/main.py` (spec 034 edits the stars code in parallel), `backend/neighbours.py`,
  `backend/threads.py`, other `backend/*.py`, `src/scene.js` (spec 034 edits the edit-war code), `src/main.js`,
  `src/mock/**` except `contract.test.js` (ask first), `e2e/**`, `docs/**` (incl. `docs/memory/*`), `package*.json`,
  `vite.config.js`, `scripts/**`, table schemas, container 3308, organizers' repos and tmux `app`/`tm`/`svt`.

## Boundaries
- Always: prepared statements; run all tests before reporting; before the api restart wait until
  `~/wikimemory/api.log` has been quiet for 60 s (another worker may restart it too) and report the restart time;
  restart at most once per backend change; services bind to 127.0.0.1; work in your isolated worktree.
- Ask first (`orca orchestration ask`): any edit outside scope (mock fixtures, `src/main.js`, `neighbours.py`); a new
  cache or table; any response change beyond the sibling leads; new dependencies.
- Never: deploy the frontend (no `dist/` rsync; the orchestrator deploys after merge); git checkout/stash/add -A/commit;
  delete or weaken tests; call an LLM or translate; show Finnish text under a non-Finnish title.

## Open questions (defaults chosen)
- "Cache the same way as the road": the road is not cached; default = no cache, one PK query (criterion 2/3). If the
  warm growth exceeds 20 ms, report and ask before adding a cache.
- Pills for a single-language card: default = none (spec allows a disabled fi pill; none is simpler and avoids noise).
- Should the 3D station label / minimap follow the card language? Default: no (scene.js is off limits for this spec).
- Seed road opened from an sv/en article (station lang sv/en): same rule; fi appears as a pill when in `lanes`.

## Design (short brief; no separate Argon step)
Pills sit on the existing "Also covered in" line in `.road-card-lanes`, replacing the static lane dots group there:
compact rounded chips (height ~22 px, same font size as `.lane-coverage-text`), each with the existing lane dot
(`.dot-fi` white, `.dot-sv` yellow, `.dot-en` green) followed by the code FI/SV/EN. Selected = filled/raised chip with
the dot colour as border; unselected = transparent with a subtle border; visible `:focus-visible` ring; hover
consistent with other road chips (`.road-post-chip`). The coverage text follows the pills on the same line and lists
the other languages. Respect `prefers-reduced-motion` (no animated transitions when set).

## Commands
- SSH: `ssh -i ~/.ssh/id_serverTech -o IdentitiesOnly=yes root@72.61.20.120`
- Cost (VPS, run BEFORE and AFTER):
  `for i in 1 2 3 4 5; do curl -s -o /dev/null -w '%{time_total} %{size_download}\n' 'http://127.0.0.1:8002/api/topic-road?lang=fi&page_id=1150'; done`
  and the same with `-H 'Accept-Encoding: gzip'`.
- Sample: `curl -s 'http://127.0.0.1:8002/api/topic-road?lang=fi&page_id=1150' | jq '.events[] | {title, lanes, siblings}'`
- Copy backend: `scp -i ~/.ssh/id_serverTech -o IdentitiesOnly=yes backend/road.py root@72.61.20.120:/root/wikimemory/backend/`
  and `backend/tests/test_road.py` to `/root/wikimemory/backend/tests/`.
- Restart API (VPS, after the 60 s quiet check): `tmux kill-session -t api; tmux new -d -s api 'cd ~/wikimemory && set -a && . ./.env && set +a && .venv/bin/uvicorn backend.main:app --host 127.0.0.1 --port 8002 > api.log 2>&1'`
- Pytest (VPS): `cd ~/wikimemory && .venv/bin/python -m pytest backend/test_api.py backend/tests -q` (>= 89 passed + new)
- Contract tunnel (this spec's port): `ssh -i ~/.ssh/id_serverTech -o IdentitiesOnly=yes -N -L 18352:127.0.0.1:8002 root@72.61.20.120`
- Tests: `npm test`; `REAL=topic-road API_BASE=http://127.0.0.1:18352 npm test`
- Local preview against the real API (vite proxies `/api` to local 8002; if local 8002 is already a tunnel to the same
  VPS api, reuse it; if it is something else, ask first):
  `ssh -i ~/.ssh/id_serverTech -o IdentitiesOnly=yes -N -L 8002:127.0.0.1:8002 root@72.61.20.120`, then
  `npm run build && npx vite preview --host 127.0.0.1 --port 4176` -> `http://127.0.0.1:4176/`
- E2E: `BASE_URL=http://127.0.0.1:4176 npm run e2e` (expect 13/13; backend already updated + restarted).

## Playwright (local preview :4176 with the updated VPS backend; the orchestrator re-runs on the deployed build after merge)
Screenshots to `artifacts/screenshots/035/`. Record console errors and failed requests per flow (must be 0).
1. fi UI, 1280x720: open the Suomen sisällissota road (fi 1150), go to "Suomen itsenäistyminen" -> card in fi
   (`01-itsenaistyminen-fi-1280.png`) -> click EN pill -> title "Independence of Finland", English lead, Also covered
   in lists Finnish + Swedish, memory badge labelled as Finnish Wikipedia history (`02-...-en-1280.png`) -> click SV ->
   "Finlands självständighet", Swedish lead (`03-...-sv-1280.png`) -> click FI -> back to the Finnish card.
2. Same card in en UI: opens in English by default. "Read milestone" shows the English `summary_long`; "Open article"
   opens en `Independence of Finland` in the article panel (`04-...-open-en.png`).
3. Persistence: on the swapped card press Next then Previous -> the card is still in the chosen language; open a new
   road -> defaults again.
4. Toivo Alavirta card (fi UI): FI and EN pills only; swap to EN and back.
5. A single-language station (find one in any road; report which): no pills, "Finnish only" text unchanged.
6. Keyboard: Tab to the pills, Enter/Space swaps, focus stays on the pill.
7. 390x844: repeat flow 1 (fi/en/sv screenshots `05-07-...-390.png`): pills on one line, no overflow, footer does not
   jump.

## Evidence required in worker_done (one consolidated report; per-subtask evidence if you split the work)
- Files changed (`git status`, limited to scope).
- `/api/topic-road` before/after: warm `time_total` (5 calls), plain + gzip bytes; the jq sample for the two cards
  (lanes, sibling page_ids, first 80 chars of each sibling `summary_short`).
- `npm test` counts, VPS pytest counts (name the new test), `REAL=topic-road` counts, `npm run e2e` result (13/13).
- Playwright flows: steps, viewport, UI language, pass/fail, console errors, failed requests, screenshot paths.
- API restart time. State clearly that the frontend was NOT deployed. Open issues and assumptions.

## Failure semantics
Non-zero test exit, e2e below 13/13, a sibling in `lanes` without a native lead in REAL mode, Finnish text shown under
a non-Finnish title, an edit outside scope, warm time growth > 20 ms without a report, or missing evidence = Task
failed (not a deliverable).
