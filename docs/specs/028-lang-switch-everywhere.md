# Spec 028: Language switch available in every view, keeping the open article (B6)

Read docs/memory/ARCHITECTURE.md first (Definition of done, Frontend deploy) and docs/design/013-i18n.md.

## Bug (demo dry runs 1–2, B6)
The fi/sv/en switch (#lang-switcher) is hidden while a summary (Summary Trail) or the road is open, so the presenter must
go "Back to the sky" before switching. Switching calls `setLang()` (src/i18n.js ~927) which does `location.reload()`,
so any open article/summary/road/Ask answer is lost.

## Goal
The switch is visible and usable in every view (sky, article panel, Summary Trail, Talvitie road, Ask answer), and after
switching the user lands in the same place in the new language.

## Acceptance criteria
- [ ] Placement in Summary Trail and road views follows docs/design/013-i18n.md rules (neutral, top right, no overlap with
      the trail/road controls at 1280x720 and 390 px); if 013 did not specify these views, choose the least intrusive spot
      and state it.
- [ ] State survives the switch: before reload, store the minimal view state (open article lang/page_id, view =
      panel|summary|road|ask, Ask question text, summary card index or road station index, slider year, lens) in
      sessionStorage (or the URL hash — choose, justify); after reload restore it and re-fetch with the new `ui`
      (summary/ask use 016/015 native-or-translated variants). Wrap storage in try/catch; fall back to the sky.
- [ ] Do not change the reload approach unless trivial: a full re-render without reload is out of scope.
- [ ] i18n: no new strings unless needed (fi/sv/en if any).
- [ ] Playwright on the DEPLOYED build (tunnel port 18142): (a) open Talvisota Summary Trail on card 3 in en -> switch to
      sv -> lands in Summary Trail of the native sv summary (Vinterkriget) with fi history card; (b) open Hallin Janne road
      at station 5 in fi -> switch to en -> same road, same station; (c) Ask hero in en -> switch to fi -> the fi answer
      variant shown with the same milestones; (d) 390 px: switch visible and usable in the summary view. 0 console errors,
      0 failed requests, screenshots in artifacts/screenshots/028/.
- [ ] npm test green; `npm run build` + deploy dist per ARCHITECTURE; report the served hash.

## Scope
May edit: src/ui.js, src/main.js, src/i18n.js (+ test), src/styles.css, index.html (switch markup only). Must not touch
backend/, scripts/, docs/, organizers' app/tm. Another worker (spec 027) edits backend/compare.py and may restart the api
tmux: no git checkout/stash/add -A/commit. Never edit docs/memory/*.
