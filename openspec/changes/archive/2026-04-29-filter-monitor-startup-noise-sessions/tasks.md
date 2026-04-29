## Packet A: Visibility Classifier And Default API Filtering

- [x] Add focused server fixtures/tests that reproduce the observed shape: startup-only `SessionStart`, missing/no-usage transcript, zero tokens, and later abandoned status.
- [x] Add a focused server test proving startup-only rows are excluded from default `GET /api/sessions`.
- [x] Add a focused server test proving diagnostic mode, preferably `includeNoise=true`, returns startup-only rows with a clear marker.
- [x] Add a focused server test proving startup-only rows are excluded from Workflow complexity and session-count denominators.
- [x] Add a focused server test where a short real session receives non-start activity and remains visible.
- [x] Implement a shared server helper that classifies sessions as startup-only noise using persisted event, token, transcript, and hook-source evidence.
- [x] Apply the helper to default `GET /api/sessions` without changing no-`run_id` real session behavior.
- [x] Apply the helper to default `GET /api/workflows`, at minimum complexity and any session-count denominator covered by tests.
- [x] Add or document the diagnostic marker returned for startup-only rows.
- [x] Run focused server tests for Packet A.
- [x] Run `openspec validate filter-monitor-startup-noise-sessions --strict`.

## Packet B: Agent Teams Startup Child Ingestion

- [x] Add a fixture where one real Agent Teams run shares a `run_id` with multiple startup-only child `SessionStart` rows.
- [x] Add a focused failing test proving startup-only child hooks with the same `run_id` do not create multiple visible logical sessions.
- [x] Add a focused failing test proving child startup hooks that arrive before richer main activity converge to one visible logical run session.
- [x] Add a focused test proving raw Claude `source_session_id`, `run_id`, hook source, and transcript path remain traceable.
- [x] Update hook ingestion so startup-only `SessionStart` rows are provisional, hidden, or alias-only until activity arrives. (Satisfied by read-time startup-noise hiding plus existing run-id canonicalization.)
- [x] Ensure `run_id` canonicalization treats startup-only child hooks as aliases or hidden noise rather than visible sibling sessions.
- [x] Promote provisional/hidden sessions when later events or token usage prove real activity.
- [x] Preserve existing behavior for hook events without `run_id` once they show real activity.
- [x] Run focused server tests for Packet B.
- [x] Run `openspec validate filter-monitor-startup-noise-sessions --strict`.

## Packet C: Historical Runtime Reclassification

- [x] Add a narrow reclassification or read-time compatibility path for existing startup-only abandoned rows.
- [x] Prefer read-time classification unless persistent metadata is required for performance or diagnostic clarity.
- [x] If an explicit maintenance action is added, make it opt-in and non-destructive by default. (No maintenance action was added; read-time classification is non-destructive.)
- [x] Add a focused server test proving pre-existing startup-only abandoned rows are hidden from default views.
- [x] Add a focused server test proving diagnostic mode can still expose or count historical startup-only rows.
- [x] Add a focused server test proving no historical rows are deleted or model-guessed by default.
- [x] Run focused server tests for Packet C.
- [x] Run `openspec validate filter-monitor-startup-noise-sessions --strict`.

## Packet D: Final Acceptance And Regression Sweep

- [x] Run focused server tests proving startup-only rows are hidden from default Sessions.
- [x] Run focused server tests proving diagnostic mode exposes startup-only rows with clear markers.
- [x] Run focused server tests proving startup-only rows are hidden from Workflow complexity and counts.
- [x] Run focused server tests proving real Agent Teams sessions with token usage display their best-known model.
- [x] Run focused server tests proving no-`run_id` real sessions remain visible after non-start activity.
- [x] Run focused server tests proving startup-only child hooks with the same `run_id` do not create multiple visible logical sessions.
- [x] Run `node --test claude-monitor/server/__tests__/api.test.js` or document the focused server suites that replace it.
- [x] Run `openspec validate filter-monitor-startup-noise-sessions --strict`.

## Packet E: Workflow Denominator Rework

### Packet E1: Failing Workflow Coverage

