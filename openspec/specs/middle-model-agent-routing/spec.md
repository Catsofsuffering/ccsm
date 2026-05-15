# middle-model-agent-routing Specification

## Purpose
TBD - created by archiving change add-optional-middle-model-agents. Update Purpose after archive.
## Requirements
### Requirement: Middle-model agent routing SHALL be configurable independently of the default workflow path
The system SHALL provide an explicit configuration flag that determines whether the optional middle-model agent layer is enabled.

#### Scenario: User disables the middle-model agent layer
- **WHEN** installation or configuration sets the middle-model agent layer to disabled
- **THEN** the maintained default workflow SHALL continue without requiring any middle-model reviewer provider
- **AND** the resulting configuration SHALL preserve the Codex-led default acceptance boundary

#### Scenario: User enables the middle-model agent layer
- **WHEN** installation or configuration sets the middle-model agent layer to enabled
- **THEN** the system SHALL require a concrete middle-model provider selection for that layer
- **AND** the configured provider SHALL be persisted in workflow configuration

### Requirement: Middle-model agent providers SHALL be drawn from a supported provider set
The system SHALL treat middle-model agents as a supported provider family rather than as a single hardcoded provider.

#### Scenario: User selects PI as the middle-model provider
- **WHEN** the middle-model agent layer is enabled
- **AND** the user selects `pi`
- **THEN** the workflow SHALL persist `pi` as the configured middle-model provider
- **AND** the provider SHALL be treated as the same reviewer-layer class as `opencode`

#### Scenario: User selects OpenCode as the middle-model provider
- **WHEN** the middle-model agent layer is enabled
- **AND** the user selects `opencode`
- **THEN** the workflow SHALL preserve the existing reviewer-layer behavior for `opencode`

