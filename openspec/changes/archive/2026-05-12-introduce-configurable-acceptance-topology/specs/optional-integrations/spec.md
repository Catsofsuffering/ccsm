## ADDED Requirements

### Requirement: Optional acceptance-review integrations SHALL remain additive
The system SHALL treat optional acceptance-review integrations such as `opencode` as additive enhancements to the maintained workflow rather than mandatory dependencies.

#### Scenario: User installs the default workflow without opencode
- **WHEN** a user installs or runs the maintained workflow without configuring `opencode`
- **THEN** the default orchestration, execution, and acceptance path SHALL remain available and functional

#### Scenario: User enables opencode for acceptance review
- **WHEN** a user enables `opencode` as an optional acceptance reviewer after the base workflow is available
- **THEN** the integration SHALL augment review or rework analysis without redefining the maintained orchestration ownership model
- **AND** the workflow SHALL not imply that `opencode` is required for the default path
