# Spec 031: Language switch in the Summary Trail keeps the same section

Read docs/memory/ARCHITECTURE.md first (Definition of done, Frontend deploy, multilingual rule) and
docs/specs/028-lang-switch-everywhere.md (the view-state restore this spec extends).
Source: docs/memory/research/demo-dryrun-3.md, bug 5 (screenshot `artifacts/demo-dryrun-3/21*`).

## Bug
028 stores only `cardIndex` (a position in the trail items) before the reload. After a UI language switch the summary
is often a different article with different sections. Example: fi Talvisota (13 sections + interleaved ghosts) becomes
native sv Vinterkriget (6 sections + the fi history card + fi ghosts) or native en Winter War (9). The same index then
points at another card, often a removed-section (ghost) card.

## Goal
After a language switch the Summary Trail opens on the section that matches the focused one. Matching uses section
identity first, then the cross-language compare mapping. If neither gives a match, it opens on the nearest kept
section. All other 028 restore behaviour stays the same.

## Mapping rules (pure function, in this order)
Source = the focused card before the switch; target = the items of the new summary.
1. `overview` -> the target overview (index 0). `fiHistory` -> the target `fiHistory` card if any, else rule 5.
2. **Same article** (target `summaryData.article` has the same lang + page_id as the source, e.g. a translated
   variant of a fi summary): a section maps to the target section with the same `no`, and a ghost to the target ghost
   with the same `after_no` + `from_year` + heading.
3. **Fi ghost** (a ghost card from fi history data, `fromFi`): map it to the target ghost with the same `after_no`,
   `from_year` and `oldid`, whether the target lists it interleaved (fi summary) or after the `fiHistory` card
   (sv/en summary). If there is none, use rule 5 with the ghost's `after_no` as the position.
4. **Different articles, compare mapping**: use `/api/compare/fi/{fiPageId}` (fiPageId = the requested page if it is
   fi, else `fi_history.article.page_id`, else skip to rule 5). Only slots with `match === true` count. Source fi
   section `no` = the source `no` if the source article is fi, else the compare row whose `[sourceLang].section` equals
   the source heading (trim + casefold). Target: if the target article is fi, the section with that `no`; else the
   target section whose heading equals that row's `[targetLang].section` (trim + casefold).
5. **Fallback, nearest kept section**: the target `section` card at the same relative position among kept sections
   (`round(pos / max(1, n_src - 1) × (n_tgt - 1))`). Never land on a ghost. If the target has no sections, use the
   overview.

## Acceptance criteria
- [ ] New pure module `src/summaryMap.js` exporting `describeSummaryCard(item, summaryData)` (-> a small `cardRef`)
      and `mapSummaryCard(cardRef, targetItems, targetSummaryData, compareData)` (-> index), implementing the rules
      above. No DOM, no fetch.
- [ ] `src/summaryMap.test.js` (node:test) covers: overview; fiHistory; same-article by `no`; fi ghost found and not
      found; en→sv through compare (fixture modelled on Talvisota *Moskovan rauha* -> sv *Fredsavtalet*); sv→fi
      through compare; no match / `match:false` -> nearest kept section (never a ghost); compareData null; target with
      0 sections. Add the file to the `test` script in `package.json`.
- [ ] View state: `captureViewState` (src/main.js) also stores `cardRef` from `ui.getSummaryViewState()`.
      `normalizeViewState` (src/i18n.js) sanitizes it: whitelist the keys, cap strings at 200 chars, integers ≥ 0, and
      drop it when invalid. Keep `cardIndex` as the fallback when `cardRef` is missing (old saved states). Extend
      `src/i18n.test.js` for `cardRef` round-trip and garbage input.
- [ ] Restore: `enterSummaryTrail` accepts `cardRef`. When it is present, wait for the compare request it already
      starts (fi pages only), with a 3 s timeout that falls back to compareData = null. Compute the index with
      `mapSummaryCard` and open the trail there; read-more state and the open article panel restore as in 028.
      Normal (non-restore) opens do not wait for compare.
- [ ] No API change; no new i18n strings.
- [ ] `npm test` green; `npm run build`; deploy dist per ARCHITECTURE; report the served `assets/index-` hash.

