## Why

We need a real workspace-level test of `spec-impl` when the user input does not force a worker topology, permission mode, or local-implementation fallback.

Today the intended default behavior is described across skill text, command templates, and launcher code, but we do not have a bounded OpenSpec change that exercises the full Codex-side decision path and captures the actual dispatch result.

Without a real test change:

- it is easy to confuse documented intent with actual runtime behavior
- existing dirty workspace changes can make ad hoc reasoning unreliable
- we cannot clearly show whether `spec-impl` defaults to Agent Teams-first or silently falls back to a local/single-worker path

## What Changes

- Create a bounded OpenSpec test change dedicated to `spec-impl` default-dispatch behavior.
- Define the test so Codex prepares a real execution packet without forcing worker topology from the user side.
- Restrict implementation to runtime observation and reporting only:
  - no product-code edits
  - no archive decision by Claude
  - no silent Codex local implementation fallback
- Capture the observed launch behavior, return packet, and Codex acceptance decision.

## Capabilities

### New Capabilities

- `spec-impl-default-dispatch`: Defines how `spec-impl` should behave when the initiating request does not explicitly require Agent Teams, single-worker Claude, or local Codex implementation.

## Impact

- Affected scope during this test: OpenSpec artifacts, bounded prompt construction, `ccsm claude exec` launch behavior, and Codex-side verification/reporting.
- Protected scope during this test: product implementation files, release artifacts, archived changes, and unrelated workspace modifications.
