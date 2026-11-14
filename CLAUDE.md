# Junction 2026 — Hackathon

Topic: **wikimemory** — MariaDB challenge "Wikipedia Through Time" (RAG + system-versioned tables).
Project facts: `docs/memory/ARCHITECTURE.md`. Progress and backlog: `docs/memory/STATUS.md`.
Read both before writing a new spec.

## Roles
- **Claude (Opus 5.5) main session = orchestrator.** Dispatches, reviews, merges, updates STATUS. Never writes feature code; never becomes a subagent (it must end its turn so Orca can wake it).
- **`spec-writer` / `researcher` = Claude subagents** (Opus / Haiku). Spec-writer writes `docs/specs/*`; researcher writes `docs/memory/research/*`.
- **Antigravity (Argon) = design only** (`--agent antigravity`, rules in `GEMINI.md`). Writes a design handoff file; no code, no tests.
- **Antigravity (Gemini 4 Hydrogen, effort medium) = everything else** (`--agent antigravity --model gemini-4-hydrogen-medium`; plain `--model hydrogen` ignores `--effort` and runs XHigh; model id verified with `agy models`, rules in `HYDROGEN.md`): code, tests, `playwright-cli`, integration.

- **Claude implementation worker (user-approved 2026-11-14)** (`--agent claude --model claude-sonnet-5-5`): implements a spec when the
  orchestrator assigns it (e.g. to run beside a busy Hydrogen worker or when Antigravity quota is out). If you are such a
  worker (your prompt says "You are an Orca implementation worker"), you are NOT the orchestrator: follow `HYDROGEN.md` and the spec,
  write code and tests, never edit `docs/memory/*`, report with `worker_done`.

## Workflow (sequential, one worker at a time)
0. Topic/tech unclear -> orchestrator calls `researcher` first. (Subagents can't spawn subagents, so the orchestrator calls researcher, then spec-writer.)
1. Delegate to `spec-writer` -> `docs/specs/NNN-<slug>.md` (from `docs/specs/TEMPLATE.md`). Review it, commit it.
2. **UI spec only — design step.** Dispatch Argon, wait for `worker_done`, check `docs/design/NNN-<slug>.md` exists and answers the spec's `## Design` brief:
   `orca orchestration worker-start --spec "Read GEMINI.md, then docs/specs/NNN-<slug>.md. Design only. Write the handoff to docs/design/NNN-<slug>.md." --worktree current --agent antigravity`
   Non-UI spec: skip this step.
3. **Implementation step.** Dispatch Hydrogen, then **end the turn**:
   `orca orchestration worker-start --spec "Read HYDROGEN.md, then docs/specs/NNN-<slug>.md (and docs/design/NNN-<slug>.md if it exists). Implement it." --worktree current --agent antigravity --model gemini-4-hydrogen-medium`
   Always begin the spec text with "Read GEMINI.md" / "Read HYDROGEN.md": both workers are Antigravity and auto-read `GEMINI.md`, not `HYDROGEN.md`, so name the file explicitly.
4. On wake: answer `question`s with `orca orchestration reply`; steer with `orca orchestration send --to dispatch:<id>`. Never poll.
5. On `worker_done`: check the evidence against the spec (files in scope, test command + counts, screenshots if UI). Re-run tests yourself only when evidence is missing or contradictory. Fixes go back to the worker via `send`.
6. Commit the result, update `docs/memory/STATUS.md` (one line per spec: id | state | evidence).

## Parallel / multi-task (only when you choose it)
Guide: `orca skills get orchestration` (+ `--reference references/coordinator-loop.md`).
- Two or more workers at once: each gets `--worktree new-child --name <slug>`. Commit `docs/specs/`, `docs/design/`, `docs/memory/` first (a new worktree only sees committed files). After a worker settles: merge its branch into `main` yourself, then `worker-release`.
- DAG: `run-create --objective ...`, `task-create --spec ... --deps '[]'`, `task-list --ready --brief`, `worker-start --task <id> --worktree current --agent antigravity` (add `--model gemini-4-hydrogen-medium` for the implementation task). Make the Hydrogen task depend on its Argon design task. On every wake start every ready Task, then end the turn.
- Later `run-create` keeps older Runs; pass `--run <id>` for non-newest ones.
- Workers' internal subagents are their business: Claude sees one `worker_done` per Task.
- Stuck/failed worker: `worker-show`, `worker-read`, then `send`; see `--reference references/recovery-and-cleanup.md`. Never mark a failed Task completed.

## Rules
- Specs are self-contained: goal, acceptance criteria, editable files, test command, evidence required, and (UI) a design brief.
- Keep `docs/memory/*` current; read it before writing a new spec.

## Project rules for every spec (wikimemory)
Workers read `HYDROGEN.md` and the spec, not this file. Anything a worker must obey has to be in the
spec itself or in `docs/memory/ARCHITECTURE.md`, and every backend spec must say
"Read docs/memory/ARCHITECTURE.md first".
- **API contract:** `src/api.js` + `src/mock/contract.test.js` are the single source of truth. A backend
  spec names the endpoint(s), the exact response shape, and requires the contract test to pass against
  the real API before its per-endpoint mock flag is switched off.
- **Reuse the organizers' code** (search, as_of, versions, clean); never rewrite it.
- **Precompute** heavy history aggregates into tables; no whole-history query per request.
- **LLM output** only from the text given, facts carry their source sentence, JSON only, cached in MariaDB.
- **Evidence for a backend spec:** test command + pass count, `curl` sample of each endpoint,
  measured response time, row counts of any new table.
- **Server work** (data loads, merges) happens on the VPS through SSH; long jobs in
  `tmux new -d -s NAME '...'`. Every service binds to 127.0.0.1.
- Mock text stays marked "[mock]"; never present it as real Wikipedia content.