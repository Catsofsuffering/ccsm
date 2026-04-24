---
name: spec-impl
description: Dispatch execution from Codex and keep acceptance in Codex. Use when the change is planned and ready for implementation.
license: MIT
---

Dispatch the planned change to Claude while keeping Codex as the host workflow.

**Core contract**

- Codex remains the orchestrator.
- Claude Agent Teams are the default execution worker.
- Plain single-session Claude is only an explicit fallback when the execution packet says Agent Teams are unnecessary or the runtime cannot support them.
- Codex owns testing, acceptance, rework, and archive decisions.
- The first implementation action is dispatch, not local coding.
- Before Claude dispatch completes, Codex may inspect context and prepare the packet, but must not edit product code or start implementation locally.

**Steps**

1. Select the active change with `openspec status --change "<change-name>" --json`.
2. Read the full execution context from `proposal.md`, `design.md`, `tasks.md`, and the change specs.
3. Build a bounded execution packet that includes:
   - the implementation goal
   - allowed and protected paths
   - the expected worker topology and why Agent Teams are or are not required
   - required tests and checks
   - the return packet format
4. Invoke Claude from Codex with a bounded prompt before doing any product-code implementation:

```bash
ccsm claude exec --status-driven --prompt-file .claude/ccsm/claude-dispatch-prompt.txt
```

   When `--status-driven` is used, Codex reviews structured JSON monitor result fields: `sessionStatus`, `runId`, `exitCode`, and `outputs`. The Execution Return Packet is the content expected inside monitor `outputs`, not raw terminal text.

   Preserve plain `ccsm claude exec` compatibility for fallback/debug flows.

   The `ccsm claude exec` path resolves the native Claude binary when available, or falls back to the installed Claude JS entrypoint without relying on shell-specific shims.
   In a standard Claude Code install you should not need to set `CCSM_CLAUDE_PATH`; the launcher checks `PATH` first and only uses `CCSM_CLAUDE_PATH` as a fallback override for non-standard installs.
   Preserve your existing proxy settings by default. Only append `127.0.0.1,localhost` to `NO_PROXY` / `no_proxy` when your environment explicitly needs local bypass; use `CCSM_CLAUDE_APPEND_LOCAL_NO_PROXY=1` for that case.
   Treat `spec-impl` as an Agent Teams-first path by default. Unless the execution packet explicitly documents a single-worker fallback, enable both `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` and `CLAUDE_CODE_ENABLE_TASKS=1` before dispatch.
   For non-interactive Agent Teams execution, `ccsm claude exec` defaults to `--permission-mode=bypassPermissions` so Claude is not blocked by interactive approval gates during delegated execution. Override with `CCSM_CLAUDE_PERMISSION_MODE=<mode>` or pass an explicit Claude permission flag when you need a different policy.
   `ccsm monitor hooks` also ensures `~/.claude/settings.json` allows `Bash(*ccsm*)`, and `ccsm monitor install` ensures the current workspace is marked `trusted` in `~/.codex/config.toml`.
   Treat `claude -p` as the Claude-side entry contract. Do not assume a separate `claude teammates` CLI command exists.
   Agent Teams are the preferred execution mode for `spec-impl`. Instruct Claude to use the in-session team tools (`TeamCreate`, `TaskCreate`, `SendMessage`, `Agent(team_name=..., name=...)`) after the Claude session starts whenever the packet has more than trivial scope.
   Only skip Agent Teams when the packet explicitly records why a single Claude worker is the better fit.
   Require every teammate prompt to define its mailbox return protocol explicitly: if `SendMessage` is deferred, the teammate must run `ToolSearch select:SendMessage` before its first mailbox reply, and any string reply must include both `summary` and `message`.
   Tell Claude that a teammate is not considered finished just because it goes idle or emits `SubagentStop`; the required report only counts after the team lead receives the teammate mailbox message.
   In non-interactive `claude -p` sessions, require Claude to emit the full return packet before shutdown, then follow the official shutdown order: gracefully shut down teammates, wait for approvals, and run cleanup exactly once.
   If cleanup reports success or `nothing to clean up`, do not let Claude keep retrying cleanup. Treat the last complete return packet as found in the monitor `outputs` field (structured via `sessionStatus` JSON) and stop the host Claude process if it falls into the known shutdown-reminder loop.

5. If `ccsm claude exec` cannot be invoked, or Claude execution cannot start cleanly, stop and report the workflow as blocked instead of continuing with local implementation.
6. Review the execution return packet in Codex.
7. Run the required local verification in Codex.
8. If verification fails, keep the change open and produce a rework packet for the next execution cycle.
9. If verification passes, approve archive from Codex with `openspec archive <change-name>`.

**Output**

- execution packet
- return packet
- Codex acceptance decision
- archive approval or rework packet

**Guardrails**

- Do not tell the user to switch into Claude and run legacy slash commands.
- Do not edit product code, create implementation patches, or start local implementation before `ccsm claude exec` has dispatched work to Claude.
- If Claude dispatch is blocked or unavailable, stop and surface the blocker instead of silently implementing the change in Codex.
- Do not let Claude make the final archive decision.
- Do not archive before Codex verification passes.
