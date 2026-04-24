## Context

The maintained CCSM path is Codex orchestrates, Claude Agent Teams execute, and Codex accepts. The monitor is the operational surface for that execution loop, but current behavior depends on Claude hook events and the installed monitor server being started with the right workspace context. In practice, Agent Teams runs can be invisible when session creation events are missed or attributed to a different directory, and teammate output can lag because the monitor primarily records hook lifecycle events rather than explicit team return packets.

The current CLI exposes `ccsm monitor`, `ccsm monitor install`, and `ccsm monitor hooks`; there is no single operator command to stop a stale server and start a fresh server for the current project.

## Goals / Non-Goals

**Goals:**

- Ensure Claude Agent Teams sessions launched from a project directory are discoverable in the monitor for that project.
- Surface team-agent return or mailbox-style output as live monitor updates when hook events or transcript data make it available.
- Add `ccsm monitor restart` as an explicit recovery action that restarts the monitor on the configured port and rebinds it to the current workspace root.
- Preserve existing monitor start, install, hooks, and detached-start behavior.

**Non-Goals:**

- Replace Claude hook-based monitoring with a wrapper-owned runtime.
- Redesign the monitor UI visual system.
- Change Claude Agent Teams protocol semantics or require a new Claude CLI subcommand.
- Add MCP as a required monitor dependency.

## Decisions

### Session Discovery Uses Hook Events Plus Workspace Rebinding

The monitor should continue to treat Claude hook events as the source of truth, but session creation must tolerate Agent Teams event shapes and existing running servers. Starting or reusing the monitor from a project directory should update the monitor workspace root to the nearest OpenSpec workspace so DataBeacon-style projects show their own changes and sessions.

Alternative considered: require users to manually configure a monitor workspace root. This is rejected because `ccsm monitor` is expected to show the project where the command is launched.

### Team-Agent Returns Become First-Class Monitor Events

The hook ingestion path should recognize team-agent return signals, including `SubagentStop`, `SendMessage`/mailbox-style tool events, and transcript-derived final output when present. These updates should be stored as events and broadcast over the existing WebSocket channel so session detail and workflow views update without waiting for process completion.

Alternative considered: poll session detail endpoints from the frontend. This is insufficient because it delays updates and duplicates responsibility that already belongs to hook ingestion and WebSocket broadcast.

### Restart Is A CLI Process-Control Action

`ccsm monitor restart` should stop the server currently listening on the monitor port when it is the CCSM monitor or a stale occupant that the existing stop logic can safely terminate, then start a new monitor process with the current workspace environment. The command should report the URL and monitor directory the same way start does.

Alternative considered: document manual port cleanup. This is rejected because the monitor is a runtime service and users need a single recovery command.

## Risks / Trade-offs

- Agent Teams hook payloads may vary by Claude version -> Implement tolerant parsing and keep raw event payloads available in `events.data`.
- A port may be occupied by a non-CCSM process -> Reuse existing port ownership checks and fail clearly instead of force-killing unknown services.
- Transcript-derived output can duplicate hook-derived output -> Deduplicate by session, agent, event type, timestamp, and normalized summary where practical.
- Real-time updates can increase event volume -> Broadcast concise event summaries and leave large payloads in persisted event data or output endpoints.

## Migration Plan

1. Add CLI routing for `ccsm monitor restart` without changing the existing start/install/hooks actions.
2. Extend monitor process helpers with a restart path that stops and starts the installed Claude monitor using the current workspace root.
3. Harden hook ingestion so Agent Teams session and teammate-return events create or update sessions, agents, and events in real time.
4. Add or update monitor API tests for session discovery, live broadcasts, and restart behavior.
5. Validate with root tests plus the monitor server/client tests.

## Execution Handoff Contract

**Execution goal:** Implement reliable Claude Agent Teams monitoring and monitor restart support while preserving existing monitor behavior.

**Allowed paths:**

- `src/cli-setup.ts`
- `src/commands/monitor.ts`
- `src/utils/claude-monitor.ts`
- `src/utils/__tests__/**`
- `claude-monitor/server/**`
- `claude-monitor/client/**` only if existing UI subscription logic must consume new event types
- `README.md`, `README.zh-CN.md`, `CHANGELOG.md` if user-facing command docs need updates

**Protected paths:**

- Do not change OpenSpec archive contents except through normal archive flow.
- Do not reintroduce deprecated `ccg`/`ccgs` entrypoints.
- Do not make MCP, Gemini, or `codeagent-wrapper` mandatory for monitor operation.

**Required verification:**

- Run targeted tests for monitor CLI/process helpers and monitor server hook routes.
- Run `pnpm build` after TypeScript changes.
- Run monitor server/client tests when server or client behavior changes.

**Rework triggers:**

- `ccsm monitor restart` cannot recover a stale CCSM monitor instance.
- Agent Teams sessions are still missing when hook events contain a valid `session_id` and project `cwd`.
- Team-agent return events are persisted but not broadcast live.
- Existing `ccsm monitor`, `ccsm monitor install`, or `ccsm monitor hooks` behavior regresses.
