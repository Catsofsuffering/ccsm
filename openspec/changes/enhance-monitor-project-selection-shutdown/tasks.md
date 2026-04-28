## 1. Monitor Shutdown CLI

- [x] Add a stop-only monitor shutdown utility in `src/utils/claude-monitor.ts` that reuses the existing port health and PID safety checks.
- [x] Export the shutdown utility from `src/index.ts`.
- [x] Add `shutdownMonitor()` in `src/commands/monitor.ts` with user-facing output for stopped, not-running, and unsafe-port states.
- [x] Route `ccsm monitor shutdown` in `src/cli-setup.ts` and update the available action list.
- [x] Preserve monitor runtime install filtering so copied monitor runtimes exclude test files, `client/dist`, `node_modules`, `data`, and `.tsbuildinfo` artifacts. (Already implemented in `installBundledMonitor` filter)
- [x] Add or update tests in `src/utils/__tests__/claude-monitor.test.ts` for running monitor shutdown, not-running shutdown, and unknown service refusal.

## 2. Project Selection Server Scope

- [x] Extend `claude-monitor/server/lib/openspec-state.js` so workspace candidates include active/env roots plus session `cwd` and `metadata.project_cwd` roots, with normalized/deduplicated output.
- [x] Ensure `GET /api/settings/info` exposes selectable project roots with enough label/root/source data for the client.
- [x] Keep `POST /api/settings/openspec-workspace` as the single write path and preserve rejection of invalid roots.
- [x] Add a reusable server-side workspace session filter for the active selected project root.
- [x] Apply the project filter to Workflow/session data surfaces that are project-scoped, without breaking global health/statistics endpoints.
- [x] Add server tests for project candidate discovery, invalid selection rejection, selected-project OpenSpec data, and selected-project Workflow/session scoping.

## 3. Workflow Model Attribution

- [x] Add a best-known session model resolver that prefers concrete hook/session model, then largest concrete token usage model, then supported metadata/runtime hints, then existing concrete model.
- [x] Backfill `sessions.model` during hook transcript ingestion when transcript token usage provides a concrete model and the session model is empty or `unknown`.
- [x] Make Workflow model delegation and session complexity queries use the same best-known model rule, including historical sessions with token rows but null session model.
- [x] Preserve all per-model `token_usage` rows for token and cost breakdowns.
- [x] Add tests proving Workflow does not show `unknown` when transcript-derived token usage contains `minimax` or another concrete model.
- [x] Add tests proving sessions with no reliable model evidence remain unknown/null rather than guessed.

## 4. Project Selector Client

- [x] Add/update client types and API helpers for selectable OpenSpec workspace roots.
- [x] Add a compact project selector to the shared monitor shell, reusing existing sidebar/workspace UI patterns.
- [x] On project selection, call `api.settings.updateOpenSpecWorkspace()` and refresh or invalidate OpenSpec board, Workflow, Control Plane, and project-scoped session views.
- [x] Preserve the current collapsed sidebar behavior and avoid adding a new visual system.
- [x] Add client tests for rendering discovered projects and submitting a project selection.

## 5. Verification

- [x] Run `openspec validate enhance-monitor-project-selection-shutdown`.
- [x] Run targeted root tests for monitor process control.
- [x] Run targeted monitor server tests for project selection and model attribution.
- [x] Run targeted monitor client tests for the project selector.
- [x] Run `pnpm typecheck`.
- [x] Run `pnpm build` if root TypeScript code changes.
- [x] Run `npm --prefix claude-monitor/client run build` if client code changes.

## 6. Post-Review Rework: Installed Runtime Cleanup

- [x] Reproduce `ccsm init --skip-prompt --force` failure from stale installed monitor client tests in `~/.ccsm/claude-monitor`.
- [x] Update monitor runtime installation so stale excluded target artifacts are pruned before copying new bundled files.
- [x] Preserve installed monitor runtime `data` while pruning stale tests, specs, client dist, and `.tsbuildinfo` files.
- [x] Add a root utility regression test for stale excluded artifact pruning.
- [x] Rebuild the CLI dist and verify `ccsm init --skip-prompt --force` succeeds.

## 7. Post-Review Rework: Workflow Project Scope

- [x] Introduce a reusable Workflow scope helper for `statusFilter + workspaceRoot` that supports session, agent, event, and token usage queries with explicit aliases.
- [x] Pass `workspaceRoot` into every top-level `/api/workflows` aggregate function.
- [x] Scope `stats`, including session totals, agent totals, subagent totals, depth, duration, compactions, and top tool flow.
- [x] Scope `orchestration`, including session count, main count, subagent types, edges, outcomes, and compaction counts.
- [x] Scope `toolFlow`, including transitions and tool counts.
- [x] Scope `effectiveness`, including type counts, average duration, and weekly trend.
- [x] Scope `patterns`, including sequences, total session denominator, and solo sessions.
- [x] Scope `errorPropagation`, including depth errors, session-level errors, error types, event errors, sessions-with-errors, total sessions, and error rate.
- [x] Scope `concurrency`, including aggregate lane source rows.
- [x] Preserve existing best-known model attribution behavior while changing Workflow scoping.
- [x] Add server tests proving each major Workflow response section excludes another workspace under active workspace and explicit `workspaceRoot`.
- [x] Run focused Workflow project-scope verification: `node --test --test-name-pattern="Workflow Project Scope" claude-monitor/server/__tests__/api.test.js`.
- [x] Run `node --test claude-monitor/server/__tests__/api.test.js`.
- [x] Run `openspec validate enhance-monitor-project-selection-shutdown --strict`.

