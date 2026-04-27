## Why

The monitor is now the maintained operational surface for Codex-led, Claude-executed CCSM work, but it still behaves like a single-project runtime bound to whichever workspace started the server. Operators working across multiple OpenSpec projects need to choose which project the monitor is showing without restarting from the exact directory every time.

The monitor lifecycle surface also has a restart action, but it lacks an explicit shutdown command. Users need a safe way to stop the maintained monitor process when they are done, when switching environments, or before debugging port/process ownership issues.

Workflow model attribution is also unreliable: the Workflow page frequently shows sessions as `unknown`, while only a small number are correctly identified as `minimax` or another concrete model. This weakens the monitor as an execution analysis surface because model delegation, session complexity, cost, and runtime views cannot be trusted when `sessions.model` remains empty.

## What Changes

- Add project selection to the monitor so users can choose the active OpenSpec project from available/recent project roots instead of being locked to the startup workspace.
- Persist or discover enough project metadata for the monitor to show recognizable project choices and bind board/session views to the selected project.
- Add `ccsm monitor shutdown` as an explicit lifecycle command that stops the running CCSM monitor process without starting a replacement.
- Improve Workflow model attribution so sessions do not remain `unknown` when the model can be inferred from hook payloads, transcript token usage, session metadata, or runtime/provider hints.
- Keep token usage model rows and session-level model labels consistent enough that Workflow model delegation and session complexity display the same best-known model for a session.
- Preserve existing `ccsm monitor`, `ccsm monitor --detach`, `ccsm monitor restart`, `ccsm monitor install`, and `ccsm monitor hooks` behavior.
- Fail safely when the configured monitor port is occupied by a process that cannot be identified as the CCSM monitor.

## Research Notes

- Workflow aggregation reads the session label from `sessions.model` in `claude-monitor/server/routes/workflows.js`, especially `getModelDelegation()` and `getSessionComplexity()`.
- Hook-created sessions currently set `sessions.model` only from `data.model` in `claude-monitor/server/routes/hooks.js`.
- The hook route already notes that Claude Code hook stdin does not reliably include usage/model; transcript JSONL is the reliable source for usage/model, and `TranscriptCache` writes per-model rows into `token_usage`.
- There is no current session-model backfill path after transcript extraction. A session can therefore have concrete `token_usage.model` rows while `sessions.model` remains null and Workflow renders the session model as `unknown`.
- Planning should define a single best-known session model resolution rule, then apply it consistently to session creation, transcript ingestion, session updates, Workflow aggregation, and tests.

## Capabilities

### Modified Capabilities

- `monitor-process-control`: Monitor lifecycle commands now include shutdown and project-aware process behavior.
- `execution-progress-monitoring`: Monitor board/session data must follow the selected project context and show accurate best-known model labels.

### New Capabilities

- `monitor-project-selection`: Monitor users can choose the active project context from discoverable OpenSpec project roots.
- `workflow-model-attribution`: Workflow analytics and session lists identify the concrete model used by a session whenever monitor data contains enough evidence.

## Impact

- CLI command routing for `ccsm monitor shutdown`.
- Claude monitor process ownership and safe-stop utilities.
- Monitor server project context APIs and workspace-root handling.
- Monitor client project selector UI and selected-project state.
- Monitor hook ingestion, transcript extraction integration, and session model persistence.
- Workflow analytics queries that currently rely directly on `sessions.model`.
- Tests for project selection, selected-project data scoping, shutdown behavior, and safe failure on unknown port occupants.
- Tests for model backfill from transcript token usage and model display when hook payloads omit `data.model`.
