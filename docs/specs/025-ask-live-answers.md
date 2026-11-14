# Spec 025: Ask — answers arrive by themselves, in the question's language

Read docs/memory/ARCHITECTURE.md first (incl. "Definition of done" and the Frontend deploy step).

## Problems (verified by the orchestrator, 2026-11-14)
1. A new question takes ~30 s to build (up to 12 per-year LLM calls). Meanwhile `/api/ask` returns `pending: true` with
   "Preparing an answer… Closest passage: …", and the UI shows "retry shortly" + a **Refresh answer** button but never
   re-fetches by itself. Users think Ask "is not connected to AI".
2. `GET /api/ask?q=Who was Hallin Janne?` (English) produced a default answer **in Finnish** ("Hallin Janne eli Juhani
   Heikki Juhaninpoika Mattila…"), although the prompts (backend/ask.py ~72, 85, 1051, 1076) already say "same language
   as the question". The Finnish passages win.

## Acceptance criteria
- [ ] UI auto-poll: while the response is `pending`, the Ask panel re-requests the same question every 3 s (max ~90 s),
      shows a calm progress line (fi/sv/en i18n keys, e.g. "Reading {n} years of edit history…" if the API exposes
      progress, else "Preparing the answer from Wikipedia's history…"), keeps the closest passage visible, and renders the
      answer as soon as it is ready — no click needed. The Refresh button stays as a fallback after the timeout.
      Cancelling (new question / close panel) stops the polling. No duplicate concurrent builds (backend single-flight
      already exists — verify).
- [ ] Answer language: the default answer (`answer`, `facts[].text`, `milestones[].answer`, `milestones[].facts[].text`)
      is in the question's language. Add an output guard like spec 020's `check_output_guard` (reuse it from
      backend/summary.py — import, do not copy): if a generated string is in the wrong language, retry that call once with
      a stronger instruction; if still wrong, translate it with the existing one-call translator (`translate_strings`)
      into the question language. `source_sentence` is never touched. Log the count. Decide how the question language is
      known (`question_lang(q)` guess vs. explicit `ui`/client hint) and state it; a short proper-name question like
      "Who was Hallin Janne?" must count as English.
- [ ] Rebuild: delete and rebuild only the answer_cache rows whose answer language does not match the question
      (find them with the guard over all default rows; report the list), then rebuild their ui translation rows (015/016 rule).
      Hero answers (en + fi) must keep milestones 2003 / 2005 (590107) / 2006 (1862876) / … unchanged — compare before/after.
- [ ] Unit tests (backend/tests/test_ask.py): guard retry path, translator fallback, language decision for
      "Who was Hallin Janne?", "Miten talvisota päättyi?", "Hur slutade vinterkriget?".
- [ ] **Playwright E2E on the deployed build** (per ARCHITECTURE "Definition of done"; tunnel on local port 18052,
      never 18002/18012/18022/18032): (a) en UI: type a NEW question (not cached — pick one, e.g. "When was Hallin Janne
      executed?"), see the progress line, and the answer appears without clicking, in English, within 90 s; (b) fi UI:
      hero "Miten talvisota päättyi?" renders instantly from cache with the 2006 "Muokannut Whiskey~fiwiki" card;
      (c) sv UI: the same new question shows a Swedish translation after ready. Screenshots of each state into
      artifacts/screenshots/025-ask-live-answers/, 0 console errors, 0 failed requests, timings.
- [ ] `npm test` (mock + REAL=ask), pytest (VPS), `npm run build` + deploy dist, api restart once (other workers may
      also restart it: check ~/wikimemory/api.log quiet 60 s first and report the time).

## Scope
May edit: backend/ask.py, backend/tests/test_ask.py, src/ui.js (Ask panel only), src/i18n.js + src/i18n.test.js (new keys),
src/styles.css (progress line), src/api.js (ask only, if the response gains a progress field), src/mock/index.js +
src/mock/contract.test.js (ask only). Must not touch backend/summary.py (import only), backend/main.py, backend/compare.py,
src/scene.js, src/timeslider.js, scripts/, docs/, organizers' app/tm, container 3308. Other workers are in this folder
(specs 022, 023): no git checkout/stash/add -A/commit. Never edit docs/memory/*.
