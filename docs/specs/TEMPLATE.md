# Spec NNN: <title>

## Goal
<one or two sentences>

## Acceptance criteria
- [ ] ...

## Assumptions
- ...

## Scope
- May edit: <paths>
- Must not touch: <paths>

## Boundaries
- Always: run tests before reporting, follow docs/memory/CONVENTIONS.md
- Ask first (via `orca orchestration ask`): new dependencies, schema changes, edits outside scope
- Never: commit secrets, delete failing tests

## Open questions
- ...

## Design (UI specs only; omit otherwise)
Brief for Argon: users, screens/components, mood/references, constraints (stack, a11y).
Argon May edit: `docs/design/NNN-<slug>.md` only (the handoff). Hydrogen implements from it; Hydrogen May edit excludes `docs/design/`.

## Approach (Hydrogen)
1. Implement the criteria above; add or update tests where useful.
2. Run the test command until green.
3. UI work: verify with `playwright-cli` (list the flows to check).

## Commands
- Test: `<cmd>`
- Run: `<cmd>`

## Playwright
UI flows to verify with `playwright-cli` (omit if no UI). Screenshots go to `artifacts/screenshots/<spec-id>/`.
1. <url> -> <action> -> <expected>

## Evidence required in worker_done
- Files changed
- Test output (pass/fail counts)
- Playwright screenshots/paths (if UI)
- Open issues / assumptions

## Failure semantics
Non-zero test exit = Task failed (not a deliverable).
