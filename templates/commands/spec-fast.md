---
description: 'One skill orchestrates the full spec-driven path with bounded rework'
---
<!-- CCG:SPEC:FAST:START -->
**Core Philosophy**
- One skill drives the maintained spec-driven path from request intake through review readiness.
- Codex orchestrates phase transitions; Claude executes implementation only when `spec-impl` dispatches work.
- Resumption picks up at the first missing, pending, or failed phase instead of replaying everything.
- Rework is bounded: two rework rounds by default after the initial implementation attempt.

**Guardrails**
- `spec-fast` is an orchestration entrypoint, not an execution skill.
- Never auto-archive. The default success stop state is `archive-ready`.
- Never bypass OpenSpec artifacts before implementation begins.
- Never let Claude decide acceptance, archive readiness, or archive.
- When stopped, always surface the stop reason, current phase, and next human decision point.

**Steps**
1. **Select or create active change**
   - Run `openspec list --json` to find existing active changes.
   - If no suitable active change exists, create or initialize the change through the maintained `spec-init` path.
   - Confirm the change id and load its state with `openspec status --change "<change_id>" --json`.

2. **Determine first missing phase**
   - Evaluate current artifact and execution state from OpenSpec.
   - Identify the first missing, pending, blocked, or failed maintained phase.
   - Report: change id, current phase, detected gap, retry budget remaining.

3. **Resume or start the missing phase**
   - If project or change initialization is incomplete: invoke `/ccsm:spec-init`.
   - If proposal/design/specs/tasks are missing or not execution-ready: invoke `/ccsm:spec-plan`.
   - If implementation is next: invoke `/ccsm:spec-impl`.
   - If review is next: invoke `/ccsm:spec-review`.
   - Reuse the maintained phase contracts; do not invent a parallel control plane.

4. **Collect return packet**
   - After each phase, collect the return packet containing:
     - active change id
     - current phase reached
     - tests run and results
     - unresolved issues or blockers
     - latest execution packet / return packet context when implementation ran
     - latest review decision and rework reason when review did not pass

5. **Bounded rework loop**
   - Default: 2 rework rounds maximum.
   - On acceptance failure:
     - Decrement retry budget.
     - If retry budget > 0: emit `Rework Packet` and route back to `/ccsm:spec-impl`.
     - If retry budget is exhausted: stop and report `retry-budget-exhausted`.
   - On acceptance success: stop at `archive-ready`.

6. **Stop conditions**
   - **Archive-ready**: Codex review passed; stop and surface manual archive as the next optional step.
   - **Blocked**: Planning, dispatch, or review cannot proceed safely; stop and report `blocked`.
   - **Retry-budget-exhausted**: Rework rounds consumed without convergence; stop for human review.

**Output Format**
After each phase transition:

```md
## Spec-Fast Status

- change: <change_id>
- phase: <current_phase>
- state: <in-progress|blocked|retry-budget-exhausted|archive-ready>
- retry_budget_remaining: <N>
- next_step: <command or "awaiting human decision">

### Latest Context
- execution_packet: <summary or "not-run">
- return_packet: <summary or "not-run">
- review_decision: <passed|failed|not-run>

### Stop Reason (if applicable)
<blocked reason or retry budget exhausted message>

### Next Step
<command to resume, inspect, or archive explicitly>
```

**Exit Criteria**
- [ ] Active change selected or created
- [ ] First missing phase identified
- [ ] Phase executed with valid return packet
- [ ] Retry budget tracked and respected
- [ ] Stop conditions evaluated correctly
- [ ] Existing `spec-init`, `spec-plan`, `spec-impl`, and `spec-review` contracts reused
- [ ] Archive only on explicit approval
<!-- CCG:SPEC:FAST:END -->
