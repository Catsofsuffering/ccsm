## ADDED Requirements

### Requirement: The monitor SHALL discover Claude Agent Teams sessions for the launch workspace
The monitoring system SHALL register or reactivate Claude Agent Teams sessions from Claude hook events and associate them with the workspace where `ccsm monitor` was launched or rebound.

#### Scenario: Agent Teams session emits hook events
- **WHEN** Claude Agent Teams execution emits a hook event with a valid `session_id` and project `cwd`
- **THEN** the monitor SHALL create or update the corresponding session record
- **AND** the session SHALL be visible in the monitor for the matching workspace

#### Scenario: Monitor is already running for another workspace
- **WHEN** the user runs `ccsm monitor` from a different OpenSpec workspace while the monitor is healthy
- **THEN** the monitor SHALL update its workspace root to the current OpenSpec workspace
- **AND** subsequent board and session views SHALL reflect that workspace context

### Requirement: Team-agent return updates SHALL be visible in real time
The monitoring system SHALL persist and broadcast team-agent return or mailbox-style updates as soon as they are observed through hook events or transcript-derived output.

#### Scenario: Team agent sends a return message
- **WHEN** a Claude Agent Teams worker emits a return, mailbox, or `SendMessage`-style update
- **THEN** the monitor SHALL store an event associated with the correct session and best-known agent
- **AND** the monitor SHALL broadcast the update over the existing WebSocket channel without waiting for session completion

#### Scenario: Structured Agent Teams tool output is observed
- **WHEN** a Claude hook event contains structured `TeamCreate`, `TaskCreate`, `TaskUpdate`, `SendMessage`, or teammate mailbox payload data
- **THEN** the monitor SHALL parse the structured payload instead of relying only on notification text matching
- **AND** any teammate `summary` or `message` content SHALL be persisted as realtime output for the session
- **AND** the Workflow Live Reader output endpoint SHALL expose that content before `SubagentStop` or `SessionEnd`

#### Scenario: Structured Agent Teams lifecycle event has no teammate output
- **WHEN** a Claude hook event contains `TeamCreate`, `TaskCreate`, or `TaskUpdate` payload data without teammate message text
- **THEN** the monitor MAY record normal lifecycle activity
- **BUT** it SHALL NOT create a fake teammate return output

#### Scenario: Structured teammate output is later observed through a fallback source
- **WHEN** the same teammate message is first observed through structured `SendMessage` or mailbox payload data
- **AND** the same text later appears through `SubagentStop`, `Notification`, or transcript-derived output
- **THEN** the monitor SHALL avoid duplicate visible output entries for the same session and best-known agent

#### Scenario: Subagent completes with final output
- **WHEN** a `SubagentStop` or transcript-derived event includes final teammate output
- **THEN** the monitor SHALL update the relevant agent status and output summary
- **AND** connected monitor clients SHALL receive a live update for the changed event or agent

#### Scenario: Duplicate return signals are observed
- **WHEN** the same teammate return is observed through both hook payload and transcript processing
- **THEN** the monitor SHALL avoid presenting duplicate live return entries for the same session and agent

### Requirement: Existing monitor behavior SHALL remain compatible
The Agent Teams monitoring changes SHALL preserve existing hook-driven sessions, main-agent events, token usage extraction, and live UI refresh behavior.

#### Scenario: Non-Agent Teams Claude session emits hooks
- **WHEN** a normal Claude session emits session, tool-use, notification, or terminal events
- **THEN** the monitor SHALL continue to create sessions, update agents, persist events, and broadcast live updates as before

#### Scenario: OpenSpec state cannot be loaded
- **WHEN** the monitor cannot read OpenSpec state for the current workspace
- **THEN** OpenSpec board views SHALL fail read-only with an explanatory state
- **AND** session and event monitoring SHALL remain usable