## Assumptions
- The compare slot `section` is the sibling's `##` heading, the same string as the native sibling summary's `heading`
  (both come from the article's `##` lines). If Playwright shows otherwise, report it; do not change the backend.
- Spec 027 may change compare *values* (which passage matches), but not the response shape. If the shape changes,
  send a `question`.

## Scope
- May edit: `src/summaryMap.js` (new), `src/summaryMap.test.js` (new), `package.json` (`test` script line only),
  `src/main.js` (`captureViewState`, `enterSummaryTrail`, `restoreViewState` only), `src/ui.js`
  (`getSummaryViewState` + a getter for the current items/summaryData only), `src/i18n.js` (`normalizeViewState`
  only), `src/i18n.test.js`, `artifacts/screenshots/031/`.
- Must not touch: `src/scene.js`, `src/styles.css` (spec 030), `backend/**` (spec 029 edits `backend/main.py`; spec 027
  edits `backend/compare.py`, `scripts/calibrate_compare.py`), `scripts/**`, `src/api.js`, `src/mock/**`, `docs/**`.

## Boundaries
- Always: run `npm test` before reporting; try/catch around storage (as in 028).
- Ask first (`orca orchestration ask`): edits outside scope, an API change, new dependencies.
- Never: git checkout/stash/add -A/commit; edit `docs/memory/*`; delete or weaken tests.
- Deploy note: specs 030 and 031 both rebuild `dist/` from the same folder. Build and deploy only when `git status`
  shows no unfinished 030 edits in src/. Otherwise send a `question` first.

## Open questions (defaults chosen)
- Show a hint like "Nearest section" when the fallback was used? Default no (no new strings).
- Prefer the URL hash over sessionStorage? Default no: keep 028's sessionStorage.

## Design (brief, no separate design step)
No visual change. The trail opens directly on the mapped card (no fly-through from card 0). Counter, Next/Previous
and the language switcher stay where 028 put them.

## Commands
- Test: `npm test`
- Build/deploy: `npm run build`; `rsync -az --delete -e "ssh -i ~/.ssh/id_serverTech -o IdentitiesOnly=yes" dist/ root@72.61.20.120:/root/wikimemory/dist/`;
  VPS `curl -s http://127.0.0.1:8002/ | grep assets/index-`
- Tunnel (this spec's port): `ssh -i ~/.ssh/id_serverTech -o IdentitiesOnly=yes -N -L 18312:127.0.0.1:8002 root@72.61.20.120`
- Compare data for the report: `curl -s http://127.0.0.1:18312/api/compare/fi/1256 | python3 -m json.tool`

## Playwright (deployed build, `http://127.0.0.1:18312/`, 1280×720 unless noted)
Screenshots go to `artifacts/screenshots/031/`. For each switch, record the card heading + kind before and after and the
rule that fired (expose nothing new in the UI; read it from the card DOM).
1. fi: search `talvisota` -> *Talvisota* -> **Tiivistä** -> **Seuraava** to **Osio 5 / 13** *Moskovan rauha* ->
   `01-fi-moskovan-rauha.png` -> **Svenska** -> lands on the sv section that compare maps it to (expected
   *Fredsavtalet*), not a ghost -> `02-sv-fredsavtalet.png`.
2. sv (from flow 2) -> **English** -> a kept en section (compare-mapped or nearest), not a ghost -> `03-en-mapped.png`.
3. en: Talvisota **Summarize** -> overview card -> **Suomi** -> overview -> `04-overview-fi.png`.
4. en: Talvisota **Summarize** -> the "Edit history of Finnish Wikipedia" card -> **Svenska** -> the fi history card
   -> `05-fihistory-sv.png`.
5. fi: Talvisota **Tiivistä** -> a ghost card -> **English** -> the same fi ghost (rule 3) or the nearest kept
   section -> `06-ghost-en.png`.
6. 390×844 en: Summary on a section card -> **Svenska** -> mapped section, switcher usable -> `07-mobile-sv.png`.
7. 028 regression: road at station 5 (fi -> en) and Ask hero (en -> fi) still restore -> `08-road.png`, `09-ask.png`.

## Evidence required in worker_done
- Files changed (`git status` limited to scope).
- `npm test` counts (incl. summaryMap + i18n tests), `npm run build` result, served hash.
- Playwright: each flow with steps, UI languages, before/after card heading + kind, rule used, pass/fail, console
  errors (0), failed requests (0), screenshot paths.
- Open issues and assumptions (e.g. compare headings that did not match the sibling summary's headings).

## Failure semantics
Non-zero test exit, a switch from a section card that lands on a ghost, or missing Playwright evidence = Task failed
(not a deliverable).
