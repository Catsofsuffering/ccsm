## Context

The monitor currently treats every Claude hook `data.session_id` as a visible monitor session as soon as a hook arrives. This is correct for normal Claude sessions with tool activity, transcript content, token usage, or terminal events. It is too broad for Claude Agent Teams and other child process startup probes, where the only observed event can be:

- `hook_type = "SessionStart"`
- `data.source = "startup"`
- no token usage
- no subsequent tool, notification, stop, or team output events
- a transcript path that is missing or remains empty of useful assistant/user content

Those rows become abandoned through stale-session cleanup and then appear as empty unknown sessions.

## Goals / Non-Goals

**Goals:**

- Hide startup-only/no-activity sessions from default monitor UI and Workflow analytics.
- Keep diagnostic traceability for raw Claude startup hooks.
- Avoid counting startup-only shells as unknown-model Workflow sessions.
- Preserve existing behavior for real no-`run_id` Claude sessions once they show activity.
- Keep Agent Teams run-id canonicalization compatible with child startup hooks.
- Provide tests that reproduce the observed live database shape.

**Non-Goals:**

- Guess a model for sessions with no token or metadata evidence.
- Delete historical monitor data by default.
- Change Claude Agent Teams protocol semantics.
- Require Agent Teams, MCP, Gemini, or OpenSpec for generic monitor hook ingestion.
- Redesign Sessions or Workflow pages beyond filtering and optional diagnostic visibility.

## Definitions

### Startup-Only Noise Session

A session is startup-only noise when all of the following are true:

1. It has exactly one event, or all of its events are lifecycle-only startup events.
2. It has no `token_usage` rows.
3. It has no non-start activity events such as `PreToolUse`, `PostToolUse`, `Notification`, `Stop`, `SubagentStop`, `SessionEnd`, `TeamReturn`, `Compaction`, `APIError`, or `TurnDuration`.
4. The only observed hook source is startup-like, for example `data.source = "startup"` on `SessionStart`.
5. Any transcript path is missing, empty, or has no extractable usage/content evidence.

The classification should be conservative. If a session has real activity, token usage, output, errors, or a usable transcript, it must not be hidden as noise.

## Decisions

### Default User Views Exclude Startup-Only Noise

`GET /api/sessions` and `GET /api/workflows` should exclude startup-only noise by default. This keeps the user-facing monitor focused on real work sessions.

The API may expose `includeNoise=true` or a diagnostic endpoint so developers can inspect hidden rows while debugging hooks. Diagnostic responses should clearly mark rows as startup-only noise.

### Ingestion Should Prefer Provisional Startup Rows

The ingestion path should avoid making a startup-only hook a permanent visible session immediately. Acceptable approaches:

- create a provisional session state or metadata flag and hide it until activity arrives;
- create a raw hook alias row for source traceability without exposing it as a session;
- create the session but mark it as `hidden_reason = startup-only` or equivalent metadata until promoted.

When a later event with the same session id or run id provides activity or token evidence, the monitor should promote or merge the row into the visible logical session.

### Run ID Canonicalization Still Wins For CCSM Runs

When `data.run_id` is present, startup-only child hooks should attach to the canonical logical run session or remain hidden as aliases. They should not produce visible siblings under the same run id.

If the first event for a run id is startup-only, the monitor may create a provisional canonical placeholder, but later richer activity must determine the visible logical session.

### Workflow Unknown Means Missing Model On Real Activity

Workflow model attribution should use the existing best-known model rule for sessions that survive the meaningful-session filter. Unknown model rows are acceptable only when the session has real activity but no concrete model evidence.

Empty startup shells should not be included in `complexity`, model delegation denominators, session totals, or other Workflow widgets unless a diagnostic mode explicitly asks for them.

### Workflow Must Share One Meaningful-Session Scope

Default Workflow analytics should use the same conservative startup-noise classification as default Sessions. The implementation should avoid section-specific approximations that count or exclude different sessions.

The preferred design is a shared Workflow helper that:

