## ADDED Requirements

### Requirement: The monitor SHALL expose cost and rework efficiency for workflow roles
The monitor SHALL provide an analysis surface that helps users evaluate whether the configured workflow roles are reducing cost without degrading convergence quality.

#### Scenario: User opens cost and rework analysis
- **WHEN** the monitor has sufficient session, model, token, and workflow outcome data
- **THEN** it SHALL present cost and rework efficiency information for the workflow
- **AND** that view SHALL distinguish the participation of orchestrator, execution, and optional acceptance-review roles where evidence exists

#### Scenario: Optional acceptance reviewer participates
- **WHEN** an optional reviewer such as `opencode` participates in review or rework analysis
- **THEN** the monitor SHALL attribute the session, model, and token evidence to that role where practical
- **AND** users SHALL be able to inspect whether that reviewer reduced or increased downstream rework

#### Scenario: Data is incomplete
- **WHEN** the monitor lacks enough evidence to compute a reliable cost or rework metric
- **THEN** it SHALL preserve uncertainty explicitly
- **AND** it SHALL avoid presenting guessed role-attribution or fabricated efficiency claims
