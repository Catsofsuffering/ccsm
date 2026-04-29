## ADDED Requirements

### Requirement: The monitor SHALL discover optional Claude ACP adapters
The monitor SHALL detect a locally available `claude-agent-acp` runtime adapter without making ACP a required dependency for normal monitor operation.

#### Scenario: ACP binary is explicitly configured
- **WHEN** `CCSM_CLAUDE_AGENT_ACP_PATH` points to an executable `claude-agent-acp` binary or script
- **THEN** the monitor SHALL report a `claude-agent-acp` adapter with `available` true
- **AND** it SHALL report the resolved command path and source as explicit configuration

#### Scenario: ACP binary is available on PATH
- **WHEN** no explicit ACP path is configured
- **AND** `claude-agent-acp` is found on PATH
- **THEN** the monitor SHALL report a `claude-agent-acp` adapter with `available` true
- **AND** it SHALL report the resolved command path and source as PATH discovery

#### Scenario: ACP is not installed
- **WHEN** no explicit ACP path is configured
- **AND** `claude-agent-acp` is not found on PATH
- **THEN** the monitor SHALL report the ACP adapter as unavailable or omit it according to the adapter API contract
- **AND** the monitor SHALL continue operating without error

### Requirement: ACP adapter status SHALL include version and support metadata
The monitor SHALL expose enough ACP adapter metadata for operators to understand whether the installed adapter is usable.

#### Scenario: ACP version can be read
- **WHEN** the monitor can determine the installed `claude-agent-acp` package or binary version
- **THEN** adapter health SHALL include the detected version
- **AND** it SHALL indicate whether that version is within the supported range

#### Scenario: ACP version cannot be read
- **WHEN** the binary is present but its version cannot be determined
- **THEN** the adapter SHALL remain visible
- **AND** health SHALL include a warning reason instead of failing monitor startup

### Requirement: ACP adapter launch SHALL be gated
The monitor SHALL NOT prefer or launch ACP execution by default until launch readiness is explicit.

#### Scenario: Control Plane lists adapters
- **WHEN** Control Plane returns available worker adapters
- **THEN** `claude-agent-acp` MAY appear as an optional adapter
- **AND** it SHALL include `launchReady` and capability metadata
- **AND** it SHALL NOT replace `claude-cli` as the default execution adapter solely because ACP is installed

#### Scenario: ACP launch is not validated
- **WHEN** ACP is detected but executable dispatch is not enabled or validated
- **THEN** Control Plane SHALL mark ACP dispatch as blocked, observe-ready, or opt-in according to the adapter health payload
- **AND** it SHALL provide a clear reason
