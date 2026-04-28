## 1. Reproduction Fixtures

- [ ] Add focused server fixtures/tests that reproduce the observed shape: startup-only `SessionStart`, missing/no-usage transcript, zero tokens, and later abandoned status.
- [ ] Add a fixture where one real Agent Teams run shares a `run_id` with multiple startup-only child `SessionStart` rows.
- [ ] Add a fixture where a short real session receives non-start activity and must remain visible.

## 2. Shared Visibility Classification

- [ ] Implement a shared server helper that classifies sessions as startup-only noise using event, token, transcript, and hook-source evidence.
- [ ] Keep the helper conservative so error, stop, notification, output, token, or transcript evidence promotes a session to visible.
- [ ] Preserve raw Claude session metadata for diagnostic use.

## 3. Ingestion Behavior

- [ ] Update hook ingestion so startup-only `SessionStart` rows are provisional, hidden, or alias-only until activity arrives.
- [ ] Ensure `run_id` canonicalization treats startup-only child hooks as aliases or hidden noise rather than visible sibling sessions.
- [ ] Promote provisional/hidden sessions when later events or token usage prove real activity.
- [ ] Preserve existing behavior for hook events without `run_id` once they show real activity.

## 4. API Filtering

- [ ] Exclude startup-only noise from default `GET /api/sessions`.
- [ ] Add an explicit diagnostic opt-in, such as `includeNoise=true`, or a dedicated diagnostic endpoint.
- [ ] Mark diagnostic startup-only rows clearly in API responses when they are included.
- [ ] Exclude startup-only noise from default `GET /api/workflows` aggregates, including complexity and session-count denominators.

## 5. Historical Runtime Data

- [ ] Add a narrow reclassification or cleanup path for existing startup-only abandoned rows.
- [ ] Do not delete historical rows by default unless the user explicitly runs a destructive cleanup.
- [ ] Do not assign guessed models to historical no-evidence rows.

## 6. Verification

- [ ] Run focused server tests proving startup-only rows are hidden from default Sessions.
- [ ] Run focused server tests proving diagnostic mode exposes startup-only rows with clear markers.
- [ ] Run focused server tests proving startup-only rows are hidden from Workflow complexity and counts.
- [ ] Run focused server tests proving real Agent Teams sessions with token usage display their best-known model.
- [ ] Run focused server tests proving no-`run_id` real sessions remain visible after non-start activity.
- [ ] Run focused server tests proving startup-only child hooks with the same `run_id` do not create multiple visible logical sessions.
- [ ] Run `node --test claude-monitor/server/__tests__/api.test.js` or the focused server suites that replace it.
- [ ] Run `openspec validate filter-monitor-startup-noise-sessions --strict`.
