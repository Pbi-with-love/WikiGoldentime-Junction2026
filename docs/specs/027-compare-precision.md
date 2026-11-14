# Spec 027: Cross-language compare — fewer off-topic matches (B2)

Read docs/memory/ARCHITECTURE.md first (Definition of done) and docs/memory/research/compare-threshold.md (017 calibration).

## Bug (demo dry runs 1–2, B2)
On Talvisota fi 1256, section "Moskovan rauha" shows "Also in English Wikipedia" with an off-topic passage (from the en
"Foreign support" section: Allied troops / Swedish ore). Cause: backend/compare.py scores a fi section by the MIN cosine
distance over all chunk pairs (fi section chunks x all sibling chunks) with one global THRESHOLD 0.35, so a single
lucky chunk pair from an unrelated sibling section can win.

## Goal
Raise precision of the shown passages without losing much recall, with a simple, explainable rule, measured on the same
132 blind-labelled pairs (data/compare_labels.tsv, scripts/calibrate_compare.py).

## Acceptance criteria
- [ ] Try at least these rules in scripts/calibrate_compare.py, report P/R/F1 per rule (overall + sv/en) and
      passage_ok rate among matches:
      (a) current min-pair (baseline, THRESHOLD 0.35);
      (b) **mutual best**: the sibling chunk that wins for fi section S must itself have S as its best fi section;
      (c) **section-to-section**: compare fi section S with each sibling SECTION (mean of the top-2 chunk-pair similarities,
          or centroid of the section's chunk vectors) and show the best chunk of the winning sibling section;
      (d) a combination you justify. Pick the rule with the best F1 among those with P >= 0.90 (or the highest P if none
      reaches 0.90 — then ask before shipping). Re-tune the threshold per rule.
- [ ] Talvisota table (as in compare-threshold.md section 6) before/after; "Moskovan rauha" en must be either a correct
      passage (about the peace treaty) or "Only in Finnish Wikipedia". Report the same for 1150 and 440.
- [ ] Latency stays computed on request: /api/compare warm max <= 300 ms on the 3 demo pages + 10 random fi pages.
- [ ] Update docs only in the calibration report artifact (artifacts/017-compare/ or a new artifacts/027-compare/report.md);
      the orchestrator copies it into docs/memory/research/.
- [ ] Tests: backend/tests/test_compare.py updated for the new rule (pure function tests with fake vectors).
- [ ] Deploy compare.py, restart the api tmux once (check ~/wikimemory/api.log quiet 60 s, report time), then
      Playwright on the DEPLOYED build (tunnel port 18132): Talvisota Summary Trail compare rows in en and fi UI,
      Moskovan rauha card screenshot; 0 console errors, 0 failed requests; screenshots in artifacts/screenshots/027/.

## Scope
May edit: backend/compare.py, backend/tests/test_compare.py, scripts/calibrate_compare.py, data/compare_labels.tsv (only to
add labels, never change existing ones). No frontend change expected (response shape unchanged). Must not touch
backend/summary.py, backend/main.py, src/, docs/, organizers' app/tm, container 3308, chunk tables. Another worker
(spec 028) edits src/ in this folder: no git checkout/stash/add -A/commit. Never edit docs/memory/*.
