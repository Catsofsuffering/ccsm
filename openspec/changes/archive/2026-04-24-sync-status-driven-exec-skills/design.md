## Context

`ccsm claude exec` now has a status-driven mode that correlates each execution to monitor session state and returns structured monitor outputs. The primary CCSM workflow should use that mode, because Codex is expected to wait for execution completion by monitor state and then inspect monitor-derived results.

The current skill and command templates still describe the older text-return flow. `spec-impl` dispatches with `ccsm claude exec --prompt-file ...`, and several templates describe terminal output or a return packet as if it is the completion signal. This leaves the runtime enhancement opt-in and makes the documented workflow diverge from the implemented design.

## Goals / Non-Goals

**Goals:**

- Make the Codex-native `spec-impl` skill dispatch with `--status-driven` by default for the Agent Teams path.
- Update slash-command templates so monitor `sessionStatus` is the execution completion signal.
- Clarify that Claude's Execution Return Packet is content inside structured monitor outputs, not the process-level completion signal.
- Ensure install/update paths refresh Codex skill templates and monitor runtime assets required for status-driven correlation.
- Preserve compatibility for manual plain `ccsm claude exec` use and explicit fallback paths.

**Non-Goals:**

- Change the `ccsm claude exec` runtime implementation again except where installer/template sync requires it.
- Remove the ability to run plain process-based Claude exec.
- Redesign monitor UI or Agent Teams protocol.
- Archive unrelated changes.

## Decisions

### `spec-impl` Uses Status-Driven Exec By Default

The Codex-native `spec-impl` skill should launch the default Agent Teams execution with:

```bash
ccsm claude exec --status-driven --prompt-file .claude/ccsm/claude-dispatch-prompt.txt
```

This makes the skill use the runtime capability created by `claude-exec-status-driven-results` without changing lower-level compatibility behavior.

Alternative considered: leave the skill unchanged and rely on users to add `--status-driven` manually. This is rejected because the primary workflow should not require hidden flags to match its design.

### Return Packet Becomes Monitor Output Content

Skills and command templates should keep requiring Claude to produce an Execution Return Packet, but they must clarify that Codex retrieves/reviews it from structured status-driven results and monitor outputs. The terminal process text is no longer the authoritative completion signal.

Alternative considered: remove return packet language entirely. This is rejected because the packet remains useful as implementation evidence; only its transport/completion role changes.

### Installed Skills Need Refresh Coverage

Updating repo templates is insufficient if installed skills under `~/.codex/skills/` remain stale. The implementation must either extend existing install/update flows to refresh Codex skill files or document and expose a clear update path. Tests should verify that refreshed templates contain `--status-driven`.

## Execution Handoff Contract

**Allowed change surface:**

- `templates/codex-skills/spec-impl/SKILL.md`
- `templates/codex-skills/spec-review/SKILL.md` if wording needs structured result review alignment
- `templates/commands/spec-impl.md`
- `templates/commands/team-exec.md`
- `templates/commands/team-review.md`
- README files that describe `spec-impl`, Agent Teams dispatch, or runtime limitations
- Installer/update utilities that copy Codex skills or monitor runtime assets, only if needed to ensure refreshed skill deployment
- Tests covering template content and install/update copying behavior
- `openspec/changes/sync-status-driven-exec-skills/tasks.md` for task completion updates

**Protected surface:**

- Do not modify `src/utils/claude-cli.ts` status-driven runtime unless a template/install test exposes a direct integration gap.
- Do not change OpenSpec artifact schemas.
- Do not alter unrelated OpenSpec changes.
- Do not remove compatibility language for plain `ccsm claude exec`.
- Do not make monitor UI or Agent Teams protocol changes.

**Required behavior:**

- The Codex-native `spec-impl` template defaults to `ccsm claude exec --status-driven --prompt-file ...`.
- The installed/updated Codex skill path can receive the refreshed `spec-impl` template.
- Skill text instructs Codex to inspect structured JSON monitor results, including `sessionStatus`, `runId`, `exitCode`, and `outputs`.
- Return packet instructions remain, but are framed as expected content within monitor outputs.
- Fallback behavior is explicit: if status-driven exec cannot start or cannot correlate monitor state, Codex reports blocked or follows a documented explicit fallback, not silent local implementation.

**Required verification:**

- Template/content tests or snapshot checks for `--status-driven` in `templates/codex-skills/spec-impl/SKILL.md`.
- Tests for install/update copying behavior if touched.
- `pnpm typecheck`.
- `pnpm build`.
- Targeted tests for installer/template utilities.
- `pnpm test` if feasible.

**Rework triggers:**

- `spec-impl` still dispatches without `--status-driven` by default.
- Skill text still says to treat raw terminal output as the terminal execution result.
- Installed skill refresh path is missing or ambiguous.
- Compatibility fallback silently turns into local Codex implementation.
- Implementation modifies unrelated OpenSpec changes or runtime monitor behavior outside the allowed surface.