## Context

The primary CCSM workflow is Codex-led: Codex prepares bounded work, Claude Agent Teams execute, and Codex performs review and acceptance. `ccsm claude exec` is the bridge into Claude execution, but its current implementation waits for the spawned Claude process to close and relies on the process stream as the result channel.

The maintained monitor already stores sessions, agents, events, and derived outputs. Session records expose lifecycle status, and session output endpoints can return transcript-derived or hook-derived assistant outputs. That makes the monitor a better execution state authority than raw returned text, especially for Agent Teams where multiple workers may finish at different times and final output can be structured by agent.

## Goals / Non-Goals

**Goals:**

- Make `ccsm claude exec` able to wait on monitor session state for completion.
- Bind every monitored exec invocation to a stable run/session identity so the CLI does not guess from the newest session.
- Fetch final outputs from the monitor once the session reaches `completed`, `error`, or `abandoned`.
- Preserve a safe fallback to process-exit behavior when monitor status tracking is unavailable or disabled.
- Return enough structured data for Codex to independently inspect results instead of trusting one final text blob.

**Non-Goals:**

- Replace the Claude CLI or change Claude Agent Teams protocol semantics.
- Make the monitor mandatory for all `ccsm claude exec` invocations.
- Redesign the monitor UI.
- Move acceptance, summarization, or archive decisions into Claude.
- Require MCP, Gemini, or optional skills for this path.

## Decisions

### CLI Uses A Run Identifier For Correlation

Each monitored `ccsm claude exec` invocation should generate a stable CCSM run id and pass it through the launched environment, such as `CCSM_RUN_ID`, plus metadata that includes the workspace root and command context. Hook ingestion or session creation should persist this metadata so CLI lookup is deterministic.

Alternative considered: choose the most recent active monitor session for the workspace. This is rejected because concurrent Agent Teams executions would race and could return the wrong outputs.

### Monitor Session State Is The Completion Signal

When status-driven mode is enabled and the monitor is healthy, the CLI should wait for the correlated monitor session to reach a terminal state. Terminal states are `completed`, `error`, and `abandoned`. While waiting, the CLI may keep the Claude child process alive, observe process exit as a diagnostic signal, and continue polling for a bounded grace period so delayed hooks can close the session.

Alternative considered: parse a final Claude stdout message. This is rejected as the primary contract because output formatting can change and multi-agent execution may not produce a single authoritative terminal message.

### Final Results Come From Monitor Outputs

After a terminal state, the CLI should fetch `GET /api/sessions/:id/outputs` or an equivalent structured result endpoint. The calling model should use those outputs, agent statuses, and session metadata to decide what happened next. The CLI should not collapse multi-agent outputs into a lossy single text response unless a caller explicitly asks for plain text.

Alternative considered: return only the last assistant message. This is rejected because it hides worker-specific outputs and makes Codex acceptance less auditable.

### Fallback Remains Process-Based

If the monitor is disabled, unreachable, or cannot correlate a session before timeout, `ccsm claude exec` should either fall back to the current process-exit behavior or fail clearly when the user requested strict status monitoring. The default should be conservative and compatible: do not block forever and do not silently invent results.

## Execution Handoff Contract

**Allowed change surface:**

- `src/commands/claude.ts`
- `src/utils/claude-cli.ts`
- `src/utils/claude-monitor.ts`
- A new focused utility under `src/utils/` for monitor result polling if cleaner than expanding existing files.
- `claude-monitor/server/routes/sessions.js`, `claude-monitor/server/routes/hooks.js`, and `claude-monitor/server/db.js` only for stable run-id correlation or lookup support.
- Tests adjacent to the changed CLI, monitor utility, and monitor server modules.
- User-facing command help or README entries that describe the new behavior.

**Protected surface:**

- Do not change OpenSpec artifact schemas or archive behavior.
- Do not require MCP, Gemini, or optional skills for Claude exec.
- Do not remove current `ccsm claude exec` arguments or break `--disable-agent-teams`.
- Do not make monitor UI redesigns part of this change.
- Do not move final acceptance decisions from Codex to Claude.

**Required behavior:**

- A monitored exec has a stable generated run id.
- The run id is passed to Claude execution and persisted or discoverable through monitor data.
- The CLI waits for correlated session terminal state before fetching outputs.
- The CLI retrieves structured final outputs after terminal state.
- Monitor-unavailable behavior is explicit and compatible.
- Strict mode, if added, fails clearly instead of falling back silently.

**Required verification:**

- Unit tests for argument/env construction with the run id.
- Unit tests for terminal-state polling and timeout behavior.
- Monitor server tests for run-id/session lookup if new endpoint or query support is added.
- CLI tests or integration-style tests for fallback when monitor is unavailable.
- `pnpm typecheck`, `pnpm build`, and targeted tests for touched modules.

**Rework triggers:**

- Any implementation that guesses the session by newest timestamp without run-id correlation.
- Any implementation that blocks forever when monitor hooks are delayed or missing.
- Any implementation that discards multi-agent outputs by default.
- Any implementation that makes monitor availability mandatory without an explicit strict option.

## Risks / Trade-offs

- Claude hook payloads may not automatically include custom environment metadata, requiring correlation through process-created metadata or an added monitor-side lookup event.
- Delayed hook delivery can make process exit happen before session terminal state, so the CLI needs a bounded grace period.
- Structured outputs can be larger than a single terminal response, so callers may need output mode controls.
- Backward compatibility requires a fallback path, which means two completion paths must remain tested.