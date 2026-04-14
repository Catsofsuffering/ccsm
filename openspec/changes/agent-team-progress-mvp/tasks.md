## 1. Monitoring Model

- [x] 1.1 Add structured run and task state types for monitoring wrapper-managed execution units.
- [x] 1.2 Teach the executor to register tasks, transition lifecycle states, and record blocked/completed/failed outcomes.
- [x] 1.3 Capture task result metadata and recent activity in the monitoring state without breaking existing stdout/stderr reporting.

## 2. Persistence and APIs

- [x] 2.1 Persist run snapshots and append-only monitoring events to wrapper-owned local storage.
- [x] 2.2 Add or update JSON/SSE endpoints to expose structured monitoring state for all tasks in the current run.

## 3. Web Dashboard

- [x] 3.1 Replace the single-session page with a dashboard that shows run summaries plus live per-task panels.
- [x] 3.2 Render task dependencies, current activity, final outcomes, and available result metadata in the dashboard.

## 4. Verification

- [x] 4.1 Add targeted tests for task lifecycle transitions, blocked-state handling, and persisted monitoring history.
- [x] 4.2 Add targeted tests for monitoring API responses or dashboard data plumbing.
- [x] 4.3 Run focused verification for `codeagent-wrapper` and summarize any remaining gaps.
