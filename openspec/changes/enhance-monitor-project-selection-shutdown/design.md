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
- Preserve current start, detach, restart, install, hooks, live event, and OpenSpec read-only behavior.

**Non-Goals:**

- Redesign the monitor visual system or navigation hierarchy.
- Add multi-monitor or multi-port runtime management.
- Make OpenSpec state writable from the monitor UI.
- Infer exact per-subagent model if only a session-level model is observable.
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

## Risks / Trade-offs

- Session `cwd` may be a subdirectory rather than the project root -> normalize by resolving ancestor OpenSpec roots before comparing.
- Multiple model rows can exist for one session -> choose the largest effective token total for session display while retaining all rows for token/cost breakdown.
- Some historical sessions may not have transcript/token data -> leave them unknown rather than guessing.
- Project selector changes can leave stale client state visible -> refresh affected pages after setting the workspace and expose selected root in API responses.
- Shutdown on Windows can be aggressive through `taskkill /F` -> only call it after monitor health confirms the port is the CCSM monitor.

## Execution Handoff Contract

**Execution goal:** Implement monitor project selection, safe `ccsm monitor shutdown`, and reliable Workflow model attribution without changing the primary Codex-led workflow semantics.

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
- Do not make MCP, Gemini, or `codeagent-wrapper` required.
- Do not edit OpenSpec archive contents.
- Do not change release metadata unless implementation requires a release.

**Required verification:**

- Run targeted unit tests for `shutdownClaudeMonitor` / monitor process control.
- Run targeted monitor server tests covering project selection, project-scoped Workflow/session data, and model backfill from transcript-derived token usage.
- Run targeted client tests for the project selector if added.
- Run `openspec validate enhance-monitor-project-selection-shutdown`.
- Run `pnpm typecheck`.
- Run `pnpm build` if root TypeScript code changes.
- Run monitor client build/tests if client code changes: `npm --prefix claude-monitor/client run build` and the relevant test command.
- Run monitor server tests if server code changes.

**Rework triggers:**

- `ccsm monitor shutdown` kills an unknown process or fails when no monitor is running.
- `ccsm monitor`, `ccsm monitor --detach`, `ccsm monitor restart`, `ccsm monitor install`, or `ccsm monitor hooks` behavior regresses.
- Selecting a project does not update OpenSpec board or Workflow data.
- Invalid project roots can be persisted as the active workspace.
- Workflow still shows `unknown` when a session has concrete transcript/token model data.
- Token usage model rows and Workflow session model labels disagree without a documented reason.
- Historical sessions with no model evidence are assigned guessed model names.
