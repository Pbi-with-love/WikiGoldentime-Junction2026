# Spec 012: /api/ask milestones — count only real Wikipedia changes and name the edit that made them

Read docs/memory/ARCHITECTURE.md first (Infrastructure, Schemas, Reuse, Rules, API contract). The SSH
command, the "no host `mariadb` client" rule, the tmux rule and "never touch the organizers' apps"
all apply here.

Depends on: spec 010 (done; `backend/ask.py`, `scripts/build_answers.py`, `wikirag.answer_cache`).
This is a correctness fix before the demo. The response shape stays the same. The only change to
it is one new field per milestone.

## Goal
Today a milestone starts whenever the LLM's English fact text changes, and it shows the year-end
snapshot revision. After this fix:
- A milestone starts only when the Finnish source text really changed.
- Each milestone names the revision that made the change (`changed_by`).
- Changes that were undone in the same window (vandalism, reverts) are ignored.

### The verified trace this fix must reproduce (Talvisota, page_id 1256, hero question "How did the Winter War end?")
- The treaty date changed in Wikipedia only through **rev 1862876** (2006-11-07, user
  `Whiskey~fiwiki`, comment starting "siistintää"). That revision is still in effect today, and
  its text already says "illalla" (in the evening).
- Rev 12385 (2004-03-26, 007zoo) changed 13 -> 12 March, and rev 30486 (2004-07-10, Hautala)
  changed it back. Year-end snapshots never show this, so it is not a milestone.
- Removals in 2005-11, 2005-12, 2008-01 and 2010-12 were vandalism, reverted within 1–2 minutes.
  None of them is a milestone, and none may become a `changed_by`.
- Today's API wrongly returns 2007–08 (one period late) and a separate 2009–21 milestone. That
  second milestone comes only from the LLM rewording "12 March" as "evening of 12 March".

## Definitions (use these names in code and logs)
- **sentence key** of a period result is the set of `summary.normalize_ws(f["source_sentence"])`
  over the result's `facts`. A result with `found: false` has the empty set.
- **cleaned text** of a version is `summary.normalize_ws(format_cleaned_blocks(history.clean(text)))`.
  It is the whole article, not one section.
- **called year** is a year for which the history LLM was actually called (the indices from
  `select_llm_year_indices`). Other years inherit a result, so they are not evidence.
- **change predicate** for a candidate change from kept result P to new result C:
  `new = key(C) - key(P)`, `dropped = key(P) - key(C)`. `holds(text)` is true when every
  sentence in `new` is a substring of the cleaned text and no sentence in `dropped` is.
- **window** is the versions of the top article with
  `row_start >= P's snapshot row_start AND row_start <= C's snapshot row_start`, ordered by
  `row_start`. P's snapshot is the snapshot of the last called year in the kept run, and C's is
  the snapshot of the called year being tested. Windows of one question do not overlap.

**Amendment A2' (orchestrator, 2026-11-14 after the first B2):** `holds(text)` is true when every
sentence in `new` is a substring of the cleaned text, if `new` is non-empty. Only when `new` is empty,
`holds(text)` is true when no sentence in `dropped` is in the text. Reason: in the first rebuild the
LLM switched to another sentence while the dropped Hanko sentence stayed in the article until 2026,
so no change after 2005 was ever confirmed and the hero check failed.

