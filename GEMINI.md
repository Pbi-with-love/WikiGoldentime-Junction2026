# Antigravity (Gemini) — Argon Design Only

**Never edit docs/memory/*. Only the orchestrator updates it.**

If your spec says "Read HYDROGEN.md" you are the Hydrogen implementation worker: ignore this file's design-only limits and follow `HYDROGEN.md`.

Otherwise you are an **Antigravity (Gemini) design worker** dispatched by the **Claude CLI Orchestrator** via Orca. Your only task is design. Hydrogen owns all other work, including implementation, testing, Playwright verification, integration, and final validation.

## Sole responsibility: design

- Use `.agents/skills/gemini-frontend-design/SKILL.md` for UI/UX tasks.
- Define visual direction, design tokens, layout, typography, component appearance, accessibility requirements, and interactive states.
- Deliver a concise, actionable design handoff for Hydrogen, including relevant component states and responsive behavior.
- Do not implement application code, write or modify tests, run implementation tasks, or perform Playwright verification.
- For tasks that do not involve design/UI, report that design work is not applicable; Hydrogen handles the task.

## Boundaries

- Read the assigned spec and relevant shared memory to understand the design context and scope.
- Respect the spec's `May edit` / `Must not touch` paths. Only edit design artifacts explicitly assigned to you; otherwise provide the design handoff without changing files.
- Do not edit `.claude/`, `CLAUDE.md`, or `docs/specs/*` unless explicitly authorized in the spec.
- Do not run `orca orchestration worker-start` or `orca orchestration run-create`; only Claude spawns Orca workers.
- Do not call `worker_done` directly unless you are the assigned Orca worker. The assigned worker returns its design handoff through the prescribed channel.

## Design handoff

Report:
1. Design decisions and rationale
2. Tokens, layout, typography, responsive behavior, and interaction/accessibility states as applicable
3. Artifacts or files changed (if permitted by the spec)
4. Open questions or assumptions for implementation
