## Context

The monitor already has a workspace setting path: `startClaudeMonitor()` resolves the nearest OpenSpec root and posts it to `/api/settings/openspec-workspace`, while the monitor server resolves OpenSpec state through `claude-monitor/server/lib/openspec-state.js`. That gives this change a good foundation for project selection, but the UI only displays workspace information today; it does not let users choose another discovered project root from the monitor itself.

The monitor also has restart process control. `restartClaudeMonitor()` finds the configured port, verifies monitor health, stops the listener, and refuses to kill unknown services. Shutdown should reuse that safety model and stop without starting a replacement.

Workflow model attribution currently depends heavily on `sessions.model`. Hook-created sessions set that field only from `data.model`, but Claude hook stdin often omits model data. Transcript extraction already finds concrete models and stores them in `token_usage`, so session-level model labels need a backfill path from best-known monitor evidence.

## Goals / Non-Goals

**Goals:**

- Let monitor users choose the active OpenSpec project root from discovered/recent roots.
- Make project selection update OpenSpec board, Workflow, Control Plane, and project-scoped session views consistently.
- Add `ccsm monitor shutdown` as a safe stop-only lifecycle action.
- Backfill and display best-known session models in Workflow when hook payloads omit `data.model`.
- Prevent one CCSM-launched Claude Agent Teams run from appearing as many visible monitor sessions when child hooks emit distinct Claude `session_id` values.
- Preserve current start, detach, restart, install, hooks, live event, and OpenSpec read-only behavior.

**Non-Goals:**

- Redesign the monitor visual system or navigation hierarchy.
- Add multi-monitor or multi-port runtime management.
- Make OpenSpec state writable from the monitor UI.
- Infer exact per-subagent model if only a session-level model is observable.
- Change Claude Agent Teams hook semantics or require Claude to stop emitting child `session_id` values.
- Rewrite historical monitor data with a broad migration unless a narrow alias/backfill step is required for correctness.
- Require MCP, Gemini, or wrapper-managed execution for monitor operation.

## Decisions

### Project Selection Reuses The Existing Workspace Setting

The server should keep `openspec.activeWorkspaceRoot` as the durable active project setting. The existing `POST /api/settings/openspec-workspace` endpoint is the right write path, and `GET /api/settings/info` already exposes `activeWorkspaceRoot` and `detectedWorkspaceRoots`.

The missing piece is a user-facing selector. The client should render a compact project selector in the shared monitor shell, preferably the sidebar/footer area that already shows workspace metadata. Selecting a project posts the workspace root, then refreshes or invalidates OpenSpec/Workflow/Control Plane data that is derived from the active workspace.

### Discovered Projects Come From Trusted Local Evidence

The first implementation should use roots already discoverable from local monitor state:

- explicit active workspace setting
- `OPENSPEC_WORKSPACE_ROOT` / `CCG_WORKSPACE_ROOT`
- session `cwd` and `metadata.project_cwd` ancestry
- current server/repo fallback roots

This avoids filesystem-wide scanning. Each candidate must resolve to a directory containing `openspec/`; invalid roots are rejected server-side.

### Project Selection Must Scope Data Surfaces

OpenSpec board and Control Plane already resolve the active workspace. Workflow and session lists should follow the selected project when they are used as project views. The server should provide a reusable workspace filter that matches sessions whose `cwd` or `metadata.project_cwd` is under the selected workspace root.

Global analytics can remain global unless explicitly wired to a selected project, but Workflow page data and project-facing session selectors should be project-scoped so switching projects has visible effect.

### Workflow Scope Must Be Applied To The Whole Response

`GET /api/workflows` should treat `workspaceRoot` as a response-level scope, not as an optional filter for only some widgets. When the route defaults to `getActiveWorkspaceRoot()` or receives an explicit `workspaceRoot`, every aggregate returned by the endpoint must derive from the same scoped session set.

The implementation should introduce a small workflow-local scope helper instead of hand-writing unrelated SQL fragments in each query. The helper should combine status and workspace filters, support the aliases used by `sessions`, `agents`, `events`, and `token_usage`, and require a `sessions` join when filtering non-session tables by workspace. It must preserve the existing exact-or-child path behavior from `workspaceSessionFilter()` and avoid brittle string replacement of SQL identifiers.