- accepts the current `statusFilter` and `workspaceRoot`;
- returns the session ids that pass the shared startup-noise classifier;
- preserves zero-event degenerate sessions as visible, matching `isStartupOnlyNoiseSession()`;
- preserves short real sessions with non-default startup summaries, content fields, non-startup source, unparsable event data, token usage, or non-empty transcript evidence;
- can be reused by model delegation, stats, orchestration, patterns, compaction, and any session-count denominator touched by this change.

If performance becomes a concern, the helper may first fetch scoped session candidates with SQL and then apply `isStartupOnlyNoiseSession()` in JavaScript. This is acceptable for the current Workflow scale because the endpoint already performs multiple aggregate queries and complexity is limited to bounded result sets. A future persistent materialized hidden flag is out of scope unless tests prove the read-time helper is too slow.

### Historical Rows Should Be Reclassified, Not Guessed

Existing startup-only abandoned rows can be hidden or marked as noise through a narrow maintenance step. The fix should not assign guessed model names. Historical rows with real activity and missing models should remain visible and unknown until better evidence exists.

## Risks / Trade-offs

- Some very short real sessions might only have `SessionStart` before the process exits. The conservative rule should hide them only when they have no token, no terminal event, no output, and no transcript evidence.
- Filtering only in the UI would leave API counts polluted. The filter should live server-side and be shared by Sessions and Workflow.
- Deleting historical rows would remove diagnostics. Reclassification or opt-in diagnostics is safer.
- If the filter is too broad, legitimate error sessions could disappear. Error, stop, API error, notification, or transcript evidence must promote a session to visible.

## Execution Handoff Contract

**Execution goal:** Implement server-side startup-only session filtering and ingestion classification so monitor Sessions and Workflow views no longer show empty unknown/abandoned Claude startup shells as normal sessions.

### Implementation Packets

#### Packet A: Visibility Classifier And Default API Filtering

**Goal:** Stop the user-facing pollution first by adding a conservative startup-only classifier and applying it to default Sessions and Workflow responses.

**Scope:**

- Add focused failing server tests for startup-only `SessionStart` rows.
- Introduce a shared server helper that identifies startup-only noise from persisted session/event/token evidence.
- Apply the helper to default `GET /api/sessions`.
- Apply the helper to default `GET /api/workflows`, at minimum `complexity` and any session-count denominator touched by the tests.
- Add `includeNoise=true` support on `GET /api/sessions` so diagnostic callers can see hidden rows with a clear marker.
- Do not change hook ingestion semantics in this packet except where a helper must be exported or reused.

**Allowed paths for Packet A:**

- `claude-monitor/server/routes/sessions.js`
- `claude-monitor/server/routes/workflows.js`
- `claude-monitor/server/lib/**` for the classifier helper
- `claude-monitor/server/__tests__/**`
- `openspec/changes/filter-monitor-startup-noise-sessions/tasks.md`

**Required checks for Packet A:**

- Focused server test proving startup-only rows are hidden from default Sessions.
- Focused server test proving `includeNoise=true` returns startup-only rows with a marker.
- Focused server test proving startup-only rows are hidden from Workflow complexity/counts.
- Focused server test proving a real session with non-start activity remains visible.
- `openspec validate filter-monitor-startup-noise-sessions --strict`.

#### Packet B: Agent Teams Startup Child Ingestion

**Goal:** Prevent future Agent Teams startup child hooks from creating visible sibling sessions for the same CCSM `run_id`.

**Scope:**

- Add failing hook-ingestion tests for multiple raw Claude `session_id` values sharing one non-empty `run_id`, where child rows are startup-only and one row later receives real activity.
- Reuse the Packet A classifier or add a narrow ingestion-time hidden/provisional marker.
- Keep startup-only child rows hidden or aliased until activity arrives.
- Ensure later real activity promotes/converges to one visible logical session for the run.
- Preserve raw `source_session_id`, `run_id`, hook source, and transcript path metadata.
- Preserve no-`run_id` behavior for normal Claude sessions.

**Allowed paths for Packet B:**

