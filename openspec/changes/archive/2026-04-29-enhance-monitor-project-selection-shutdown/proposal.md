## Why

The monitor is now the maintained operational surface for Codex-led, Claude-executed CCSM work, but it still behaves like a single-project runtime bound to whichever workspace started the server. Operators working across multiple OpenSpec projects need to choose which project the monitor is showing without restarting from the exact directory every time.

The monitor lifecycle surface also has a restart action, but it lacks an explicit shutdown command. Users need a safe way to stop the maintained monitor process when they are done, when switching environments, or before debugging port/process ownership issues.

Workflow model attribution is also unreliable: the Workflow page frequently shows sessions as `unknown`, while only a small number are correctly identified as `minimax` or another concrete model. This weakens the monitor as an execution analysis surface because model delegation, session complexity, cost, and runtime views cannot be trusted when `sessions.model` remains empty.

Post-review live monitor inspection also showed that a single Claude Agent Teams run can appear as many monitor sessions. The hook handler appends the same `CCSM_RUN_ID` to every Claude hook event in a status-driven run, but the server still creates sessions directly from each hook payload's `data.session_id`. Agent Teams child processes can emit their own Claude `session_id` values, so one logical CCSM run is split into many visible sessions that share the same `run_id`.

## What Changes

- Add project selection to the monitor so users can choose the active OpenSpec project from available/recent project roots instead of being locked to the startup workspace.
- Persist or discover enough project metadata for the monitor to show recognizable project choices and bind board/session views to the selected project.
- Add `ccsm monitor shutdown` as an explicit lifecycle command that stops the running CCSM monitor process without starting a replacement.
- Improve Workflow model attribution so sessions do not remain `unknown` when the model can be inferred from hook payloads, transcript token usage, session metadata, or runtime/provider hints.
- Keep token usage model rows and session-level model labels consistent enough that Workflow model delegation and session complexity display the same best-known model for a session.
- Normalize Claude Agent Teams hook events from the same CCSM `run_id` into one visible monitor session, while preserving each raw Claude `session_id` as source metadata for traceability.
- Make run-id session lookup deterministic enough for status-driven `ccsm claude exec` to wait on the logical run session instead of whichever child hook session happened to be inserted first.
- Preserve existing `ccsm monitor`, `ccsm monitor --detach`, `ccsm monitor restart`, `ccsm monitor install`, and `ccsm monitor hooks` behavior.
- Fail safely when the configured monitor port is occupied by a process that cannot be identified as the CCSM monitor.

## Research Notes