### Shutdown Is Stop-Only Process Control

`ccsm monitor shutdown` should check the configured port, verify the listener is the CCSM monitor via health probing, stop it with the existing PID strategy, wait until health is unavailable, and report a clear result. If nothing is running, it should report that the monitor is not running and exit successfully. If the port is occupied by an unknown service, it must fail clearly and not kill the process.

### Session Model Resolution Has One Best-Known Rule

The monitor should maintain `sessions.model` as the best-known session label. Resolution order:

1. explicit hook/session API model when it is a non-empty, non-`unknown` value
2. transcript-derived `token_usage` model with the largest effective token total for the session
3. model/provider hints in session metadata or hook payloads, including `minimax`
4. existing non-empty `sessions.model`
5. null/unknown only when no evidence exists

When transcript extraction writes `token_usage`, hook ingestion should backfill `sessions.model` if the current session model is empty or `unknown`. Workflow aggregation should also coalesce to the best-known model from token usage so older rows become readable before a migration/backfill is run.

### Run ID Defines The CCSM Execution Boundary

For CCSM-launched status-driven runs, `CCSM_RUN_ID` is injected into the Claude environment and forwarded by `claude-monitor/scripts/hook-handler.js` as `data.run_id`. The monitor should treat that run id as the logical execution boundary for session lists and status-driven polling.

Raw Claude `data.session_id` is still valuable, but it should become source identity rather than the only visible monitor identity when `data.run_id` is present. Hook ingestion should resolve an incoming event to a canonical logical session before calling the session creation/update path. Events should retain the original raw `session_id` in persisted event data or explicit alias metadata so debugging can still trace which Claude child session emitted the hook.

The canonical rule must handle out-of-order Agent Teams hooks. A child `SessionStart` with `source: "startup"` may arrive before the main run session receives tool activity or transcript evidence. The implementation should therefore support a provisional alias state or a merge/reparent step: if a low-information child session was seen first, later stronger main-session evidence for the same `run_id` must become the canonical session, and earlier child events must not remain as separate visible sessions.

`GET /api/sessions?run_id=<id>` should return the canonical logical session, not an arbitrary SQLite row with the matching `run_id`. If the API also exposes raw/alias sessions for diagnostics, they should be clearly marked and excluded from normal session lists and status-driven wait selection.

## Risks / Trade-offs

- Session `cwd` may be a subdirectory rather than the project root -> normalize by resolving ancestor OpenSpec roots before comparing.
- Multiple model rows can exist for one session -> choose the largest effective token total for session display while retaining all rows for token/cost breakdown.
- Some historical sessions may not have transcript/token data -> leave them unknown rather than guessing.
- Project selector changes can leave stale client state visible -> refresh affected pages after setting the workspace and expose selected root in API responses.
- Shutdown on Windows can be aggressive through `taskkill /F` -> only call it after monitor health confirms the port is the CCSM monitor.
- Using `run_id` too naively can pick a child startup session as canonical -> require canonical evidence or alias reparenting when richer main-session hooks arrive.
- Hiding child sessions can obscure debugging -> preserve raw Claude session ids in event metadata or an alias table.
- Existing databases may already contain duplicate rows for a run id -> new ingestion must stop future duplication; historical cleanup can be a separate narrow maintenance path if needed.

## Execution Handoff Contract

**Execution goal:** Implement monitor project selection, safe `ccsm monitor shutdown`, and reliable Workflow model attribution without changing the primary Codex-led workflow semantics.

### Remaining Rework Packets

The remaining work should be dispatched in order. Packets A and B are already implemented and verified. Do not start Packet D until Packet C either passes or returns a clear, reproducible blocker, because Packet C closes the remaining P1 shutdown contract failure.

#### Packet A: Server Test Acceptance Stabilization

**Goal:** Make the server verification gate trustworthy again before accepting already-implemented Workflow project scoping.

**Scope:**

