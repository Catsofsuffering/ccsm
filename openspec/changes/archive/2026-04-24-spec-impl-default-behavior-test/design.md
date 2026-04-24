## Context

The repository already encodes `spec-impl` as a Codex-orchestrated dispatch flow:

- the installed and template skills describe `spec-impl` as dispatch-first
- the launcher code enables Agent Teams flags by default
- the launcher code injects `--permission-mode=bypassPermissions` by default when Agent Teams are enabled

The missing piece is a bounded end-to-end test for the case where the user does not force those choices. This change exists to exercise that default path directly.

## Goals / Non-Goals

**Goals**

- Select a real active change through OpenSpec.
- Prepare a bounded execution packet from Codex.
- Avoid any user-side forced requirement for worker topology or permission mode.
- Observe whether the live `spec-impl` path defaults to Agent Teams-first dispatch.
- Observe whether the live launcher defaults to `--permission-mode=bypassPermissions` for that dispatch path.
- Capture the outcome in a return packet and Codex acceptance note.

**Non-Goals**

- Modifying product code as part of this test.
- Using Claude to make archive decisions.
- Rewriting existing `spec-impl` behavior before the test is observed.
- Forcing a single-worker fallback unless the runtime proves Agent Teams dispatch cannot start.

## Decisions

### Decision: The test remains read/observe/report only

This change does not ask the execution worker to implement product functionality. The purpose is to exercise dispatch behavior, not to blend runtime evaluation with unrelated code edits.

### Decision: No user-forced topology is included in the packet

The packet must not say "use Agent Teams" because the user demanded it, and it must not say "use single-worker Claude" because the user demanded it. The point is to observe the default path that `spec-impl` selects under its own rules.

### Decision: Agent Teams remains the expected default unless the packet explicitly documents fallback

The current skill and launcher contract indicate that `spec-impl` should be Agent Teams-first by default. The test will treat any single-worker path as requiring explicit justification in the packet or runtime blocker evidence.

## Execution Handoff Contract

### Execution Goal

Run a bounded `spec-impl` dispatch test that observes the actual default launcher behavior when the originating request does not force worker topology or permission mode, then return a concise report.

### Allowed Change Surface

- `openspec/changes/spec-impl-default-behavior-test/**`
- read-only inspection of:
  - `templates/codex-skills/spec-impl/SKILL.md`
  - `src/commands/claude.ts`
  - `src/utils/claude-cli.ts`
  - `src/utils/__tests__/claude-cli.test.ts`
- temporary prompt or log files under `.tmp/spec-impl-default-behavior-test/**`

### Protected Surface

- all product implementation files outside the read-only inspection set
- any file already modified in the dirty workspace unless the packet explicitly authorizes it
- `openspec/changes/archive/**`
- release/versioning files

### Work Packages

1. Inspect the live `spec-impl` skill and launcher defaults that apply when the user does not force execution mode.
2. Build a bounded dispatch prompt that asks Claude to report observed startup mode, not to edit product code.
3. Launch `ccsm claude exec` from Codex using that bounded prompt.
4. Collect the return packet with:
   - observed topology choice
   - observed permission-mode behavior
   - whether Agent Teams-related env defaults were active
   - any runtime blocker that prevented clean startup
5. Hand the result back to Codex for acceptance or blocker reporting.

### Required Verification

- `openspec status --change "spec-impl-default-behavior-test" --json`
- inspection of `templates/codex-skills/spec-impl/SKILL.md`
- inspection of `src/utils/claude-cli.ts`
- `node bin/ccsm.mjs claude doctor`
- one bounded `ccsm claude exec` launch attempt, if the Claude runtime is available

### Return Packet

- launch command used
- launcher discovery source
- whether Agent Teams defaults were enabled
- whether a permission mode was injected by default
- whether the runtime started successfully
- blocker details, if startup failed
- concise recommendation: "default path confirmed" or "blocked / ambiguous"

### Rework Triggers

- Codex silently performs local implementation instead of dispatching
- the packet claims single-worker fallback without justification
- the runtime omits Agent Teams defaults without an explicit override
- the runtime omits permission-mode defaulting on the Agent Teams path without an explicit override
- the launch attempt fails and the blocker is not captured clearly