- [x] Add a focused server test proving startup-only main-agent rows do not appear as `unknown` in Workflow model delegation.
- [x] Add a focused server test proving startup-only subagent rows do not pollute Workflow subagent model delegation.
- [x] Add focused server tests proving startup-only rows do not affect Workflow session-count denominators or percentages in orchestration, patterns, and compaction.
- [x] Add a focused server test proving `stats.totalSessions` and `complexity` count short real sessions consistently when the shared classifier preserves them.

### Packet E2: Shared Workflow Scope

- [x] Add or refactor a shared Workflow meaningful-session helper based on `isStartupOnlyNoiseSession()`.
- [x] Ensure the helper composes existing `status` and `workspaceRoot` filters before applying startup-noise classification.
- [x] Ensure the helper provides deterministic empty-list behavior for downstream SQL filters.

### Packet E3: Workflow Consumers

- [x] Align `stats.totalSessions` with the shared classifier semantics instead of the simplified SQL approximation.
- [x] Apply the helper to `modelDelegation.mainModels` and `modelDelegation.subagentModels`.
- [x] Apply the helper to `getOrchestrationData()` session denominators.
- [x] Apply the helper to `getWorkflowPatterns()` session denominators and percentages.
- [x] Apply the helper to `getCompactionImpact()` session denominators.
- [x] Preserve existing status and workspace filtering semantics.

### Packet E4: Verification

- [x] Run `node --test claude-monitor/server/__tests__/api.test.js`.
- [x] Run `node --test claude-monitor/server/__tests__/session-noise.test.js`.
- [x] Run `pnpm typecheck`.
- [x] Run `openspec validate filter-monitor-startup-noise-sessions --strict`.
- [x] Run `git diff --check`.

## Acceptance Evidence

- [x] `node --test claude-monitor/server/__tests__/api.test.js --test-name-pattern="Startup-Only Noise"` passed. The local Node runner executed the full API file and reported 147 passing tests.
- [x] `node --test claude-monitor/server/__tests__/session-noise.test.js` passed with 12 passing tests.
- [x] `node --test claude-monitor/server/__tests__/api.test.js` passed.
- [x] `pnpm typecheck` passed.
- [x] `openspec validate filter-monitor-startup-noise-sessions --strict` passed.
- [x] `git diff --check` passed.
- [x] Packet E: `node --test claude-monitor/server/__tests__/session-noise.test.js` passed with 18 tests (8 new E1 tests added).
- [x] Packet E: `node --test claude-monitor/server/__tests__/api.test.js` passed with 147 tests.
- [x] Packet E: `getMeaningfulWorkflowSessionIds` helper added and applied to getWorkflowStats, getModelDelegation, getOrchestrationData, getWorkflowPatterns, and getCompactionImpact.

## Acceptance Review

- [x] 2026-04-29 Codex acceptance review failed because Workflow model delegation, several Workflow session denominators, and `stats.totalSessions` were not yet aligned with the shared startup-noise classifier. Packet E tracks the required rework.
- [x] 2026-04-29 Packet E automated checks passed, but Codex acceptance review found Workflow patterns still build numerators from raw sessions and stats average duration still uses raw ended sessions.

## Packet F: Workflow Scope Closure Rework

### Packet F1: Exact Regression Coverage

- [x] Add or tighten a focused server test proving startup-only subagent rows cannot create Workflow pattern counts.
- [x] Add or tighten a focused server test proving `stats.avgDurationSec` ignores startup-only ended shells.
- [x] Replace weak Packet E `>= 1` assertions with exact scoped assertions where practical for orchestration, patterns, compaction, and stats duration.
- [x] Ensure Packet F tests use a controlled `workspaceRoot` and cleanup all inserted rows.

### Packet F2: Final Scope Application

- [x] Filter `getWorkflowPatterns()` sequence queries to meaningful session ids before building pattern counts.
- [x] Filter `getWorkflowStats()` average-duration source rows to meaningful session ids.
- [x] Preserve deterministic empty-list behavior when there are no meaningful sessions, especially for patterns and solo metrics.
- [x] Preserve existing status and workspace filtering semantics.

### Packet F3: Verification

- [x] Run `node --test claude-monitor/server/__tests__/session-noise.test.js`.
- [x] Run `node --test claude-monitor/server/__tests__/api.test.js`.
- [x] Run `pnpm typecheck`.
- [x] Run `openspec validate filter-monitor-startup-noise-sessions --strict`.
- [x] Run `git diff --check`.
