## Why

Claude Agent Teams execution is part of the primary CCSM path, but monitor visibility is currently incomplete: team-backed sessions can be missing from the monitor, teammate return packets may not update in real time, and operators do not have a single restart command for recovering the monitor process.

## Reactivation Note

This change was archived after the first implementation, but live Workflow monitoring still cannot reliably show teammate output as it is produced. The current implementation primarily observes `SubagentStop`, broad `Notification` text, and final transcript messages. That is not sufficient for Agent Teams because the maintained execution path coordinates through structured in-session tools such as `TeamCreate`, `TaskCreate`, `SendMessage`, and mailbox-style teammate messages.

The reopened work should treat those Agent Teams tool payloads as first-class realtime output signals instead of relying on lifecycle hooks or delayed transcript extraction alone.

## What Changes

- Detect and display Claude Agent Teams sessions started from a project directory, including sessions created while developing projects such as DataBeacon.
- Stream teammate or team-agent return updates into the monitor as they arrive instead of only after process completion or delayed log flushes.
- Parse structured Agent Teams tool events, especially `SendMessage` and mailbox payloads, so Workflow can display teammate progress and return packets before `SubagentStop` or session completion.
- Add a `ccsm monitor restart` command that stops any existing monitor instance and starts a fresh one using the current project context.
- Preserve the existing `ccsm monitor` and `ccsm monitor --detach` behavior while adding restart as an explicit operational action.

## Capabilities

### New Capabilities

- `monitor-process-control`: Monitor lifecycle commands for restart and recovery flows.

### Modified Capabilities

- `execution-progress-monitoring`: Agent Teams sessions and teammate return events must be discoverable and updated in near real time.

## Impact

- CLI command routing for `ccsm monitor` subcommands.
- Claude monitor hook ingestion and session discovery under `claude-monitor/` and related utilities.
- Monitor server/client data model for sessions, workflows, and agent/team updates.
- Session output extraction so persisted TeamReturn/mailbox events are surfaced by `/api/sessions/:id/outputs` and Workflow Live Reader, not only by the activity feed.
- Tests for monitor session discovery, real-time event propagation, and restart behavior.
