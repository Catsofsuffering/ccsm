# monitor-session-correlation Specification

## Purpose
TBD - created by archiving change enhance-monitor-project-selection-shutdown. Update Purpose after archive.
## Requirements
### Requirement: CCSM-launched Agent Teams runs SHALL have one visible monitor session
The monitor SHALL represent one CCSM-launched Claude Agent Teams run as one logical monitor session when hook events share the same non-empty `run_id`.

#### Scenario: Multiple Claude session ids share one run id
- **WHEN** hook events arrive with different `data.session_id` values
- **AND** those hook events share the same non-empty `data.run_id`
- **THEN** project-scoped and global session lists SHALL show one logical monitor session for that run
- **AND** the monitor SHALL NOT create a new visible session for each raw Claude session id

#### Scenario: Source session ids need to remain traceable
- **WHEN** hook events are normalized into a logical run session
- **THEN** each event SHALL retain the original Claude `data.session_id` as source metadata
- **AND** diagnostics or detail views MAY expose the source session id without treating it as a separate visible run session

#### Scenario: Agent Teams child startup hook arrives before main activity
- **WHEN** the first hook for a `run_id` is a child-looking `SessionStart` or startup-only event
- **AND** later hooks for the same `run_id` provide main-session activity, transcript evidence, tool events, or richer session metadata
- **THEN** the monitor SHALL converge on a stable canonical logical session for the run
- **AND** earlier child/startup events SHALL be associated with that logical session or hidden as aliases instead of remaining as separate visible sessions

### Requirement: Run-id lookup SHALL return the canonical logical session
Status-driven callers that poll sessions by `run_id` SHALL receive the logical session that represents the run.

#### Scenario: Status-driven exec waits for session creation
- **WHEN** `ccsm claude exec --status-driven` polls `GET /api/sessions?run_id=<id>`
- **AND** multiple raw Claude session ids have been observed for the same run
- **THEN** the endpoint SHALL return the canonical logical session for that run
- **AND** it SHALL NOT return an arbitrary child/startup session

#### Scenario: Canonical session receives terminal state
- **WHEN** a terminal `SessionEnd`, error, or abandoned state is observed for the logical run
- **THEN** status-driven waiting SHALL resolve from the canonical logical session state
- **AND** child session aliases SHALL NOT keep the run falsely active

### Requirement: Existing non-CCSM Claude sessions SHALL keep session-id behavior
The monitor SHALL preserve existing behavior for hook events that do not include a CCSM `run_id`.

#### Scenario: Hook event has no run id
- **WHEN** a hook event does not include `data.run_id`
- **THEN** the monitor MAY continue to use `data.session_id` as the visible monitor session id
- **AND** existing non-Agent Teams hook behavior SHALL remain compatible
