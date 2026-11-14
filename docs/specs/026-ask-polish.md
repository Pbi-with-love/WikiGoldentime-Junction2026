# Spec 026: Ask + intro polish (demo dry run 2 bugs)

Read docs/memory/ARCHITECTURE.md first (Definition of done: Playwright E2E on the deployed build; Frontend deploy).
Source: docs/memory/research/demo-dryrun-2.md (and demo-dryrun.md for B2/B6), screenshots in artifacts/demo-dryrun-2/.

## Bugs
1. **Wrong "Machine-translated" label.** The English hero answer ("How did the Winter War end?") cites English sources
   (`sources` langs en, en, fi; `out_lang` null) yet the UI shows "Machine-translated from Finnish". Rule: show the
   machine-translated label only when the shown text was produced by translation (015/016 ui variant whose source
   language differs), never on a default answer written directly in the question's language. Default answers may show a
   quiet "Based on {languages} Wikipedia" line listing source languages instead (fi/sv/en i18n). Fix in src/ui.js using
   the response fields (add a backend field only if the needed fact is not in the response; say which).
2. **"Passage 3 also gives…" leak.** A new answer mentions the internal passage numbering. Fix in backend/ask.py:
   prompts must say never to mention passages/numbers; the output guard (025, reuse `check_output_guard` from
   backend/summary.py) also rejects strings matching /\bpassage\s*\d+\b/i (and fi/sv equivalents: "kappale \d+",
   "avsnitt \d+" when used as a reference) -> retry once, then strip the clause. Rebuild only rows that contain it
   (scan answer_cache default + ui rows; report the count and the list).
3. **Intro sweep clicks.** During the ~10 s intro year sweep, clicking a star shows the wrong year and leaves a
   "Loading…" label stuck on screen. Fix: the first user interaction (click, key, wheel, search, ask) ends the sweep
   immediately at the final year, and any loading label is cleared when its request resolves or is superseded.
4. Open from dry run 1: **B2, B6 and the duplicated history heading** listed in demo-dryrun-2.md "still open" — fix them
   if they are inside this scope; otherwise list why not.
Not in scope: compare passage quality (Moskovan rauha "Also in English" — known recall/precision limit), the Geography
overlap and the 2001 slider (spec 023 Part B), slow steps (report timings only).

## Acceptance
- [ ] Unit tests for the guard (passage leak) and the label rule (pure function); npm test + pytest green.
- [ ] Hero answers keep 2006 -> changed_by 1862876 in en and fi (compare before/after JSON; no rebuild of hero rows unless
      they contain a passage leak).
- [ ] Playwright on the DEPLOYED build (tunnel port 18102): (a) en hero: no "Machine-translated" label, source line shown;
      (b) sv UI hero: label shown (translated variant); (c) new uncached en question: no "Passage N" text; (d) reload and
      click a star at second 2 of the intro: the year jumps to the final year, no stuck "Loading…". Screenshots in
      artifacts/screenshots/026-ask-polish/, 0 console errors, 0 failed requests.
- [ ] Deploy: backend/ask.py + api restart once (check ~/wikimemory/api.log quiet 60 s first, report time), `npm run build`
      + rsync dist per ARCHITECTURE, report the served hash.

## Scope
May edit: backend/ask.py, backend/tests/test_ask.py, src/ui.js, src/main.js (intro sweep + loading label only),
src/timeslider.js (sweep stop hook only), src/i18n.js + src/i18n.test.js, src/styles.css. Must not touch
backend/summary.py (import only), backend/main.py, backend/road.py, backend/compare.py, src/scene.js, scripts/, docs/,
organizers' app/tm, container 3308. A Claude worker (spec 023 Part A) runs a data job: don't touch scripts/fetch_created.py
or its tmux session. No git checkout/stash/add -A/commit. Never edit docs/memory/*.
