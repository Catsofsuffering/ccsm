## 1. Skill Surface

- [x] 1.1 Add `spec-fast` to the maintained Codex-native workflow skill set.
- [x] 1.2 Add or update packaged command/template guidance so `spec-fast` is discoverable as a top-level orchestration entrypoint.
- [x] 1.3 Keep existing `spec-init`, `spec-plan`, `spec-impl`, and `spec-review` entrypoints intact.

## 2. Lifecycle Orchestration

- [x] 2.1 Implement change selection or creation logic for `spec-fast` using current OpenSpec status checks.
- [x] 2.2 Make `spec-fast` resume from the first missing or pending phase instead of always replaying every earlier phase.
- [x] 2.3 Reuse the existing `spec-impl` execution rules rather than inventing a second implementation path.
- [x] 2.4 Reuse the existing `spec-review` acceptance rules rather than inventing a second review path.

## 3. Rework Loop And Stop Conditions

- [x] 3.1 Add bounded `spec-impl -> spec-review` automatic rework looping with a default retry budget of 2 rework rounds after the initial attempt.
- [x] 3.2 Stop with `archive-ready` when Codex review passes, without archiving automatically by default.
- [x] 3.3 Stop with `blocked` when planning, dispatch, or review cannot continue automatically.
- [x] 3.4 Stop with `retry-budget-exhausted` when repeated rework does not converge within the configured cap.

## 4. Output And Reporting

- [x] 4.1 Make `spec-fast` output the active change id, current phase reached, final state, and next manual step when not archive-ready.
- [x] 4.2 Surface the latest execution packet / return packet context when implementation was attempted.
- [x] 4.3 Surface the latest review decision and rework reason when acceptance did not pass.

## 5. Verification

- [x] 5.1 Add or update tests proving `spec-fast` appears in the installed Codex-native workflow skill set.
- [x] 5.2 Add or update tests proving `spec-fast` resumes from existing artifact state instead of always restarting.
- [x] 5.3 Add or update tests proving `spec-fast` does not archive automatically by default.
- [x] 5.4 Add or update tests proving retry-budget and blocked outcomes are surfaced explicitly.
- [x] 5.5 Run targeted workflow installer / template tests.
- [x] 5.6 Run `pnpm typecheck`.
- [x] 5.7 Run `openspec validate add-spec-fast-orchestrator-skill --strict`.
