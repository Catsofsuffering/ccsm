## Context

CCSM already has the maintained Codex-led skill surface:

- `spec-init`
- `spec-research`
- `spec-plan`
- `spec-impl`
- `spec-review`

Those skills are individually clear, but they still require the operator to decide when to move from one phase to the next and when to loop back through rework. The requested `spec-fast` skill is not a replacement for those phase skills. It is a higher-level orchestrator that can drive the same lifecycle automatically while preserving the same source of truth, worker boundaries, and acceptance ownership.

The main design risk is accidental over-automation:

- skipping OpenSpec artifacts,
- hiding retries and stop reasons,
- letting Claude decide acceptance,
- collapsing archive into a silent side effect.

The design therefore favors explicit state transitions and conservative stop conditions over maximum automation.

## Decisions

### 1. `spec-fast` is a top-level orchestrator, not a shortcut around OpenSpec

`spec-fast` will remain a Codex-native orchestration skill. It must still:

- inspect `openspec list --json`,
- create or select the active change,
- check `openspec status --change "<change>" --json`,
- ensure required proposal/design/specs/tasks artifacts exist before implementation,
- dispatch execution only through the existing `spec-impl` rules,
- run final acceptance only through the existing `spec-review` rules.

This keeps `spec-fast` aligned with the current product story instead of creating a parallel workflow.

### 2. `spec-fast` should reuse artifact state instead of always replaying every phase

The first version should not blindly run all four skills every time. Instead, it should evaluate the active change status and continue from the first missing phase.

Examples:

- no matching change: create change, produce proposal, then continue
- proposal exists but design/specs/tasks are incomplete: run planning path
- execution-ready change exists: skip directly to `spec-impl`
- implementation already returned but review is pending: start at `spec-review`

This makes the skill genuinely fast while still preserving artifact hygiene.

### 3. Rework loops are allowed, but bounded

`spec-fast` should automatically handle `spec-impl -> spec-review` rework cycles.

The first version should use a default retry budget of `2` rework rounds after the initial implementation attempt:

- attempt 1: initial `spec-impl`
- attempt 2: first bounded rework
- attempt 3: second bounded rework

After that, the skill stops with `retry-budget-exhausted`.

This is enough to make the feature useful without turning it into an unbounded babysitter loop.

### 4. Default stop condition is `archive-ready`, not archive

The first version should stop after Codex review passes and report `archive-ready`. Archive remains a separate explicit operator decision.

Reasons:

- archive is a release-governed action in this repo,
- acceptance may pass while the user still wants to inspect diffs,
- automatic archive would make the first version harder to trust.

Future extension can add an opt-in `through-archive` mode, but that should not be the default behavior.

### 5. Blocked and retry-exhausted states must be first-class outputs

`spec-fast` should not pretend everything can be automated. It must stop clearly when:

- OpenSpec state is missing or inconsistent,
- planning cannot determine a bounded execution packet,
- `ccsm claude exec` cannot start or cannot correlate a status-driven result,
- Codex review finds non-converging rework after the retry budget is spent.

The output should always tell the operator:

- active change id
- current phase reached
- current state
- latest execution packet
- latest review decision
- next manual step if blocked

## State Model

The first version should use this lifecycle:

```text
request
  │
  ▼
select-or-create-change
  │
  ├─ no usable artifacts ─▶ plan-artifacts
  │                         │
  │                         ▼
  │                    execution-ready
  │
  └─ execution-ready ─────────────────────────────┐
                                                  ▼
                                             spec-impl
                                                  │
                                                  ▼
                                             spec-review
                                                  │
                         ┌────────────────────────┼────────────────────────┐
                         ▼                        ▼                        ▼
                   archive-ready               blocked          retry-budget-exhausted
                         │
                         └─ stop
```

Rework branch:

```text
spec-review failed
  │
  ▼
produce bounded rework packet
  │
  ▼
spec-impl retry
  │
  ▼
spec-review retry
```

## Execution Handoff Contract

### Execution Goal

Add a new `spec-fast` orchestration skill that can automatically advance a request through the maintained OpenSpec-driven lifecycle, including bounded rework loops, while preserving Codex acceptance ownership and default stop-at-archive-ready behavior.

### Allowed Surface

- `templates/codex-skills/spec-fast/`
- `templates/codex-skills/spec-init/`
- `templates/codex-skills/spec-plan/`
- `templates/codex-skills/spec-impl/`
- `templates/codex-skills/spec-review/`
- `templates/commands/spec-fast.md`
- `src/utils/identity.ts`
- `src/utils/installer.ts`
- `src/commands/init.ts`
- `src/commands/menu.ts`
- `src/utils/__tests__/**/*.ts`
- `README.md`
- `README.zh-CN.md`
- `AGENTS.md`

### Protected Surface

- Do not bypass OpenSpec artifact creation.
- Do not let `spec-fast` implement product code locally before `spec-impl` dispatch succeeds.
- Do not let `spec-fast` archive automatically by default.
- Do not let Claude decide final acceptance or archive.
- Do not remove existing `spec-init`, `spec-plan`, `spec-impl`, or `spec-review` entrypoints.

### Required Verification

- installed `spec-fast` appears in the Codex-native workflow skill set
- generated guidance describes the state transitions and stop conditions clearly
- default behavior stops at `archive-ready`, `blocked`, or `retry-budget-exhausted`
- tests prove `spec-fast` reuses completed artifact state instead of always restarting from scratch
- tests prove `spec-fast` does not archive by default

### Rework Triggers

- `spec-fast` can skip proposal/design/spec/tasks creation entirely
- `spec-fast` can run implementation without checking change readiness
- `spec-fast` can continue indefinitely without retry limits
- `spec-fast` archives automatically by default
- `spec-fast` hides blocked state or review failure context from the user

## Consequences

Positive:

- one user request can enter a maintained end-to-end path more quickly
- artifact progression and rework loops become easier to standardize
- Codex stays the visible orchestrator throughout the lifecycle

Tradeoff:

- the skill becomes stateful and more complex than the current phase-specific skills
- acceptance behavior must remain very explicit to keep operator trust

## Deferred Options

Not in the first version:

- automatic archive on success
- user-configurable execution worker selection beyond current `spec-impl` rules
- indefinite or timer-based retry loops
- skipping planning for ambiguous new requests
