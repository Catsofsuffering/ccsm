# monitor-session-noise-filtering Specification

## Purpose
TBD - created by archiving change filter-monitor-startup-noise-sessions. Update Purpose after archive.
## Requirements
### Requirement: Startup-only Claude hook sessions SHALL be hidden from default user views
The monitor SHALL distinguish startup-only Claude hook shells from sessions with real work activity and SHALL exclude startup-only shells from default user-facing session lists and Workflow analytics.

#### Scenario: Startup-only abandoned session is hidden from Sessions
- **WHEN** a session has only startup `SessionStart` lifecycle evidence
- **AND** it has no token usage
- **AND** it has no non-start activity events
- **AND** it has no usable transcript content
- **THEN** `GET /api/sessions` SHALL NOT include that session by default

#### Scenario: Startup-only abandoned session is hidden from Workflow
- **WHEN** a startup-only session would otherwise appear as an unknown zero-token session
- **THEN** `GET /api/workflows` SHALL exclude it from session complexity
- **AND** Workflow session totals and model attribution denominators SHALL NOT count it as a normal work session

#### Scenario: Workflow model delegation excludes startup-only shells
- **WHEN** a startup-only shell has an auto-created main agent or subagent row
- **AND** it has no token usage
- **AND** it has no real activity evidence
- **THEN** `GET /api/workflows` model delegation SHALL NOT count that shell under `unknown`
- **AND** it SHALL NOT count the shell in model delegation session denominators

#### Scenario: Workflow session denominators match default visibility
- **WHEN** a startup-only shell is hidden from default `GET /api/sessions`
- **THEN** default Workflow session-count denominators and percentages SHALL exclude it
- **AND** orchestration, workflow-pattern, compaction, and other default Workflow sections SHALL NOT use it as a normal work-session denominator

#### Scenario: Workflow stats preserve classifier-visible short sessions
- **WHEN** a short session has only `SessionStart`
- **AND** the shared classifier preserves it because of content evidence, non-default summary, non-startup source, unparsable event data, token usage, or usable transcript evidence
- **THEN** Workflow stats and Workflow complexity SHALL both treat that session as visible
- **AND** `stats.totalSessions` SHALL NOT use a looser or stricter approximation than the shared classifier

#### Scenario: Diagnostic mode can expose startup-only shells
- **WHEN** a caller explicitly requests diagnostic/noise rows
- **THEN** the monitor MAY return startup-only shells
- **AND** each returned startup-only shell SHALL be clearly marked as diagnostic or hidden/noise data
- **AND** raw `session_id`, `run_id`, hook source, and transcript path metadata SHALL remain available when stored

### Requirement: Real sessions SHALL be promoted or remain visible once activity appears
The monitor SHALL NOT hide a session that has evidence of real work, output, errors, terminal lifecycle, token usage, or usable transcript content.

#### Scenario: Session receives tool activity after startup
- **WHEN** a session first receives `SessionStart`
- **AND** later receives `PreToolUse`, `PostToolUse`, `Notification`, `TeamReturn`, `SubagentStop`, `Stop`, `SessionEnd`, `APIError`, `Compaction`, `TurnDuration`, or another non-start activity event
- **THEN** the session SHALL be visible in default monitor views

#### Scenario: Session receives transcript token usage
- **WHEN** transcript extraction stores one or more `token_usage` rows for a session
- **THEN** that session SHALL be treated as a real visible session
- **AND** Workflow SHALL use the best-known model rule for its model label

#### Scenario: Real short error session is preserved
- **WHEN** a short session has error, stop, notification, output, or terminal evidence
- **THEN** the monitor SHALL NOT classify it as startup-only noise solely because it has few events

### Requirement: Agent Teams startup child hooks SHALL NOT create visible sibling sessions
For CCSM-launched runs with a non-empty `run_id`, startup-only child hooks SHALL attach to the logical run session or remain hidden as aliases instead of appearing as separate visible sessions.

#### Scenario: Multiple startup children share a run id
- **WHEN** multiple `SessionStart` hooks have different raw Claude `data.session_id` values
- **AND** they share the same non-empty `data.run_id`
- **AND** those raw sessions have no activity beyond startup evidence
- **THEN** default session lists SHALL NOT show each raw startup child as a separate session

#### Scenario: Main run activity appears after startup child hooks
- **WHEN** startup-only child hooks arrive before richer main-session activity for the same `run_id`
- **THEN** the monitor SHALL converge on one visible logical run session after activity arrives
- **AND** startup-only child rows SHALL remain hidden or aliased
- **AND** raw source session ids SHALL remain traceable for diagnostics

### Requirement: Unknown model SHALL mean missing evidence on visible work sessions
Workflow SHALL only report an unknown model for visible sessions that have real activity but no concrete model evidence.

#### Scenario: Token model exists
- **WHEN** a visible session has a concrete `token_usage.model`
- **THEN** Workflow SHALL display the best-known concrete model
- **AND** it SHALL NOT display `unknown` for that session

#### Scenario: No model evidence exists on real activity
- **WHEN** a visible real session has activity but no concrete model evidence
- **THEN** Workflow MAY display `unknown`
- **AND** the monitor SHALL NOT guess a model
