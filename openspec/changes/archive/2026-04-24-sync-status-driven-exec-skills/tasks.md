## 1. Codex Skill Template Alignment

- [x] 1.1 Update `templates/codex-skills/spec-impl/SKILL.md` to use `ccsm claude exec --status-driven --prompt-file .claude/ccsm/claude-dispatch-prompt.txt` for default Agent Teams dispatch.
- [x] 1.2 Update `spec-impl` guidance to tell Codex to review structured JSON fields: `sessionStatus`, `runId`, `exitCode`, and `outputs`.
- [x] 1.3 Clarify that the Execution Return Packet is expected inside monitor outputs, not as raw process terminal text.
- [x] 1.4 Preserve compatibility wording for explicit plain `ccsm claude exec` fallback/debug flows.

## 2. Slash Command Template Alignment

- [x] 2.1 Update `templates/commands/spec-impl.md` so execution completion is based on monitor `sessionStatus` in status-driven results.
- [x] 2.2 Update `templates/commands/team-exec.md` so return packet language remains content-focused and does not conflict with monitor terminal state.
- [x] 2.3 Update `templates/commands/team-review.md` or related review templates to inspect structured monitor outputs when available.
- [x] 2.4 Fix any encoding-corrupted or misleading status/return wording touched during the update only where necessary for this change.

## 3. Installed Skill Refresh Path

- [x] 3.1 Inspect installer/update code that copies `templates/codex-skills/` into installed Codex skill locations.
- [x] 3.2 Ensure install/update refreshes `spec-impl` with the status-driven command, or reports clearly when manual refresh is required.
- [x] 3.3 Add or update tests proving installed/generated `spec-impl` content contains `--status-driven`.
- [x] 3.4 Verify monitor runtime install/update still refreshes `hook-handler.js` so `CCSM_RUN_ID` forwarding is deployed with the skill guidance.

## 4. Documentation

- [x] 4.1 Update `README.md` to describe status-driven exec as the recommended default for Codex-led `spec-impl`.
- [x] 4.2 Update `README.zh-CN.md` with the same guidance.
- [x] 4.3 Document the distinction between execution completion (`sessionStatus`) and implementation evidence (`Execution Return Packet` in `outputs`).
- [x] 4.4 Document safe fallback behavior when status-driven monitor correlation is unavailable.

## 5. Verification

- [x] 5.1 Run targeted tests for template/install utility changes.
- [x] 5.2 Run `pnpm typecheck`.
- [x] 5.3 Run `pnpm build`.
- [x] 5.4 Run `pnpm test` if feasible.
- [x] 5.5 Run `openspec validate sync-status-driven-exec-skills --strict`.