# Spec 030: Geography map fits at 390 px and shows city labels

Read docs/memory/ARCHITECTURE.md first (Definition of done, Frontend deploy).
Source: docs/memory/research/demo-dryrun-3.md, bug 4 (screenshot `artifacts/demo-dryrun-3/15*`; 1280 is fine, see `14*`).

## Goal
In the Geography lens at 390×844 the whole map of Finland is visible, with nothing cut on the right or hidden behind the
header, and the city labels are readable. 1280×720 stays as good as it is now. No label may overlap the timeline bar.

## Known causes (from the code; confirm)
- Labels: `src/scene.js` lens-guide projection (~line 2662) keeps a label only if `x > 50 && x < width - rightMargin`
  (`rightMargin` = 210 at narrow widths) and `y > 100 && y < height - 170`, and it drops everything in a fixed
  540×210 px box at the top left. At 390 px wide that leaves almost no room, so every city label is dropped.
- Framing: `setLens("geography")` (~line 1094) and the resize/lens restore path (~line 1967) both set the camera with
  `71 / camera.aspect` and fixed offsets. They do not use the real header and timeline-bar heights, so a portrait
  viewport cuts the east edge and puts the top under the header.

## Acceptance criteria
- [ ] Framing: compute the camera distance so that the bounding box of the map outline (`FINLAND_BORDER_LATLON`) plus the
      unlocated cluster fits between the bottom of `#sky-top-bar` and the top of `#timeslider-root`, horizontally inside
      the viewport, with ≥ 8 px margin. Use one helper shared by both places that set the geography camera, and recompute
      it on resize while the lens is active. If the cluster beside the map makes the 390 px map too small to read
      (map height < 35 % of the safe area), move the "Unlocated articles" cluster above or below the map on portrait
      viewports only. Say which you chose and why.
- [ ] Labels: replace the hard-coded label exclusion with the real rects (header, timeline bar, open article panel,
      lens/lang switchers) read once per resize, not per frame. A label is kept only if its whole box is inside the
      viewport and overlaps none of those rects. Labels must not overlap each other: in anchor order, skip a label
      whose box intersects one already placed. Helsinki, Turku, Tampere, Oulu and Rovaniemi stay visible at 390 and
      1280; the others may drop at 390. Keep the label's own box size (font ≥ 11 px at 390 px).
- [ ] The History lens labels (era anchors) use the same filter and still show at 1280×720. The Meaning lens and the
      summary/road views do not change.
- [ ] Labels and translations: city names stay as they are (no new strings). "Unlocated articles" stays translated
      (fi "Paikantamattomat artikkelit" is the longest) and must fit at 390 px.
- [ ] `npm test` green; `npm run build`; deploy dist per ARCHITECTURE; report the served `assets/index-` hash.

## Assumptions
- Header and timeline-bar heights come from the DOM, not constants. At 390 px they differ from 1280.
- `prefers-reduced-motion` keeps its current behaviour: the camera jumps instead of gliding.

## Scope
- May edit: `src/scene.js` (geography framing + lens-guide label filter only), `src/styles.css`
  (`.projected-lens-guide` and mobile rules for it only), `artifacts/screenshots/030/`.
- Must not touch: `src/ui.js`, `src/main.js`, `src/i18n.js` (spec 031 edits them), `src/api.js`, `index.html`,
  `backend/**` (spec 029 edits `backend/main.py`; spec 027 edits `backend/compare.py`, `scripts/calibrate_compare.py`),
  `scripts/**`, `docs/**`.

## Boundaries
- Always: run `npm test` before reporting; follow docs/design/001-kaamos-sky.md tokens (no new colours).
- Ask first (`orca orchestration ask`): any edit outside scope, new i18n strings, new dependencies.
- Never: git checkout/stash/add -A/commit; edit `docs/memory/*`; delete or weaken tests.
- Deploy note: specs 030 and 031 both rebuild `dist/` from the same folder. Build and deploy only when `git status`
  shows no unfinished 031 edits in src/. Otherwise send a `question` first, so the bundle does not ship another
  worker's work in progress.

## Open questions (defaults chosen)
- Swedish/English city names (Helsingfors, Åbo, Viborg/Vyborg)? Default: no. Names stay Finnish, as in DEMO.md.
- Hide labels that collide, or nudge them? Default: hide (simplest; core cities are listed above).

## Design (brief, no separate design step)
Use the existing `.projected-lens-guide` chip (Kaamos tokens, serif, frost on kaamos). At ≤ 480 px wide: font
0.75rem (≥ 11 px), padding 2px 6px. Centre the chip on its anchor (translate -50 %) so labels do not drift right of
their city. Do not add a new visual element.

## Commands
- Test: `npm test`
- Build/deploy: `npm run build`; `rsync -az --delete -e "ssh -i ~/.ssh/id_serverTech -o IdentitiesOnly=yes" dist/ root@72.61.20.120:/root/wikimemory/dist/`;
  VPS `curl -s http://127.0.0.1:8002/ | grep assets/index-`
- Tunnel (this spec's port): `ssh -i ~/.ssh/id_serverTech -o IdentitiesOnly=yes -N -L 18302:127.0.0.1:8002 root@72.61.20.120`
- Local dev (optional, not the final check): vite with `/api` proxied to `http://127.0.0.1:18302`.

## Playwright (deployed build, `http://127.0.0.1:18302/`)
Screenshots go to `artifacts/screenshots/030/`. In each Geography flow, check in the page that every
`.projected-lens-guide` rect is inside the viewport, intersects neither `#sky-top-bar` nor `#timeslider-root`, and no
two labels intersect. Also record the map outline's screen bbox (project the outline points) and check it is inside the
safe area. Report the numbers.
1. en 1280×720: wait for 2026 -> **Geography** -> wait 3 s -> map + labels + "Unlocated articles" -> `01-geo-1280-en.png`.
2. en 390×844: same -> whole outline visible (Utsjoki top, Viipuri east, Hanko south), ≥ 5 core city labels ->
   `02-geo-390-en.png`.
3. fi 390×844: **Suomi** -> **Maantiede** -> "Paikantamattomat artikkelit" fits -> `03-geo-390-fi.png`.
4. en 390×844 -> 1280×720 resize while in Geography -> reframed, labels valid -> `04-geo-resize.png`.
5. en 1280×720 **History** lens -> era labels still shown -> `05-history-1280-en.png`; **Meaning** -> unchanged ->
   `06-meaning-1280-en.png`.
6. en 1280×720 Geography -> click a star -> article panel open -> no label under the panel -> `07-geo-panel-en.png`.

## Evidence required in worker_done
- Files changed (`git status` limited to scope) and the root cause you confirmed (framing + labels).
- `npm test` counts, `npm run build` result, served hash.
- Playwright: each flow with steps, viewport, UI language, pass/fail, visible label list, outline bbox vs safe area,
  console errors (0), failed requests (0), screenshot paths.
- Open issues and assumptions.

## Failure semantics
Non-zero test exit, an outline cut off at 390 or 1280, a label over the timeline bar, or missing Playwright evidence =
Task failed (not a deliverable).
