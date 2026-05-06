---
name: spec-fast
description: Orchestrate the full spec-driven workflow (spec-init to spec-review) automatically with bounded rework loops. Use when Codex should drive the complete change lifecycle without manual phase handoffs.
license: MIT
---

Orchestrate the full spec-driven workflow from Codex with state-aware resume and bounded rework.

**Core contract**

- Codex remains the orchestrator across all phases.
- OpenSpec remains the source of truth for change state and phase boundaries.
- spec-fast is an orchestration skill; it delegates to existing phase skills (spec-init, spec-plan, spec-impl, spec-review) rather than implementing parallel execution paths.
- The first implementation attempt is followed by at most 2 rework rounds before the change stops for manual intervention.
- Codex owns all acceptance and archive decisions; Claude must not decide final acceptance or trigger archive.
- Archive happens manually after Codex confirms archive-ready, not automatically.

**State model**

Each change tracks phase progression as a linear sequence:

1. `proposal` - Change artifact created
2. `planning` - Design and tasks artifacts ready
3. `implementation` - Execution in progress or complete
4. `review` - Acceptance gate passed or failed

A phase is `pending` if its artifacts are not yet created, `ready` if artifacts exist but execution has not started, `complete` if the phase succeeded, or `failed` if rework is needed.

**Rework model**

- Rework budget: 2 rounds after the initial implementation attempt
- Attempt 1: Initial spec-impl
- Attempt 2: First rework after review failure
- Attempt 3: Second rework after review failure (final attempt)
- After attempt 3 fails review, the change stops as `retry-budget-exhausted`

**Steps**

1. Confirm OpenSpec is available with `openspec --version`.
2. Inspect current changes with `openspec list --json`.
3. Select or create the active change:
   - If no suitable change exists, create one with `openspec new change "<change-name>"`.
   - Run `openspec status --change "<change-name>" --json` to get the current phase state.
4. Determine the first pending or ready phase by inspecting OpenSpec artifact state.
5. Resume from that phase by invoking the corresponding skill:
   - `spec-init` if proposal is missing or stale
   - `spec-plan` if planning artifacts are not ready
   - `spec-impl` if implementation is pending or ready
   - `spec-review` if review is pending or ready
6. After each phase completes, re-inspect OpenSpec state before proceeding to the next phase.
7. After spec-impl, run spec-review to verify the implementation.
8. If review passes: mark the change `archive-ready` and surface the archive approval step for Codex.
9. If review fails with a rework packet and rework budget remains:
   - Increment the attempt counter
   - Apply the rework packet to the relevant OpenSpec artifacts
   - Re-run spec-impl with the updated context
   - Re-run spec-review
10. If review fails and rework budget is exhausted: stop as `retry-budget-exhausted` and surface the blocker for manual intervention.
11. If planning, dispatch, or review cannot proceed due to external blockers: stop as `blocked` and surface the blocker.

**Output**

After each orchestration cycle, surface:

- active change id
- current phase
- attempt number (if past initial impl)
- final state (`in-progress`, `archive-ready`, `blocked`, `retry-budget-exhausted`)
- next manual step (if any)
- latest execution packet context (if impl was run)
- latest review decision with failure reasons (if review failed)

**Guardrails**

- Do not run spec-init, spec-plan, spec-impl, or spec-review directly from Claude; always invoke them through Codex orchestration.
- Do not let Claude decide final acceptance or trigger archive.
- Do not skip OpenSpec state checks between phases.
- Do not continue to the next phase without confirming the current phase reached a terminal state in OpenSpec.
- Do not exceed the rework budget of 2 rounds after initial implementation.
- Reuse existing spec-impl execution rules and spec-review acceptance criteria verbatim; do not invent parallel acceptance paths.
- If a phase skill reports blocked, stop immediately and surface the blocker rather than attempting to work around it.
- Keep all change state mutations in OpenSpec; do not track phase progress outside the OpenSpec artifact model.
