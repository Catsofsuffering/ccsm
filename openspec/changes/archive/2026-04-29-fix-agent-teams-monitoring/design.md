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

### Reopened Decision: Parse Agent Teams Tool Payloads Structurally

The previous implementation is still too dependent on lifecycle-derived output: `SubagentStop.last_assistant_message`, notification keyword matching, and transcript assistant messages. These are useful fallbacks, but they miss the core Agent Teams communication path where teammates report through `SendMessage` or mailbox-style payloads before they stop.

The rework should add a tolerant normalizer for Agent Teams tool payloads observed in `PreToolUse` or `PostToolUse` hook data. It should recognize `TeamCreate`, `TaskCreate`, `TaskUpdate`, `SendMessage`, and mailbox/teammate-message shapes when present, extract `summary`, `message`, recipient/sender/team/task metadata, and persist a monitor event tied to the best-known session and agent. If no exact agent match is available, the event should still be visible under the session and later reconciled when a matching teammate agent becomes known.

Workflow output endpoints must consume these persisted return/message events. A live event that only appears in the Activity Feed is not enough; `/api/sessions/:id/outputs` and the Workflow Live Reader need the same return text so Codex can use monitor `outputs` as the status-driven return packet source.

### Restart Is A CLI Process-Control Action

`ccsm monitor restart` should stop the server currently listening on the monitor port when it is the CCSM monitor or a stale occupant that the existing stop logic can safely terminate, then start a new monitor process with the current workspace environment. The command should report the URL and monitor directory the same way start does.

Alternative considered: document manual port cleanup. This is rejected because the monitor is a runtime service and users need a single recovery command.

## Risks / Trade-offs

- Agent Teams hook payloads may vary by Claude version -> Implement tolerant parsing and keep raw event payloads available in `events.data`.
- Team tool events may not identify the same agent id as the monitor's inferred subagent id -> associate by explicit metadata first, then teammate name/task/team, and finally session-level fallback.
- A port may be occupied by a non-CCSM process -> Reuse existing port ownership checks and fail clearly instead of force-killing unknown services.
- Transcript-derived output can duplicate hook-derived output -> Deduplicate by session, agent, event type, timestamp, and normalized summary where practical.
- Real-time updates can increase event volume -> Broadcast concise event summaries and leave large payloads in persisted event data or output endpoints.

## Replanned Execution Scope

The first implementation already covered monitor restart, basic session discovery, `SubagentStop` return extraction, notification keyword matching, and restart command tests. The reopened execution should not revisit those completed surfaces unless a targeted regression test proves they are broken.

The remaining scope is specifically the structured Agent Teams output path:

1. Add representative hook payload fixtures for Agent Teams tools, especially `SendMessage` and mailbox/teammate-message reports.
2. Add a server-side normalizer that can parse structured tool payloads from `PreToolUse` and `PostToolUse`, extracting teammate output from fields such as `summary`, `message`, `content`, `payload`, `team_name`, `task_id`, `sender`, `recipient`, and nested mailbox data.
3. Persist normalized teammate messages as first-class `TeamReturn` or equivalent monitor events with raw payload retained in `events.data`.
4. Include those event payloads in session output aggregation so `/api/sessions/:id/outputs` and Workflow Live Reader expose the message text before `SubagentStop` or `SessionEnd`.
5. Add tests proving the structured output path works and does not duplicate existing `SubagentStop` or notification-derived returns.

## Execution Handoff Contract

**Execution goal:** Complete the reopened Agent Teams monitoring rework by making structured `SendMessage`/mailbox-style tool payloads visible as realtime session outputs before teammate stop or session end.

**Allowed paths:**

- `claude-monitor/server/routes/hooks.js`
- `claude-monitor/server/lib/session-outputs.js`
- `claude-monitor/server/lib/**` for a small normalizer/helper if keeping it out of the route improves testability
- `claude-monitor/server/__tests__/api.test.js`
- `claude-monitor/server/lib/__tests__/**` if a helper is introduced
- `claude-monitor/server/README.md` only if the hook payload contract needs documentation
- `openspec/changes/fix-agent-teams-monitoring/tasks.md` for checkbox updates after verification

**Protected paths:**

- Do not change monitor restart CLI behavior or tests unless a failing test proves this rework requires it.
- Do not edit `src/cli-setup.ts`, `src/commands/monitor.ts`, or `src/utils/claude-monitor.ts` for this rework.
- Do not change Workflow page/client behavior unless server output contract changes require a narrow type/test adjustment.
- Do not edit unrelated monitor pages.
- Do not change OpenSpec archive contents.
- Do not reintroduce deprecated `ccg`/`ccgs` entrypoints.
- Do not make MCP, Gemini, or `codeagent-wrapper` mandatory for monitor operation.

**Required verification:**

- Run targeted monitor server tests covering structured Agent Teams tool payload ingestion and session outputs.
- Run the existing monitor server API test suite or the narrow equivalent if full server tests are already scoped in package scripts.
- Run `openspec validate fix-agent-teams-monitoring`.
- Run `pnpm build` if TypeScript or root package code changes.
- Run monitor client tests/build only if client code or shared client types change.

**Rework triggers:**

- Structured `SendMessage` or mailbox-style payloads still only appear through notification text matching.
- `SendMessage` or mailbox-style teammate payloads are broadcast in the activity stream but absent from Workflow Live Reader outputs.
- Structured output is only visible after `SubagentStop` or `SessionEnd`.
- Existing `SubagentStop`, notification-derived TeamReturn, token extraction, or non-Agent Teams hook behavior regresses.
- Duplicate return events appear when the same teammate output is observed through structured tool payload plus stop/notification fallback.
- Existing `ccsm monitor`, `ccsm monitor install`, or `ccsm monitor hooks` behavior regresses.
