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

### Historical Rows Should Be Reclassified, Not Guessed

Existing startup-only abandoned rows can be hidden or marked as noise through a narrow maintenance step. The fix should not assign guessed model names. Historical rows with real activity and missing models should remain visible and unknown until better evidence exists.

## Risks / Trade-offs

- Some very short real sessions might only have `SessionStart` before the process exits. The conservative rule should hide them only when they have no token, no terminal event, no output, and no transcript evidence.
- Filtering only in the UI would leave API counts polluted. The filter should live server-side and be shared by Sessions and Workflow.
- Deleting historical rows would remove diagnostics. Reclassification or opt-in diagnostics is safer.
- If the filter is too broad, legitimate error sessions could disappear. Error, stop, API error, notification, or transcript evidence must promote a session to visible.

## Execution Handoff Contract

**Execution goal:** Implement server-side startup-only session filtering and ingestion classification so monitor Sessions and Workflow views no longer show empty unknown/abandoned Claude startup shells as normal sessions.

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

**Required verification:**

- Server test proving startup-only abandoned rows are excluded from default `GET /api/sessions`.
- Server test proving `includeNoise=true` or the chosen diagnostic path can expose startup-only rows with a clear marker.
- Server test proving default `GET /api/workflows` excludes startup-only rows from complexity and counts.
- Server test proving real Agent Teams sessions with token usage still show their best-known model.
- Server test proving no-`run_id` real sessions are still visible once they receive non-start activity.
- Server test proving startup-only child hooks sharing a `run_id` do not create multiple visible logical sessions.
- `node --test claude-monitor/server/__tests__/api.test.js` or the focused replacement suites if the server tests remain split.
- `openspec validate filter-monitor-startup-noise-sessions --strict`.