- Workflow aggregation reads the session label from `sessions.model` in `claude-monitor/server/routes/workflows.js`, especially `getModelDelegation()` and `getSessionComplexity()`.
- Hook-created sessions currently set `sessions.model` only from `data.model` in `claude-monitor/server/routes/hooks.js`.
- The hook route already notes that Claude Code hook stdin does not reliably include usage/model; transcript JSONL is the reliable source for usage/model, and `TranscriptCache` writes per-model rows into `token_usage`.
- There is no current session-model backfill path after transcript extraction. A session can therefore have concrete `token_usage.model` rows while `sessions.model` remains null and Workflow renders the session model as `unknown`.
- Planning should define a single best-known session model resolution rule, then apply it consistently to session creation, transcript ingestion, session updates, Workflow aggregation, and tests.
- Post-review finding: `/api/workflows` defaults `workspaceRoot` from the active workspace, but only applies that project scope to `modelDelegation`, `complexity`, `compaction`, and `cooccurrence`.
- The remaining Workflow aggregates still read globally: `stats`, `orchestration`, `toolFlow`, `effectiveness`, `patterns`, `errorPropagation`, and `concurrency`. This means switching projects can show selected-project model/complexity data next to global counts, tool transitions, errors, and concurrency data.
- The optimized rework should introduce one reusable Workflow scope abstraction instead of adding one-off SQL fragments per query. The scope should combine `statusFilter` and `workspaceRoot`, support sessions, agents, events, and token usage aliases, and require a `sessions` join whenever workspace filtering is applied to non-session tables.
- Workflow project scoping must preserve the current path matching rule from `workspaceSessionFilter()`: include sessions whose `cwd` or `metadata.project_cwd` is the selected root or a child path, and exclude sibling prefixes such as `/tmp/app-old` for `/tmp/app`.
- Acceptance must prove every major `/api/workflows` section excludes sessions, agents, events, and token rows from other OpenSpec roots when an active workspace or explicit `workspaceRoot` is set.
- Live monitor evidence on 2026-04-28 showed one `run_id` (`5d7d8250-340a-4943-8623-1b41d734338c`) attached to more than ten distinct `sessions.id` values in `GET /api/sessions`, all under `B:\project\ccs`.
- The same run showed child-looking rows whose only event was `SessionStart` with `source: "startup"`, while the main run session continued to receive tool events and transcript/token metadata.
- `claude-monitor/server/routes/hooks.js` currently calls `ensureSession(data.session_id, data)` before considering `run_id`, so any new Claude `session_id` creates a visible session even when it belongs to an existing CCSM run.
- `claude-monitor/server/routes/sessions.js` handles `?run_id=` through `stmts.getSessionByRunId.get(runId)`, which returns a single arbitrary matching row even though the schema allows many rows with the same `run_id`.
- The fix needs a canonical-session rule plus source-session aliasing. It should not simply select the first `run_id` row forever, because Agent Teams child `SessionStart` hooks may arrive before the main session's tool/transcript events.
- Candidate canonical signals include non-startup lifecycle/tool events, transcript/token metadata, user-facing session cwd, and the first session that receives substantial main-agent activity. If a provisional child session was created first, later main-session evidence must either reparent/merge data or keep the child hidden as an alias.
- Current checkpoint on 2026-04-28: the Workflow route now passes `workspaceRoot` into all top-level aggregates, and the targeted `Workflow Project Scope` server suite passes 9/9. The original P1 Workflow scoping finding appears implemented, but it still needs full server-suite verification before acceptance.
- Current checkpoint on 2026-04-28: `node --test claude-monitor/server/__tests__/api.test.js` returns exit code 1 in the current tree without reporter output, while narrower suites pass. This makes the change not acceptable yet; the next planning step should either isolate the full-suite failure or split the bloated test file into reliably reportable focused suites.
- Current checkpoint on 2026-04-28: existing `Run ID Correlation` tests only cover a one-run-id-to-one-session case. They do not cover the observed failure mode where multiple raw Claude `session_id` values share one CCSM `run_id`, so `monitor-session-correlation` remains an unimplemented required rework slice.

## Capabilities

### Modified Capabilities

- `monitor-process-control`: Monitor lifecycle commands now include shutdown and project-aware process behavior.
- `execution-progress-monitoring`: Monitor board/session data must follow the selected project context and show accurate best-known model labels.

### New Capabilities

- `monitor-project-selection`: Monitor users can choose the active project context from discoverable OpenSpec project roots.
- `workflow-model-attribution`: Workflow analytics and session lists identify the concrete model used by a session whenever monitor data contains enough evidence.
- `monitor-session-correlation`: Monitor session ingestion keeps one logical CCSM run visible as one monitor session even when Claude Agent Teams emits multiple raw Claude session ids.

## Impact

- CLI command routing for `ccsm monitor shutdown`.
- Claude monitor process ownership and safe-stop utilities.
- Monitor server project context APIs and workspace-root handling.
- Monitor client project selector UI and selected-project state.
- Monitor hook ingestion, transcript extraction integration, and session model persistence.
- Monitor hook ingestion, session alias/correlation storage, and run-id lookup semantics.
- Workflow analytics queries that currently rely directly on `sessions.model`.
- Tests for project selection, selected-project data scoping, shutdown behavior, Agent Teams run-id session correlation, and safe failure on unknown port occupants.
- Tests for model backfill from transcript token usage and model display when hook payloads omit `data.model`.
