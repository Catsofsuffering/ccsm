## ADDED Requirements

### Requirement: Status-driven Claude exec SHALL provide a persisted return-packet fallback

When status-driven monitoring is active, `ccsm claude exec` SHALL provision a CCSM-managed persisted return-packet artifact keyed by the correlated run identifier so Codex can recover final implementation evidence when monitor outputs are unavailable or incomplete.

#### Scenario: Status-driven run starts

- **WHEN** `ccsm claude exec` starts a status-driven run
- **THEN** the launcher SHALL create or reserve a CCSM-managed return-packet path scoped to that run identifier
- **AND** it SHALL pass that path into the Claude execution environment or prompt context for final packet persistence

#### Scenario: Monitor outputs are missing or incomplete

- **WHEN** the correlated run reaches terminal state but monitor `outputs` do not contain a usable Execution Return Packet
- **THEN** the CLI SHALL read the persisted return-packet artifact for that run if available
- **AND** it SHALL expose that artifact to the caller as fallback execution evidence

#### Scenario: No usable outputs exist

- **WHEN** neither monitor `outputs` nor the persisted return-packet artifact yields usable final evidence
- **THEN** the CLI SHALL report the run as incomplete, blocked, or failed according to the terminal context
- **AND** it SHALL NOT infer success from raw terminal text alone
