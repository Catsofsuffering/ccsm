## Why

CCSM already has a clear spec-driven path, but it is still exposed as several manual orchestration steps:

- `spec-init`
- `spec-plan`
- `spec-impl`
- `spec-review`

That works when the operator wants fine-grained control, but it is slower than necessary for the common case where the user wants one Codex-led skill to take a fresh request, create or select the change, prepare the handoff, dispatch execution, review the result, and keep looping until the change is either acceptance-ready or clearly blocked.

The missing piece is not a new executor. It is a higher-level orchestration skill that automates the existing maintained path without bypassing OpenSpec artifacts or weakening Codex ownership of review and acceptance.

## What Changes

- Add a new Codex-native orchestration skill named `spec-fast`.
- Define `spec-fast` as a top-level driver that internally advances the maintained path through `spec-init`, `spec-plan`, `spec-impl`, and `spec-review`.
- Make `spec-fast` responsible for creating or resuming the active change, ensuring the required OpenSpec artifacts exist, dispatching Claude execution through the existing `spec-impl` rules, and evaluating review outcomes in Codex.
- Allow `spec-fast` to loop through `spec-impl -> spec-review` rework cycles automatically within bounded retry limits.
- Stop `spec-fast` at `archive-ready`, `blocked`, or `retry-budget-exhausted` rather than silently archiving by default.

## Behavior Outline

### Happy Path

1. User gives a feature request to `spec-fast`.
2. Codex selects or creates the change and determines the next required artifact.
3. Codex prepares plan artifacts and a bounded execution packet.
4. Claude Agent Teams execute the packet.
5. Codex runs review and verification.
6. If acceptance passes, `spec-fast` stops with `archive-ready`.

### Rework Path

1. `spec-review` fails with bounded findings.
2. Codex creates a rework packet.
3. `spec-fast` sends the change back through `spec-impl`.
4. The loop continues until acceptance passes, execution is blocked, or retry budget is exhausted.

### Stop Conditions

- `archive-ready`: review passed and Codex acceptance is complete, but archive is still a separate explicit decision unless the user later opts in.
- `blocked`: missing runtime, failed dispatch, unresolved planning ambiguity, or verification that cannot continue automatically.
- `retry-budget-exhausted`: repeated implementation/review loops did not converge within the configured cap.

## Capabilities

### Modified Capabilities

- `codex-workflow-orchestration`: adds a higher-level Codex entrypoint that can drive the maintained workflow end to end.
- `spec-impl-default-dispatch`: becomes a sub-phase inside a larger orchestration loop rather than only a standalone operator action.
- `change-artifact-hygiene`: `spec-fast` must still preserve reviewable proposal/design/spec/tasks artifacts instead of skipping them.

### New Capability Candidate

- `spec-fast-orchestration`: one Codex-native skill can advance a request through the maintained spec-driven lifecycle, including bounded rework loops, without bypassing Codex acceptance.

## Key Boundaries

- `spec-fast` is an orchestration skill, not an execution skill.
- `spec-fast` must not bypass OpenSpec as the source of truth.
- `spec-fast` must not let Claude make the final acceptance or archive decision.
- `spec-fast` must not silently fall back to local product-code implementation if dispatch is blocked.
- `spec-fast` should not archive automatically by default in the first version.

## Open Questions

- Should `spec-fast` always create a new change for a fresh request, or first try to match an existing in-progress change?
- Should the first version always include `spec-plan`, or may it skip directly from `spec-init` to `spec-impl` when an execution-ready change already exists?
- What should the default retry budget be for `spec-impl -> spec-review` loops: 1, 2, or 3 rework rounds?
- Should `spec-fast` expose user-facing modes such as `plan-only`, `through-review`, or `through-archive`, or should the first version keep a single default behavior?

## Recommendation

The first version should be conservative:

- use full artifact progression,
- allow automatic `impl -> review` rework loops,
- stop at `archive-ready` by default,
- require explicit follow-up for archive.

That delivers the "one skill drives the whole path" outcome without collapsing review and archive into an opaque one-click action.
