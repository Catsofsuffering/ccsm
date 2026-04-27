## 1. Monitor Shutdown CLI

- [ ] Add a stop-only monitor shutdown utility in `src/utils/claude-monitor.ts` that reuses the existing port health and PID safety checks.
- [ ] Export the shutdown utility from `src/index.ts`.
- [ ] Add `shutdownMonitor()` in `src/commands/monitor.ts` with user-facing output for stopped, not-running, and unsafe-port states.
- [ ] Route `ccsm monitor shutdown` in `src/cli-setup.ts` and update the available action list.
- [ ] Add or update tests in `src/utils/__tests__/claude-monitor.test.ts` for running monitor shutdown, not-running shutdown, and unknown service refusal.

## 2. Project Selection Server Scope

- [ ] Extend `claude-monitor/server/lib/openspec-state.js` so workspace candidates include active/env roots plus session `cwd` and `metadata.project_cwd` roots, with normalized/deduplicated output.
- [ ] Ensure `GET /api/settings/info` exposes selectable project roots with enough label/root/source data for the client.
- [ ] Keep `POST /api/settings/openspec-workspace` as the single write path and preserve rejection of invalid roots.
- [ ] Add a reusable server-side workspace session filter for the active selected project root.
- [ ] Apply the project filter to Workflow/session data surfaces that are project-scoped, without breaking global health/statistics endpoints.
- [ ] Add server tests for project candidate discovery, invalid selection rejection, selected-project OpenSpec data, and selected-project Workflow/session scoping.

## 3. Workflow Model Attribution

- [ ] Add a best-known session model resolver that prefers concrete hook/session model, then largest concrete token usage model, then supported metadata/runtime hints, then existing concrete model.
- [ ] Backfill `sessions.model` during hook transcript ingestion when transcript token usage provides a concrete model and the session model is empty or `unknown`.
- [ ] Make Workflow model delegation and session complexity queries use the same best-known model rule, including historical sessions with token rows but null session model.
- [ ] Preserve all per-model `token_usage` rows for token and cost breakdowns.
- [ ] Add tests proving Workflow does not show `unknown` when transcript-derived token usage contains `minimax` or another concrete model.
- [ ] Add tests proving sessions with no reliable model evidence remain unknown/null rather than guessed.

## 4. Project Selector Client

- [ ] Add/update client types and API helpers for selectable OpenSpec workspace roots.
- [ ] Add a compact project selector to the shared monitor shell, reusing existing sidebar/workspace UI patterns.
- [ ] On project selection, call `api.settings.updateOpenSpecWorkspace()` and refresh or invalidate OpenSpec board, Workflow, Control Plane, and project-scoped session views.
- [ ] Preserve the current collapsed sidebar behavior and avoid adding a new visual system.
- [ ] Add client tests for rendering discovered projects and submitting a project selection.

## 5. Verification

- [ ] Run `openspec validate enhance-monitor-project-selection-shutdown`.
- [ ] Run targeted root tests for monitor process control.
- [ ] Run targeted monitor server tests for project selection and model attribution.
- [ ] Run targeted monitor client tests for the project selector.
- [ ] Run `pnpm typecheck`.
- [ ] Run `pnpm build` if root TypeScript code changes.
- [ ] Run `npm --prefix claude-monitor/client run build` if client code changes.