- Investigate why `node --test claude-monitor/server/__tests__/api.test.js` exits with code 1 in the current tree while focused suites such as `Workflow Project Scope` pass.
- Preserve the existing Workflow project-scope implementation unless a failing assertion proves a narrow correction is required.
- If the full file is too large or exits without useful reporter output, split or isolate only enough tests/helpers to make failures reportable and repeatable.
- Do not mark Workflow project-scope verification complete until the full server command passes or a smaller replacement command is explicitly justified in tasks.

**Allowed paths for Packet A:**

- `claude-monitor/server/__tests__/api.test.js`
- adjacent server test helpers under `claude-monitor/server/__tests__/**` if introduced
- `claude-monitor/server/routes/workflows.js` only for a narrow fix backed by a failing test
- `openspec/changes/enhance-monitor-project-selection-shutdown/tasks.md`

**Required checks for Packet A:**

- `node --test --test-name-pattern="Workflow Project Scope" claude-monitor/server/__tests__/api.test.js`
- `node --test claude-monitor/server/__tests__/api.test.js`
- `openspec validate enhance-monitor-project-selection-shutdown --strict`

#### Packet B: Agent Teams Session Correlation

**Goal:** Represent one CCSM-launched Claude Agent Teams run as one visible monitor session when hook events share a non-empty `run_id`, while preserving raw Claude `session_id` traceability.

**Scope:**

- Add failing fixtures/tests first for multiple `data.session_id` values sharing one `data.run_id`.
- Resolve canonical logical session identity before hook ingestion inserts a new visible session.
- Preserve raw Claude source session ids on events or aliases.
- Update `GET /api/sessions?run_id=<id>` to return the canonical logical session deterministically.
- Keep existing no-`run_id` Claude hook behavior compatible.
- Keep status-driven `ccsm claude exec` behavior aligned with the canonical session returned by the monitor API.

**Allowed paths for Packet B:**

- `claude-monitor/server/db.js`
- `claude-monitor/server/routes/hooks.js`
- `claude-monitor/server/routes/sessions.js`
- `claude-monitor/server/lib/**` for a small session correlation/alias helper if needed
- `claude-monitor/server/__tests__/api.test.js`
- `claude-monitor/server/lib/__tests__/**` if helper tests are introduced
- `src/utils/claude-cli.ts` only if monitor API canonicalization alone cannot make status-driven waiting correct
- `openspec/changes/enhance-monitor-project-selection-shutdown/tasks.md`

**Required checks for Packet B:**

- A focused server test proving one `run_id` with multiple raw Claude session ids appears as one visible session.
- A focused server test proving raw source session ids remain traceable after canonicalization.
- `node --test claude-monitor/server/__tests__/api.test.js`
- `openspec validate enhance-monitor-project-selection-shutdown --strict`

#### Packet C: Shutdown Failure Semantics

**Goal:** Make `ccsm monitor shutdown` fail with a non-zero CLI result when the configured monitor port is occupied by an unknown service, while preserving successful no-op behavior when the monitor is not running.

**Scope:**

- Keep the low-level `shutdownClaudeMonitor()` result contract unless a narrow test proves it must change.
- Update the user-facing command wrapper so `success: false` from `shutdownClaudeMonitor()` becomes a failed CLI action.
- Preserve clear output for stopped, not-running, and unknown-service states.
- Add or update tests that prove the command layer fails on unknown-service and does not fail on not-running.
- Do not change restart/start/install/hooks behavior.

**Allowed paths for Packet C:**

- `src/commands/monitor.ts`
- `src/commands/__tests__/**` if command-layer tests are introduced
- `src/utils/__tests__/claude-monitor.test.ts` only if existing shutdown utility expectations need a narrow assertion update
- `openspec/changes/enhance-monitor-project-selection-shutdown/tasks.md`

**Required checks for Packet C:**

- Focused test proving `shutdownMonitor()` or the CLI command wrapper fails when `shutdownClaudeMonitor()` reports `unknown-service`.
- Focused test proving `shutdownMonitor()` still succeeds when the monitor is not running.
- `pnpm vitest run src/utils/__tests__/claude-monitor.test.ts`
- `pnpm typecheck`
- `pnpm build`
- `openspec validate enhance-monitor-project-selection-shutdown --strict`

