## Why

CCGS already exposes live streaming output for wrapper runs, but it does not provide a reliable progress model for parallel execution. Users can watch text scroll by, yet they still cannot tell which work package is running, which task is blocked, or what finished versus failed.

This change introduces a monitoring MVP so Codex-led and Claude-executed workflows can surface task-level progress, status summaries, and retained execution history without pretending to know backend-internal teammate identities that are not exposed today.

## What Changes

- Add structured monitoring state for wrapper-managed tasks and sessions, including pending, running, completed, failed, and blocked outcomes.
- Upgrade the Web UI from a single-session output viewer into a multi-task dashboard with summary statistics and per-task live activity.
- Persist run snapshots and event history so execution state can be inspected after completion instead of disappearing with the process.
- Record dependency-driven blocked states during parallel execution so users can see where progress stopped.
- Keep the MVP honest by tracking wrapper-known work packages and task IDs rather than inventing precise Claude teammate identities.

## Capabilities

### New Capabilities
- `execution-progress-monitoring`: Track and present structured execution progress, live task activity, outcome summaries, and retained run history for wrapper-managed execution.

### Modified Capabilities
- None.

## Impact

- Affected code: `codeagent-wrapper/config.go`, `codeagent-wrapper/executor.go`, `codeagent-wrapper/server.go`, and related tests.
- Affected UI: the built-in Web UI served by `codeagent-wrapper`.
- Affected runtime behavior: execution monitoring state and retained history files under the wrapper-owned temp storage area.
- Affected verification: wrapper tests covering progress state transitions, persistence, and dashboard APIs.