- `claude-monitor/server/db.js` only if a persistent hidden/provisional marker or alias index is required
- `claude-monitor/server/routes/hooks.js`
- `claude-monitor/server/routes/sessions.js`
- `claude-monitor/server/lib/**`
- `claude-monitor/server/__tests__/**`
- `openspec/changes/filter-monitor-startup-noise-sessions/tasks.md`

**Required checks for Packet B:**

- Focused server test proving startup-only child hooks with the same `run_id` do not create multiple visible sessions.
- Focused server test proving later main activity makes one logical run session visible.
- Focused server test proving raw source session ids remain traceable.
- Focused server test proving no-`run_id` real sessions remain compatible.
- `openspec validate filter-monitor-startup-noise-sessions --strict`.

#### Packet C: Historical Runtime Reclassification

**Goal:** Handle existing startup-only abandoned rows without deleting monitor history or guessing models.

**Scope:**

- Add a safe server-side reclassification/read-time compatibility path for existing startup-only rows.
- Prefer read-time classification unless a small metadata backfill is required for performance or diagnostics.
- If a maintenance endpoint or cleanup option is added, make it opt-in and non-destructive by default.
- Do not delete runtime database rows by default.
- Do not assign model labels to no-evidence rows.

**Allowed paths for Packet C:**

- `claude-monitor/server/db.js`
- `claude-monitor/server/routes/settings.js` only if an explicit cleanup/reclassification action is added
- `claude-monitor/server/lib/**`
- `claude-monitor/server/__tests__/**`
- `openspec/changes/filter-monitor-startup-noise-sessions/tasks.md`

**Required checks for Packet C:**

- Focused server test proving pre-existing abandoned startup-only rows are hidden from default views.
- Focused server test proving diagnostic mode can still expose or count reclassified historical rows.
- Focused server test proving no rows are deleted or model-guessed by default.
- `openspec validate filter-monitor-startup-noise-sessions --strict`.

#### Packet D: Final Acceptance And Regression Sweep

**Goal:** Verify the whole monitor behavior against the spec and close the change.

**Scope:**

- Run the combined server verification after Packets A-C land.
- Confirm Workflow unknown rows represent visible sessions with activity and missing evidence, not startup-only shells.
- Confirm real Agent Teams sessions with token usage still show best-known concrete models.
- Update tasks with exact commands and outcomes.

**Allowed paths for Packet D:**

- `openspec/changes/filter-monitor-startup-noise-sessions/tasks.md`
- test-only corrections under `claude-monitor/server/__tests__/**` if a regression test needs a narrow fix
- production paths only for a narrow bug revealed by acceptance tests

**Required checks for Packet D:**

- `node --test claude-monitor/server/__tests__/api.test.js` or explicitly documented focused replacement suites.
- Focused tests from Packets A-C.
- `openspec validate filter-monitor-startup-noise-sessions --strict`.

#### Packet E: Workflow Denominator Rework

**Goal:** Fix the acceptance-review gaps so all default Workflow analytics use the same meaningful-session scope as default Sessions.

**Scope:**

- Add tests that reproduce startup-only shell pollution in `modelDelegation.mainModels` and `modelDelegation.subagentModels`.
- Add tests that prove startup-only shells do not affect Workflow session-count denominators or percentages in sections such as orchestration, patterns, and compaction.
- Add tests that prove a short real session preserved by the shared classifier is counted consistently by stats and complexity.
- Introduce a shared Workflow helper for scoped meaningful session ids, or an equivalent central scope builder, based on `isStartupOnlyNoiseSession()`.
- Replace section-local raw session denominators with the shared meaningful-session scope where those denominators describe default user-facing Workflow analytics.
- Align `stats.totalSessions` with the shared classifier instead of the simplified SQL approximation.
- Preserve existing status and workspace filtering semantics.

**Bounded implementation packet:**