#### Packet D: Workflow Combined Scope Semantics

**Goal:** Ensure every top-level `/api/workflows` aggregate applies `statusFilter + workspaceRoot` together when both are present.

**Scope:**

- Add failing tests for `/api/workflows?workspaceRoot=<root>&status=<status>` that prove `toolFlow` and `cooccurrence` exclude sessions from the selected workspace when their status does not match.
- Audit every workflow aggregate touched by the previous scope rework for the same combined-filter gap.
- Apply status and workspace filters through explicit aliases rather than string replacement.
- Preserve best-known model attribution and the existing exact-or-child workspace path matching rule.
- Do not change `/api/workflows/session/:id` drill-in behavior.

**Allowed paths for Packet D:**

- `claude-monitor/server/routes/workflows.js`
- `claude-monitor/server/__tests__/api.test.js`
- adjacent server test helpers under `claude-monitor/server/__tests__/**` if introduced
- `openspec/changes/enhance-monitor-project-selection-shutdown/tasks.md`

**Required checks for Packet D:**

- Focused server test proving `toolFlow` respects combined `workspaceRoot + status` scope.
- Focused server test proving `cooccurrence` respects combined `workspaceRoot + status` scope.
- `node --test --test-name-pattern="Workflow Project Scope" claude-monitor/server/__tests__/api.test.js`
- `node --test claude-monitor/server/__tests__/api.test.js`
- `openspec validate enhance-monitor-project-selection-shutdown --strict`

**Allowed paths:**

- `src/cli-setup.ts`
- `src/commands/monitor.ts`
- `src/index.ts`
- `src/utils/claude-monitor.ts`
- `src/utils/__tests__/claude-monitor.test.ts`
- `src/commands/__tests__/**` if CLI command routing tests are added
- `claude-monitor/server/db.js`
- `claude-monitor/server/lib/openspec-state.js`
- `claude-monitor/server/routes/settings.js`
- `claude-monitor/server/routes/openspec.js`
- `claude-monitor/server/routes/control-plane.js`
- `claude-monitor/server/routes/workflows.js`
- `claude-monitor/server/routes/sessions.js`
- `claude-monitor/server/routes/hooks.js`
- `claude-monitor/server/lib/**` for a small project/model helper if needed
- `claude-monitor/server/lib/**` for a small session correlation/alias helper if needed
- `claude-monitor/server/__tests__/api.test.js`
- `claude-monitor/server/lib/__tests__/**` if helpers are introduced
- `claude-monitor/client/src/components/Sidebar.tsx`
- `claude-monitor/client/src/components/Layout.tsx`
- `claude-monitor/client/src/lib/api.ts`
- `claude-monitor/client/src/lib/types.ts`
- `claude-monitor/client/src/pages/OpenSpecBoard.tsx`
- `claude-monitor/client/src/pages/Workflows.tsx`
- `claude-monitor/client/src/pages/Sessions.tsx`
- adjacent client tests under `claude-monitor/client/src/**/__tests__`
- `openspec/changes/enhance-monitor-project-selection-shutdown/tasks.md`

**Protected paths:**

- Do not change Claude Agent Teams protocol semantics.
- Do not change the structured Agent Teams output normalizer unless a direct model/project regression requires a narrow fix.
- Do not redesign monitor pages beyond adding the project selector and necessary selected-project states.
- Do not make session/event monitoring depend on OpenSpec being available.
- Do not reintroduce monitor installation copies of `__tests__`, `*.test.*`, `*.spec.*`, `client/dist`, `node_modules`, `data`, or `.tsbuildinfo` artifacts.
- Do not make MCP, Gemini, or `codeagent-wrapper` required.
- Do not edit OpenSpec archive contents.
- Do not change release metadata unless implementation requires a release.

**Implementation notes:**

