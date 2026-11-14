# Spec 020: Summary language + reference-section fixes (demo blocker)

Read docs/memory/ARCHITECTURE.md first. Found by the demo dry run (docs/memory/research/demo-dryrun.md).

## Goal
`/api/summary/en/33924` (Winter War, shown for Talvisota with ui=en, spec 016 native variant) has:
- section 2 "Opposing forces" and 12 "General and cited references" summarised **in Finnish**;
- section 11 "Citations" whose one_line is LLM meta-text ("The provided text is only a list of Wikipedia citations…");
- sections 10–12 are reference sections that should never be summarised.

## Acceptance criteria
- [ ] `DROP_HEADINGS` in backend/summary.py also covers en and sv reference/navigation headings (casefolded):
      en: references, notes, explanatory notes, citations, general and cited references, sources, bibliography,
      further reading, external links, see also, footnotes; sv: referenser, noter, källor, externa länkar, se även,
      litteratur, fotnoter; fi: add huomautuksia (+ keep existing). spec 017 compare imports the same split, so it
      inherits this (check `/api/compare/fi/1256` no longer lists "Huomautuksia"; report the section count change).
- [ ] Every LLM summary call (tldr/overview, section one_line/summary, facts label/value) writes in the ARTICLE's
      language (`article.lang`) for default rows; the prompt states the language name explicitly. Translation rows
      (016) are unchanged.
- [ ] Output guard: if a generated string is in the wrong language or is meta-text (starts with "The provided text",
      "The user message", "I cannot", "As an AI", or similar), fall back to the extractive value for that string and
      count it in BuildStats (log). Use a cheap check (e.g. stopword ratio per language; shortcut comment allowed).
- [ ] Unit tests: DROP_HEADINGS en/sv cases; guard rejects a Finnish one_line for an en article and a meta-text line.
- [ ] Rebuild on the VPS (`backend/scripts/prewarm_summaries.py --force`) the default rows of the 3 demo articles
      AND their sv/en siblings (Talvisota sv 23612 / en 33924, and the siblings of fi 1150 and fi 440 — find them via
      wikidata_id), then delete + rebuild their ui translation rows if any. Report sections per row before/after and
      prove: en 33924 has no reference sections, every one_line is English (print them).
- [ ] section_history (spec 018) parity: the DROP_HEADINGS change may change section numbering for fi pages that
      have "Huomautuksia"; check `/api/summary/fi/1256` history still attaches correctly (14 -> 13 sections expected)
      and rebuild section_history rows of the 3 demo pages (`scripts/section_history.py --pages ...` or the
      equivalent); report whether a full rebuild is needed (do NOT start a full rebuild without asking).

## Scope
May edit: backend/summary.py, backend/tests/test_summary.py, backend/scripts/prewarm_summaries.py (only if needed),
scripts/section_history.py (only a --pages option if missing). VPS: deploy, restart the `api` tmux once (another
worker on spec 021 may also restart it: check ~/wikimemory/api.log is quiet for 60 s first and say when you did),
rebuild rows as above. Must not touch: src/, backend/main.py, backend/ask.py, backend/compare.py, docs/, the
organizers' app/tm, container 3308, chunk tables.

## Evidence (worker_done)
pytest counts (VPS), the before/after one_line list for en 33924, sections per rebuilt row, compare section count
for fi 1256, section_history check, api restart time. Never edit docs/memory/*.
