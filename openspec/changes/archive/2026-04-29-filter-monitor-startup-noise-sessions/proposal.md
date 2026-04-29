## Why

Live monitor inspection on 2026-04-28 showed that the Workflow page's "All Sessions" table still contains many sessions with `model` rendered as `unknown` and no useful content. The Sessions page also shows many `abandoned` sessions even when the user only has one visible Claude Agent Teams execution in progress.

The database evidence points to startup-only Claude hook rows rather than real execution sessions:

- `/api/workflows?status=all` returned 149 session complexity rows, with 99 rows lacking a concrete model.
- All 99 unknown Workflow rows had zero tokens.
- The runtime database contained 84 abandoned sessions; 82 of them were pure startup shells with exactly one `SessionStart` event, no `token_usage`, and no non-start events.
- Several abandoned startup shells shared the same `run_id` as a real completed Agent Teams run, while their transcript files did not exist.
- Real Agent Teams sessions with tool events and transcript token usage did have concrete token models, for example `MiniMax-M2.7-highspeed`.

This means the dominant issue is not the model parser. The monitor currently creates a visible session for every Claude `SessionStart`, including child/startup probes emitted by Claude Agent Teams or Claude child processes. These startup shells later become `abandoned` through stale-session cleanup, then pollute Workflow and Sessions views as unknown, empty sessions.

## What Changes

- Add a monitor concept of "startup-only noise" for sessions that contain only a startup `SessionStart`, have no token usage, have no non-start events, and have no usable transcript content.
- Exclude startup-only noise sessions from default Sessions and Workflow surfaces.
- Keep startup-only rows available for diagnostics through an explicit opt-in query or metadata flag.
- Prevent future startup-only Agent Teams child hooks from becoming permanent visible sessions when they only represent a Claude startup probe.
- Ensure Workflow "unknown model" counts reflect sessions with real activity and missing model evidence, not empty startup shells.
- Preserve raw Claude `session_id`, `run_id`, transcript path, and hook source metadata for debugging.
- Provide a safe historical cleanup or reclassification path for existing startup-only abandoned rows.

## Investigation Notes

- Hook ingestion calls `ensureSession()` before it knows whether a `SessionStart` will ever produce real activity.
- The `SessionStart` branch inserts an event and the stale-session cleanup marks inactive startup shells as `abandoned` after later starts.
- `GET /api/sessions` filters canonical duplicate `run_id` rows but still includes startup-only rows without a `run_id`, and can still expose already-created startup shells.
- `getSessionComplexity()` in Workflow reads directly from `sessions` and does not exclude no-activity startup shells.
- `getBestKnownModelForSession()` can resolve concrete models from `token_usage`, and live data confirms real sessions are resolvable when they have transcript-derived token rows.

## 2026-04-29 Acceptance Review Findings

Codex acceptance review found that the initial implementation solved default Sessions visibility, diagnostic inclusion, run-id child convergence, historical read-time hiding, and Workflow complexity. The change is not yet archive-ready because Workflow still has incomplete denominator coverage.

- `getModelDelegation()` still selects every main/subagent row and maps sessions with no best-known model to `unknown`, so startup-only shells with auto-created main agents can still inflate Workflow model delegation.
- Several Workflow sections still use raw `COUNT(*) FROM sessions` denominators, including orchestration, patterns, and compaction. These can disagree with the default visible session set.
- `stats.totalSessions` uses simplified SQL that is not equivalent to the shared conservative classifier. It can exclude short real sessions that the shared classifier would preserve because of content evidence, transcript evidence, non-default summary, non-startup source, or unparsable event data.

The rework must make Workflow use one consistent "meaningful session" scope for default analytics. A startup-only shell hidden from default Sessions must not contribute to Workflow model attribution, session totals, percentages, or other session-count denominators. A real short session preserved by the classifier must remain counted consistently across Workflow sections.

## 2026-04-29 Packet E Acceptance Review Findings

Packet E added a Workflow meaningful-session helper and applied it to several default Workflow denominators. Codex verification passed the automated checks, but manual acceptance review found two remaining gaps:

- `getWorkflowPatterns()` uses meaningful sessions for `totalSessions` and solo-session denominator, but the pattern query still builds pattern numerators from raw scoped agent sequences. A startup-only shell with subagent rows can still contribute pattern counts while the denominator excludes it.
- `getWorkflowStats()` uses meaningful sessions for `stats.totalSessions`, but `avgDurationSec` is still computed from raw ended sessions. Startup-only abandoned shells with `ended_at` can still skew the average duration.

The new rework must keep the Packet E helper, but ensure every numerator and denominator touched by this change uses the same meaningful-session scope. Tests must use exact assertions rather than `>= 1` checks, so they prove startup-only rows are excluded rather than merely proving real rows exist.

## Capabilities

### New Capabilities

- `monitor-session-noise-filtering`: The monitor distinguishes real work sessions from Claude startup-only shells and hides startup-only noise from default user-facing views.

### Modified Capabilities

- `monitor-session-correlation`: Startup-only child hooks that share a CCSM `run_id` must not create extra visible logical sessions.
- `workflow-model-attribution`: Workflow unknown-model output must be based on sessions with observable activity, not empty startup probes.

## Impact

- Monitor hook ingestion and session creation logic.
- Session list API filtering and optional diagnostic query behavior.
- Workflow aggregation queries, especially session complexity and any count that uses sessions as the denominator.
- Runtime database classification for historical startup-only abandoned sessions.
- Server tests for Agent Teams startup-only hook sequences, no-`run_id` startup shells, model attribution, and Workflow/Sessions default visibility.