## 8. Packet A: Server Test Acceptance Stabilization

- [x] Reproduce the silent full-suite failure for `node --test claude-monitor/server/__tests__/api.test.js` and capture a useful failing assertion, timeout, or process-exit cause.
- [x] Isolate whether the full-suite failure is caused by Workflow project-scope tests, unrelated ACP/runtime-health additions, shared test state, server teardown, or reporter/process-exit behavior.
- [x] If full-suite output remains silent, split or refactor only the minimum server test structure needed so the failing area reports clearly.
- [x] Preserve the existing passing `Workflow Project Scope` focused suite unless a failing assertion proves a narrow code or test correction is required.
- [x] Document the resolved failure cause in this tasks file or execution return packet.
- [x] Run `node --test --test-name-pattern="Workflow Project Scope" claude-monitor/server/__tests__/api.test.js`.
- [x] Run `node --test claude-monitor/server/__tests__/api.test.js`.
- [x] Run `openspec validate enhance-monitor-project-selection-shutdown --strict`.

## 9. Packet B: Agent Teams Session Correlation - Reproduction And Tests

- [x] Reproduce the duplicate-session case with hook fixtures where several `data.session_id` values share one `data.run_id`.
- [x] Add a focused failing test proving two or more `SessionStart` hooks with the same `run_id` do not produce multiple visible sessions.
- [x] Add a focused failing test proving a startup-only child hook followed by richer main activity converges to one canonical visible session.
- [x] Add a focused failing test proving no-`run_id` hook events keep existing session-id behavior.

## 10. Packet B: Agent Teams Session Correlation - Canonical Ingestion

- [x] Add a canonical session correlation helper or alias path that resolves `run_id` before hook ingestion inserts a new visible session.
- [x] Preserve each raw Claude `data.session_id` as `source_session_id` metadata on normalized events or in an alias table.
- [x] Ensure child/startup-only `SessionStart` hooks do not become permanent visible sessions when richer main-session activity for the same `run_id` arrives later.
- [x] Ensure canonicalization does not break transcript token extraction, compaction import, TeamReturn normalization, or model backfill.

## 11. Packet B: Agent Teams Session Correlation - Lookup And Status-Driven Wait

- [x] Update `GET /api/sessions?run_id=<id>` to return the canonical logical session deterministically.
- [x] Ensure status-driven session creation/terminal waiting uses the canonical logical session and does not wait on a child alias.
- [x] Add server tests proving one `run_id` with multiple raw Claude session ids appears as one visible session in session lists.
- [x] Add server tests proving raw source session ids remain traceable after canonicalization.
- [x] Add or update tests proving terminal state on the canonical logical session resolves status-driven waiting and child aliases do not keep the run falsely active.

## 12. Packet B: Agent Teams Session Correlation - Verification

- [x] Run `node --test claude-monitor/server/__tests__/api.test.js`.
- [x] Run `openspec validate enhance-monitor-project-selection-shutdown --strict`.
- [x] If `src/utils/claude-cli.ts` changes, run `pnpm typecheck`. (Not required; `src/utils/claude-cli.ts` was not changed.)

## 13. Packet C: Shutdown Failure Semantics

- [x] Reproduce the acceptance finding that `shutdownMonitor()` prints the unknown-service error but returns successfully.
- [x] Add or update a focused command-layer test proving `unknown-service` from `shutdownClaudeMonitor()` makes `ccsm monitor shutdown` fail with a non-zero result or thrown command error.
- [x] Add or update a focused command-layer test proving the `not-running` shutdown case remains a successful no-op.
- [x] Update `src/commands/monitor.ts` so `success: false` shutdown results fail the command after printing the clear error message.
- [x] Preserve existing stopped and not-running output.
- [x] Run `pnpm vitest run src/utils/__tests__/claude-monitor.test.ts`.
- [x] Run the focused command-layer shutdown test if introduced separately.
- [x] Run `pnpm typecheck`.
- [x] Run `pnpm build`.
- [x] Run `openspec validate enhance-monitor-project-selection-shutdown --strict`.

## 14. Packet D: Workflow Combined Scope Semantics

- [x] Add a focused failing server test proving `/api/workflows?workspaceRoot=<root>&status=<status>` scopes `toolFlow.transitions` and `toolFlow.toolCounts` by both workspace and status.
- [x] Add a focused failing server test proving `/api/workflows?workspaceRoot=<root>&status=<status>` scopes `cooccurrence` by both workspace and status.
- [x] Audit the remaining top-level Workflow aggregate functions for workspace branches that omit `statusFilter`.
- [x] Update `claude-monitor/server/routes/workflows.js` to combine status and workspace filters through explicit aliases for affected queries.
- [x] Preserve best-known model attribution and exact-or-child workspace path semantics.
- [x] Run `node --test --test-name-pattern="Workflow Project Scope" claude-monitor/server/__tests__/api.test.js`.
- [x] Run `node --test claude-monitor/server/__tests__/api.test.js`.
- [x] Run `openspec validate enhance-monitor-project-selection-shutdown --strict`.