- `src/commands/monitor.ts` is the command-facing module for monitor lifecycle output; add `shutdownMonitor()` there instead of putting user-facing shutdown output directly in `src/cli-setup.ts`.
- `src/utils/claude-monitor.ts` already contains the low-level health probe, listening PID lookup, and stop helpers used by restart. Introduce the shutdown utility by reusing those semantics rather than adding a second process-kill path.
- Keep shutdown scoped to the configured monitor port and require a healthy CCSM monitor response before killing a listener. The not-running case should be a successful no-op result.
- The monitor runtime installer recently filters test/build artifacts out of installed monitor copies. Any project-selection client tests added in this change must remain source-tree tests only and must not be required by installed runtime builds.
- Because `fs.copy(..., filter)` does not remove files that already exist in the target directory, monitor runtime installation must also prune stale excluded artifacts from the target before copying. This pruning should remove stale `__tests__`, `*.test.*`, `*.spec.*`, `client/dist`, and `.tsbuildinfo` artifacts while preserving runtime `data`.
- For the post-review Workflow scope rework, pass `workspaceRoot` into every top-level `/api/workflows` aggregate: `stats`, `orchestration`, `toolFlow`, `effectiveness`, `patterns`, `modelDelegation`, `errorPropagation`, `concurrency`, `complexity`, `compaction`, and `cooccurrence`.
- Keep `/api/workflows/session/:id` as a direct session drill-in unless a separate spec requires it to reject out-of-scope session ids.
- Do not change the best-known model attribution rule while fixing project scoping; model and scope changes should stay independently testable.
- For the Agent Teams session correlation rework, resolve canonical session identity before `ensureSession()` inserts a new row. Do not rely on `sessions.run_id` alone if multiple rows can already exist for the same run.
- Preserve the raw Claude `session_id` on events after canonicalization, for example as `source_session_id` in event data or through a session-alias table.
- Ensure `/api/sessions?run_id=<id>` uses the same canonical session rule as hook ingestion and status-driven exec.

**Required verification:**

- Run targeted unit tests for `shutdownClaudeMonitor` / monitor process control.
- Run command-layer shutdown tests proving unknown-service exits/fails and not-running remains successful.
- Run targeted monitor server tests covering project selection, project-scoped Workflow/session data, and model backfill from transcript-derived token usage.
- Add or update monitor server tests proving every major Workflow aggregate excludes another workspace when active workspace or explicit `workspaceRoot` is set.
- Add or update monitor server tests proving Workflow aggregates apply `statusFilter + workspaceRoot` together when both are present.
- Add monitor server tests proving multiple hook `session_id` values with the same `run_id` produce one visible logical session, preserve raw source ids, and return the canonical session from `GET /api/sessions?run_id=<id>`.
- Run a reinstall regression that proves `ccsm init --skip-prompt --force` succeeds after a previous install contains stale excluded monitor client test/build artifacts.
- Run targeted client tests for the project selector if added.
- Run `openspec validate enhance-monitor-project-selection-shutdown`.
- Run `pnpm typecheck`.
- Run `pnpm build` if root TypeScript code changes.
- Run monitor client build/tests if client code changes: `npm --prefix claude-monitor/client run build` and the relevant test command.
- Run monitor server tests if server code changes.

**Rework triggers:**

- `ccsm monitor shutdown` kills an unknown process, exits successfully for an unknown service, or fails when no monitor is running.
- `ccsm monitor`, `ccsm monitor --detach`, `ccsm monitor restart`, `ccsm monitor install`, or `ccsm monitor hooks` behavior regresses.
- Selecting a project does not update OpenSpec board or Workflow data.
- Any top-level Workflow aggregate still includes sessions, agents, events, or token usage from a different selected project root.
- Any top-level Workflow aggregate ignores `status` when `workspaceRoot` is also provided.
- Invalid project roots can be persisted as the active workspace.
- Workflow still shows `unknown` when a session has concrete transcript/token model data.
- Token usage model rows and Workflow session model labels disagree without a documented reason.
- Historical sessions with no model evidence are assigned guessed model names.
- Reinstalling with `--force` leaves stale monitor tests/build artifacts in `~/.ccsm/claude-monitor` or fails during installed client build.
- One Claude Agent Teams run continues to create multiple visible monitor sessions that share the same `run_id`.
- `GET /api/sessions?run_id=<id>` can return a child/startup-only session instead of the logical run session.
- Raw Claude source `session_id` is lost during canonicalization, making hook diagnostics harder.