- Work only in the Workflow server layer and tests. Do not modify hook ingestion, Sessions default filtering, database schema, client UI, or historical data.
- Add failing tests first under the existing Workflow/noise API test area. The tests should create deterministic startup-only rows with main/subagent agents and deterministic real sessions in a scoped workspace.
- Add a Workflow-local helper in `claude-monitor/server/routes/workflows.js`, such as `getMeaningfulWorkflowSessionIds(statusFilter, workspaceRoot)`, that:
  - fetches sessions already scoped by status and workspace;
  - applies `isStartupOnlyNoiseSession(db, id)`;
  - returns ids and any small utilities needed for `IN (...)` SQL filters;
  - keeps behavior deterministic when the id list is empty.
- Use that helper in these functions at minimum:
  - `getWorkflowStats()` for `totalSessions` and any averages derived from the session denominator;
  - `getOrchestrationData()` for `sessionCount`;
  - `getWorkflowPatterns()` for `totalSessions`, `soloCount`, and pattern percentages;
  - `getModelDelegation()` for `mainModels` and `subagentModels`;
  - `getCompactionImpact()` for `totalSessions`.
- Keep status and workspace filtering equivalent to existing behavior. The helper should be composed with the current filters rather than bypassing them.
- Keep existing tests for project scoping, workflow status filtering, run-id correlation, model attribution, and startup-noise filtering passing.

**Allowed paths for Packet E:**

- `claude-monitor/server/routes/workflows.js`
- `claude-monitor/server/lib/**`
- `claude-monitor/server/__tests__/**`
- `openspec/changes/filter-monitor-startup-noise-sessions/**`

**Protected paths for Packet E:**

- Do not change Claude hook ingestion protocol.
- Do not guess models for no-evidence sessions.
- Do not delete historical monitor rows.
- Do not change default Sessions filtering unless a Workflow test exposes an inconsistency requiring a shared helper export.

**Required checks for Packet E:**

- Focused server test proving startup-only main-agent rows do not appear as `unknown` in Workflow model delegation.
- Focused server test proving startup-only subagent rows do not pollute subagent model delegation.
- Focused server test proving Workflow session-count denominators exclude startup-only shells.
- Focused server test proving short real sessions preserved by the classifier are counted consistently.
- `node --test claude-monitor/server/__tests__/api.test.js`
- `node --test claude-monitor/server/__tests__/session-noise.test.js`
- `pnpm typecheck`
- `openspec validate filter-monitor-startup-noise-sessions --strict`
- `git diff --check`

#### Packet F: Workflow Scope Closure Rework

**Goal:** Close the final Packet E acceptance gaps by applying the meaningful-session scope to Workflow pattern numerators and stats average duration, and by tightening tests so they prove exclusion exactly.

**Scope:**

- Keep the existing `getMeaningfulWorkflowSessionIds(statusFilter, workspaceRoot)` helper or an equivalent helper.
- Filter `getWorkflowPatterns()` sequence queries to meaningful session ids before building pattern counts.
- Keep deterministic empty-list behavior when there are no meaningful sessions.
- Filter `getWorkflowStats()` average-duration source rows to meaningful session ids.
- Replace weak `>= 1` Packet E assertions with exact scoped assertions where practical, especially for patterns, orchestration, compaction, and stats duration.
- Preserve status and workspace filtering semantics.

**Bounded implementation packet:**

- Do not introduce new product behavior. This is a closure rework for two known Workflow scope leaks.
- First tighten tests in `claude-monitor/server/__tests__/session-noise.test.js`:
  - create a noise session with two subagent rows that would form a unique pattern if counted;
  - create real sessions whose expected pattern/solo/orchestration/compaction counts are known exactly inside a scoped workspace;
  - create one short real ended session and one startup-only ended shell with a much longer duration, then assert `stats.avgDurationSec` reflects only the real session;
  - replace previous `>= 1` assertions with exact values where the fixture controls the workspace.
- Then update `claude-monitor/server/routes/workflows.js`:
  - use meaningful ids as an `IN (...)` filter for both workspace and non-workspace `getWorkflowPatterns()` sequence queries;
  - if there are no meaningful ids, return empty patterns and zero solo metrics without querying raw sessions;
  - use meaningful ids as an `IN (...)` filter for `getWorkflowStats()` average-duration rows;
  - keep the existing helper and existing status/workspace filter behavior.
