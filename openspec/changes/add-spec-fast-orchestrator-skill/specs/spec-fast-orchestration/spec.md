## ADDED Requirements

### Requirement: `spec-fast` SHALL orchestrate the maintained spec-driven lifecycle

The system SHALL provide a Codex-native `spec-fast` orchestration skill that can advance a user request through the maintained OpenSpec workflow without bypassing OpenSpec artifacts.

#### Scenario: User starts `spec-fast` with a fresh request

- **WHEN** a user gives a new feature request to `spec-fast`
- **THEN** Codex SHALL inspect current OpenSpec changes
- **AND** it SHALL create or select the active change before implementation begins
- **AND** it SHALL continue through the maintained planning and execution phases using OpenSpec as the source of truth

#### Scenario: User starts `spec-fast` for an in-progress change

- **WHEN** the selected change already has some completed artifacts
- **THEN** `spec-fast` SHALL resume from the first missing or pending phase instead of always restarting from the beginning
- **AND** it SHALL preserve completed artifacts that are still valid

### Requirement: `spec-fast` SHALL preserve Codex acceptance ownership

`spec-fast` SHALL remain a Codex-led orchestration entrypoint and SHALL NOT delegate final acceptance or archive decisions to Claude.

#### Scenario: Execution completes successfully

- **WHEN** Claude execution returns implementation evidence
- **THEN** Codex SHALL run the acceptance gate through the maintained `spec-review` rules
- **AND** the result SHALL remain a Codex decision rather than a Claude decision

#### Scenario: Review passes

- **WHEN** Codex review passes
- **THEN** `spec-fast` SHALL stop with an `archive-ready` outcome by default
- **AND** it SHALL NOT archive automatically unless a later explicit mode adds that behavior

### Requirement: `spec-fast` SHALL support bounded rework loops

`spec-fast` SHALL be allowed to loop through `spec-impl -> spec-review` automatically, but only within a bounded retry budget.

#### Scenario: First review fails with bounded findings

- **WHEN** Codex review fails after an implementation attempt
- **THEN** `spec-fast` SHALL produce a bounded rework packet
- **AND** it SHALL re-enter the maintained `spec-impl` path for another attempt if retry budget remains

#### Scenario: Retry budget is exhausted

- **WHEN** review continues to fail after the configured retry budget is spent
- **THEN** `spec-fast` SHALL stop with `retry-budget-exhausted`
- **AND** it SHALL report the active change, latest rework context, and next manual step

### Requirement: `spec-fast` SHALL surface explicit blocked states

`spec-fast` SHALL stop clearly when the maintained path cannot continue automatically.

#### Scenario: Planning cannot produce a bounded packet

- **WHEN** Codex cannot determine a safe execution boundary from current artifacts
- **THEN** `spec-fast` SHALL stop with `blocked`
- **AND** it SHALL report why manual intervention is required

#### Scenario: Status-driven execution cannot be completed safely

- **WHEN** `ccsm claude exec --status-driven` cannot start, cannot correlate a monitor result, or returns a blocked/incomplete execution state
- **THEN** `spec-fast` SHALL stop or re-enter rework according to the maintained `spec-impl` rules
- **AND** it SHALL NOT silently continue with local product implementation