**Amendment A2'' (approved, replaces the confirm rule of A2'):** a candidate change counts only if it brings NEW NUMBERS. material(s) = set of digit tokens (regex \d+) in sentence s. covered = union of material() over key(P). new_material = [s in new if material(s) - covered is non-empty]. If new_material is empty and new is non-empty -> rewording -> merge into P (no boundary). holds(text) = every sentence in new_material is a substring of the cleaned text (only these, not all of new). Dropped-only case (new empty) unchanged from A2'. changed_by = the origin found by the A2 scan for that holds() (all material sentences present => effectively the latest material origin, e.g. 1862876 not 1833805). Mark it in code: 'shortcut: number-only change detection; misses changes to names without numbers, upgrade with an LLM same-answer check if needed'. B3 updated: for 'Miten talvisota päättyi?' and 'How did the Winter War end?' the treaty milestone has from_year == 2006 and changed_by.rev_id == 1862876 and to_year >= 2020 (a 2021 split is allowed if it brings new numbers). If the EN question still fails only because the LLM did not pick the treaty sentence until a later year, do NOT change prompts: report it as a known limit with its milestones. Add A5 cases: rewording with same numbers -> 1 milestone; new number sentence + reworded sentence in one window -> changed_by = the number sentence's origin. Then deploy, restart api, rebuild B2 --force (go given), B3-B4, worker_done with full evidence incl. per-question milestone counts before/A2'/A2''.
Reason: the second rebuild split on LLM rewordings (menetti -> luovutti, a double space) and dated the 2006 treaty change to a 2007 rewording.

## Response shape (additive only)
Every milestone gets one new key, and all other keys keep their names, types and meaning:
```json
"changed_by": { "rev_id": 1862876, "row_start": "2006-11-07T..Z", "user": "Whiskey~fiwiki",
                "comment": "siistintää...", "url": "https://fi.wikipedia.org/w/index.php?oldid=1862876" }
```
- `changed_by` is `null` for the first milestone, and also when no confirming revision was found
  (see A3).
- The milestone's existing `rev_id`, `user`, `comment`, `row_start` and `url` are still the
  snapshot of `from_year`. The UI's diff uses them, so they stay as they are.

## Acceptance criteria
### A. Milestone building (`backend/ask.py`, pure logic is unit-testable)
- [ ] **A1. Merge on source sentences, never on English wording.** Walk the called-year results
      in year order, keeping a current "kept" result P.
      - If `key(C) == key(P)`, C merges into P's milestone. This holds even when C's English
        `answer` or `facts[].text` differ.
      - If the keys differ, run the window scan (A2). The change is **confirmed** only if
        `holds()` is false on the first version in the window and the scan returns an origin.
        Otherwise C merges into P.
      - A merged milestone keeps P's `answer` and `facts` verbatim. C's text is discarded.
      - `compute_answer_hash`/`merge_milestones` no longer decide boundaries. Replace or remove
        them; do not keep dead code.
- [ ] **A2. Find the edit that made the change (one pass, reverts collapsed).** Scan the window
      in order, cleaning each distinct `sha1` once (cache within the window):
      - The first time `holds()` becomes true at version v: if v is a revert (`is_revert` from
        `history.versions()`) and v's `sha1` matches an earlier version in the window where
        `holds()` was true, the origin is that earlier version's origin (the revert restored
        it). Otherwise the origin is v.
      - When `holds()` becomes false, the origin is cleared. Remember origin per `sha1` so a
        later revert can restore it.
      - At the end of the window, the current origin is `changed_by`. Earlier true runs that
        ended false are **reverted_later**. They are ignored, and only their count is logged.
      - Use `history.versions(cur, page_id, table="wikihistory.article")` for `is_revert`
        (the organizers' revert definition, reused). Get the text and sha1 with one query on
        `wikihistory.article FOR SYSTEM_TIME ALL WHERE page_id = ? AND row_start BETWEEN ? AND ?
        ORDER BY row_start`, with `SET time_zone = '+00:00'`.
- [ ] **A3. Years.**
      - A confirmed milestone's `from_year` is the UTC year of `changed_by.row_start`, clamped to
        the range (last called year of P, C's year]. The previous milestone's `to_year` is
        `from_year - 1`.
      - The snapshot fields come from the first snapshot whose year >= `from_year`.
      - Milestones still do not overlap, are sorted, and the last one ends at the current year.
      - If `holds()` is true at the end of the window but no origin was found, which should not
        happen, the change still counts. In that case `from_year` is C's year,
        `changed_by: null`, and the build logs a warning.
- [ ] **A4. Bounded cost.**
      - This runs only in the build path (`build_and_cache_ask`, used by `build_answers.py` and
        the background build). It never runs in the request path.
      - It adds **no** LLM calls, and the cap `ASK_MAX_LLM_CALLS` and its sampling stay unchanged.
      - Windows are disjoint, so a question reads each version's text at most once. The build
        log records per question: windows scanned, versions read, distinct sha1 cleaned,
        reverted_later count, and scan seconds.
- [ ] **A5. Unit test on synthetic versions (no DB, no LLM)** in `backend/tests/test_ask.py`.
      The test feeds fake called-year results and fake version rows (rev_id, row_start, sha1,
      text, is_revert), and asserts:
      - Same sentence key with different English text gives 1 milestone, with the first answer
        text kept verbatim.
      - A real replacement A -> A' made at version v gives `changed_by.rev_id == v`, and
        `from_year` = v's year, even when the next called year is 2 years later (the cap case).
      - Vandalism removes A' and a revert (same sha1 as before) restores it within the window.
        `changed_by` is still the original v, not the revert.
      - A change undone inside the window (true run ended false) is not a milestone and
        `reverted_later == 1`.
      - Different keys where the "new" sentence was already in the window's first text
        (the LLM just picked another sentence) give no new milestone.
      - The first milestone has `changed_by: null`.
- [ ] **A6. Pinned DB integration test (real 3307 data, no LLM)** in `backend/tests/test_ask.py`,
      marked like spec 010's existing integration test.
      - Take the Talvisota (1256) cleaned text at `2005-12-31 23:59:59` and at
        `2006-12-31 23:59:59` (via `history.as_of`). From each, take the sentence containing
        `maaliskuuta 1940` that names the peace treaty date, as P's and C's single source
        sentence. Use code to pick it, not hand-typed text, and print both in the test output.
      - Run the A2 scan between those snapshots. It must return
        `changed_by.rev_id == 1862876` with `row_start` starting `2006-11-07`.
      - Run the same scan between the end-2006 and end-2021 snapshots with that treaty
        sentence. It must not confirm a change.
- [ ] **A7. Contract.** Edit only the `GET /api/ask` test in `src/mock/contract.test.js`, in
      real mode only (`!MOCK.ask`):
      - Every milestone has a `changed_by` key.
      - The first milestone's `changed_by` is null.
      - Any non-null `changed_by` has a numeric `rev_id` and a `url` containing `oldid=`.
      - Mock mode assertions and the mock fixtures are unchanged.

### B. Rebuild (gated; do NOT start without the orchestrator's go)
- [ ] **B1.** Before rebuilding, send `orca orchestration ask`: "012 code done, tests green; may I
      rebuild answer_cache now?" Rebuild only after the orchestrator confirms that the full
      chunk embedding (spec 008) is finished.
- [ ] **B2.** Rebuild:
      `tmux new -d -s answers 'cd ~/wikimemory && .venv/bin/python scripts/build_answers.py --questions data/demo-questions.tsv --force > answers012.log 2>&1'`.
      Every history question still has >= 2 milestones, which is the existing check in
      `build_answers.py`. List any question that now drops below 2 and say why.
- [ ] **B3. Hero check on the cached JSON**, for both `How did the Winter War end?` and
      `Miten talvisota päättyi?`:
      - The milestone whose source sentences contain the 12 March treaty date has
        `changed_by.rev_id == 1862876` and `from_year == 2006`.
      - That milestone's `to_year >= 2021`, so there is no separate 2009 milestone from rewording.
      - If either check fails, do not loosen it. Send a `question` with the Finnish source
        sentences on both sides of the boundary and the `changed_by` found.
- [ ] **B4.** The contract test passes in real mode (`REAL=ask`) and in mock mode.

## Assumptions
- Substring matching on whitespace-normalized cleaned text is the same test as spec 010's
  grounding check. Source sentences were grounded against the section context, and that context
  is a subset of the whole cleaned article, so matching against the whole article is sound.
- Snapshots are year-end, as in spec 010. Only called years are evidence. Inherited years are
  reassigned by A3.
- The 3307 connection already sees `wikihistory` (spec 002), so no extra connection is needed.
- Code reaches the VPS `~/wikimemory/` the same way spec 010 deployed it. After deploying,
  restart only our `api` tmux session so background builds use the new code. Never touch
  `app`/`tm`.

## Scope
- May edit:
  - `backend/ask.py`
  - `scripts/build_answers.py` (log columns only, if needed)
  - `backend/tests/test_ask.py` (update the existing merge test to the new semantics; do not
    delete coverage)
  - `src/mock/contract.test.js` (the `GET /api/ask` test only)
- On the VPS may: deploy those files, restart the `api` tmux session, and run B2 after the go.
- Must not touch:
  - `backend/history.py` (organizers' code, reused as-is) and `backend/summary.py`
  - `src/api.js`, `src/ui.js`, `src/mock/index.js`, `src/mock/fixtures.js`
  - `docs/memory/*`, other specs
  - Any table schema (`answer_cache` rows only, via the rebuild)
  - The 3308 container
  - The organizers' repos, venvs and the `app`/`tm` sessions

## Boundaries
- Always:
  - Follow docs/memory/CONVENTIONS.md.
  - Use `SET time_zone = '+00:00'` in every SVT query.
  - Run the tests before reporting.
  - Run long jobs in tmux.
  - Keep the response shape additive.
- Ask first (via `orca orchestration ask`):
  - The B2 rebuild.
  - Any schema change or new dependency.
  - Any edit outside scope.
  - Any change to the LLM prompts or cap.
- Never:
  - Add LLM calls.
  - Scan versions in the request path.
  - Rewrite `history.clean`/`versions`.
  - Loosen the pinned 1862876 assertions.
  - Commit or log `ANTHROPIC_API_KEY`.
  - Delete failing tests.

## Open questions (defaults chosen)
- The LLM returned `found: false` earlier but `found: true` later, and the "new" sentences were
  already in the earlier text, so the LLM just missed them. Default: no change. The milestone
  keeps the earlier answer ("did not answer yet"), as rule 1 requires. Alternative: back-fill
  the found answer.
- Should reverted attempts be exposed (e.g. `changed_by.reverted_attempts: n`)? Default: no, log
  only. This avoids a UI change before the demo.
- After a non-confirmed candidate, the change predicate may already hold at the next window's
  start (for example, the LLM picked a different sentence that was edited later). Default: no
  change. This is a known limit; it is logged.
- The UI still shows "changed N times" with N = `milestones.length`. The true number of changes
  is `length - 1`. That stays a UI follow-up (as in spec 010).

## Approach (Hydrogen)
1. Write the A5 unit tests first (red). The pure scan/merge functions take version rows and
   results as arguments; DB access is a thin wrapper.
2. Implement A1–A4 in `backend/ask.py` and wire them into `build_and_cache_ask` after
   `_run_history_llms`. Use the 3307 connection for the window query and
   `history.versions(..., table="wikihistory.article")`.
3. Add the A6 integration test and make it pass on the VPS.
4. Update the contract test (A7) and run it in mock mode.
5. Deploy, restart `api`, ask for the go (B1), then do B2–B4.

## Commands
- SSH: `ssh -i ~/.ssh/id_serverTech -o IdentitiesOnly=yes root@72.61.20.120`
- Test (VPS): `cd ~/wikimemory && .venv/bin/pytest backend/tests/test_ask.py -q`
- Rebuild (VPS, after the go): see B2
- Hero JSON: `curl -s 'http://127.0.0.1:8002/api/ask?q=How%20did%20the%20Winter%20War%20end%3F' | python3 -m json.tool`
- Contract (local): `npm test` (mock) and with `REAL=ask` through the tunnel (spec 006's mechanism).

## Evidence required in worker_done
One consolidated report (with per-subtask evidence if the work is split), containing:
- Files changed and the `git diff --stat`.
- The pytest command and its pass/fail counts, including A5 (each case named) and A6. A6 must
  print the two treaty sentences, the `changed_by` (1862876, 2006-11-07), and the
  2006 -> 2021 "not confirmed" result.
- `npm test` counts in mock mode and in real mode (`REAL=ask`).
- From the build log of the hero question: windows scanned, versions read, distinct sha1
  cleaned, reverted_later count, scan seconds, and LLM calls (must be <= the cap and not higher
  than before).
- After B2:
  - The full hero JSON milestones for both languages (`from_year`, `to_year`, `changed_by`,
    and the Finnish source sentences).
  - The `build_answers.py` SUMMARY line.
  - A per-question milestone count, before and after.
  - `SELECT COUNT(*) FROM wikirag.answer_cache`.
  - The cache-hit time (median of 10 `curl` calls), which must still be under 300 ms.
- Open issues / assumptions.

## Failure semantics
Any of these means the Task failed (not a deliverable):
- A non-zero pytest exit, or a contract test failure in either mode.
- The A6 or B3 pinned assertions are not met, unless reported as a `question` with sentences.
- Any extra LLM call.
- Any version scan in the request path.
- A rebuild started without the orchestrator's go.
- Any touch to the 3308 container or the `app`/`tm` sessions.