- Do not touch hook ingestion, Sessions route, DB schema, client UI, pricing, model attribution logic, or unrelated Workflow sections.

**Allowed paths for Packet F:**

- `claude-monitor/server/routes/workflows.js`
- `claude-monitor/server/__tests__/session-noise.test.js`
- `claude-monitor/server/__tests__/api.test.js` only if an existing project-scope regression needs a narrow update
- `openspec/changes/filter-monitor-startup-noise-sessions/tasks.md`

**Protected paths for Packet F:**

- Do not change hook ingestion.
- Do not change Sessions filtering.
- Do not change database schema.
- Do not change client UI.
- Do not guess models for no-evidence sessions.
- Do not delete historical monitor rows.

**Required checks for Packet F:**

- Focused server test proving startup-only subagent rows cannot create Workflow pattern counts.
- Focused server test proving `stats.avgDurationSec` ignores startup-only ended shells.
- Focused server tests with exact assertions proving orchestration, patterns, and compaction denominators exclude startup-only shells.
- `node --test claude-monitor/server/__tests__/session-noise.test.js`
- `node --test claude-monitor/server/__tests__/api.test.js`
- `pnpm typecheck`
- `openspec validate filter-monitor-startup-noise-sessions --strict`
- `git diff --check`

**Allowed paths:**

- `claude-monitor/server/db.js`
- `claude-monitor/server/routes/hooks.js`
- `claude-monitor/server/routes/sessions.js`
- `claude-monitor/server/routes/workflows.js`
- `claude-monitor/server/lib/**` for a shared session visibility/noise helper
- `claude-monitor/server/__tests__/**`
- `claude-monitor/client/src/pages/Sessions.tsx` only if a diagnostic toggle is added
- `claude-monitor/client/src/components/workflows/**` only if UI labels need to reflect diagnostic mode
- `openspec/changes/filter-monitor-startup-noise-sessions/**`

**Protected paths:**

- Do not change Claude Agent Teams protocol behavior.
- Do not guess models for no-evidence sessions.
- Do not make monitor ingestion depend on OpenSpec availability.
- Do not remove raw hook traceability.
- Do not edit archived OpenSpec changes.
- Do not fix unrelated review findings from `enhance-monitor-project-selection-shutdown` inside this change unless they directly block the startup-noise behavior.

**Required verification:**

- Server test proving startup-only abandoned rows are excluded from default `GET /api/sessions`.
- Server test proving `includeNoise=true` or the chosen diagnostic path can expose startup-only rows with a clear marker.
- Server test proving default `GET /api/workflows` excludes startup-only rows from complexity and counts.
- Server test proving real Agent Teams sessions with token usage still show their best-known model.
- Server test proving no-`run_id` real sessions are still visible once they receive non-start activity.
- Server test proving startup-only child hooks sharing a `run_id` do not create multiple visible logical sessions.
- `node --test claude-monitor/server/__tests__/api.test.js` or the focused replacement suites if the server tests remain split.
- `openspec validate filter-monitor-startup-noise-sessions --strict`.

**Rework triggers:**

- Default Sessions still shows startup-only rows with only `SessionStart`, no token usage, and no non-start activity.
- Default Workflow complexity or counts still include startup-only zero-token rows.
- `includeNoise=true` or the chosen diagnostic path cannot expose hidden startup-only rows for debugging.
- A real session with tool activity, terminal/error evidence, token usage, output, or transcript evidence is hidden as noise.
- Startup-only child hooks with the same `run_id` still appear as multiple visible logical sessions.
- Raw Claude source `session_id` or transcript path traceability is lost.
- Any implementation guesses a model for no-evidence rows.
- Any implementation deletes historical monitor rows by default.
- Workflow model delegation still counts startup-only shells as `unknown`.
- Workflow session-count denominators or percentages still use raw startup-only sessions.
- Workflow stats and complexity disagree for sessions preserved by the shared classifier.
- Workflow pattern counts still include startup-only shell agent sequences.
- Workflow stats duration averages still use startup-only ended shells.
- Packet E/F tests only prove real rows exist instead of proving startup-only rows are excluded.
