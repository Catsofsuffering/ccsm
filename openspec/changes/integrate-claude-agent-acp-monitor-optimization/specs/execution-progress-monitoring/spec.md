## MODIFIED Requirements

### Requirement: Runtime events SHALL normalize into the monitor execution model
The maintained workflow SHALL collect execution progress from Claude hook events and optional runtime adapter events, then normalize supported events into the same monitor session, agent, event, token/model, and output model.

#### Scenario: Claude hook activity is emitted
- **WHEN** Claude Code emits session, tool-use, Agent Teams, or subagent lifecycle hook events
- **THEN** the monitoring system SHALL update the corresponding session, agent, activity, token, and output records as before

#### Scenario: ACP runtime activity is observed
- **WHEN** an optional ACP adapter provides supported session, lifecycle, tool/action, output, or model metadata
- **THEN** the monitor SHALL normalize the activity into the existing session, agent, event, and output APIs
- **AND** it SHALL preserve ACP source metadata in the stored event data

#### Scenario: Unsupported ACP payload is observed
- **WHEN** ACP runtime data does not match a supported normalized shape
- **THEN** the monitor SHALL retain safe diagnostic metadata where practical
- **AND** it SHALL NOT corrupt hook-driven session state

### Requirement: Duplicate runtime observations SHALL be suppressed
The monitor SHALL avoid presenting duplicate user-facing sessions or output entries when the same execution is observed through more than one runtime source.

#### Scenario: Hook and ACP data describe the same run
- **WHEN** hook and ACP events carry the same run id, session id, transcript path, or equivalent correlation metadata
- **THEN** the monitor SHALL associate them with one monitor session where practical
- **AND** event data SHALL record each source without duplicating equivalent output entries

#### Scenario: Correlation is unavailable
- **WHEN** two runtime sources cannot be confidently correlated
- **THEN** the monitor SHALL keep source metadata explicit
- **AND** it SHALL avoid destructive merging or guessed identity

### Requirement: Existing hook-driven monitoring SHALL remain compatible
Adding optional runtime adapter events SHALL preserve existing hook-driven monitoring behavior.

#### Scenario: Non-ACP Claude session emits hooks
- **WHEN** a normal Claude or Agent Teams session emits hook events
- **THEN** the monitor SHALL continue to create sessions, update agents, persist events, extract token usage, expose outputs, and broadcast live updates as before

#### Scenario: ACP is absent
- **WHEN** no ACP adapter is installed or configured
- **THEN** execution progress monitoring SHALL continue through Claude hooks without degraded default behavior
