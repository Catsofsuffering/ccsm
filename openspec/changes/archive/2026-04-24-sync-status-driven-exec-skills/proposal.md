## Why

`claude-exec-status-driven-results` updated the `ccsm claude exec` runtime path so status-driven execution can correlate monitor sessions, wait for terminal state, and expose structured outputs. However, the workflow skills and slash-command templates still instruct Codex to run `ccsm claude exec --prompt-file ...` without `--status-driven` and still frame completion around a textual return packet / terminal output.

That means the new runtime capability exists, but the Codex-led workflow will not reliably use it by default. The product behavior remains backward compatible, but the primary workflow contract can drift from the implemented status-driven design.

## Research Summary

### Hard Constraints

- `spec-impl` installed skill currently invokes `ccsm claude exec --prompt-file .claude/ccsm/claude-dispatch-prompt.txt` without `--status-driven`.
- `templates/codex-skills/spec-impl/SKILL.md` has the same command and will reinstall the old guidance unless updated.
- `templates/commands/spec-impl.md`, `team-exec.md`, `team-review.md`, and related slash templates still describe return packet / terminal-output workflows.
- The runtime feature is opt-in through `--status-driven`; therefore unchanged skills continue using legacy process/text behavior.
- Installed user skills under `~/.codex/skills/` do not automatically update unless the installer/update path copies refreshed templates or the user reinstalls/updates skills.

### Soft Constraints

- Keep backward compatibility: users should still be able to run plain `ccsm claude exec` for compatibility/debug flows.
- The primary `spec-impl` path should prefer `--status-driven` once monitor hooks are expected to be installed.
- Skill wording should say Codex reviews the structured JSON monitor result and uses monitor outputs as the authoritative execution result, while the Claude return packet remains a content convention inside `outputs`.
- Documentation should distinguish runtime completion (`sessionStatus`) from implementation report content (`Execution Return Packet`).

### Dependencies

- `ccsm monitor hooks` must install hook-handler versions that forward `CCSM_RUN_ID`.
- Installed monitor runtime must be refreshed so `claude-monitor/scripts/hook-handler.js` and monitor server routes support run-id correlation.
- Update/install commands should copy changed skill templates into `~/.codex/skills/` and changed monitor runtime into the installed monitor directory.

### Risks

- If only CLI runtime is updated, the designed status-driven path is dormant for `spec-impl`; Codex may still wait for returned text or manually infer completion.
- If templates are updated but installed skills are not refreshed, users keep old local behavior.
- If `--status-driven` becomes unconditional without a clear fallback, environments without monitor hooks can appear blocked; skill text must define fallback/blocking behavior.
- The phrase "return packet" can become ambiguous unless skill text states it is retrieved from structured monitor outputs, not from raw process text.

## What Should Change Next

- Update `templates/codex-skills/spec-impl/SKILL.md` to dispatch with `ccsm claude exec --status-driven --prompt-file ...` for the default Agent Teams path.
- Update the installed `~/.codex/skills/spec-impl/SKILL.md` through the CCSM update/install path or document that users must reinstall/update skills.
- Update slash-command templates that talk about return packets so they reference structured monitor results and terminal `sessionStatus`.
- Update README / README.zh-CN to mention status-driven exec as the recommended default for Codex-led `spec-impl`.
- Verify installer/update logic copies refreshed Codex skill templates and monitor hook runtime.

## Proposal Status

Research complete and ready for `spec-plan` if this follow-up should be implemented.