## Why

Claude Agent Teams execution is part of the primary CCSM path, but monitor visibility is currently incomplete: team-backed sessions can be missing from the monitor, teammate return packets may not update in real time, and operators do not have a single restart command for recovering the monitor process.

## What Changes

- Detect and display Claude Agent Teams sessions started from a project directory, including sessions created while developing projects such as DataBeacon.
- Stream teammate or team-agent return updates into the monitor as they arrive instead of only after process completion or delayed log flushes.
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
- Tests for monitor session discovery, real-time event propagation, and restart behavior.
