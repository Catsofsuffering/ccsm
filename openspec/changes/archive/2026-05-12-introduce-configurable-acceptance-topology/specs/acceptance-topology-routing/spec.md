## ADDED Requirements

### Requirement: Acceptance topology SHALL distinguish reviewer and final decision roles
The system SHALL model acceptance participation as a topology that can distinguish between an acceptance reviewer and a final acceptance decision owner.

#### Scenario: Acceptance topology is configured
- **WHEN** the workflow ownership model is read from configuration or generated guidance
- **THEN** it SHALL distinguish orchestrator, execution host, and acceptance-path roles
- **AND** acceptance review assistance SHALL be representable without implying that the reviewer also owns the final decision

### Requirement: First-version acceptance decision ownership SHALL default to the orchestrator
The first version of configurable acceptance topology SHALL keep the orchestrator as the default final acceptance decision owner.

#### Scenario: No explicit acceptance reviewer is configured
- **WHEN** a user installs or runs the default workflow without an acceptance reviewer override
- **THEN** the orchestrator SHALL remain the final acceptance decision owner
- **AND** the workflow SHALL preserve the current high-trust acceptance boundary

#### Scenario: Legacy ownership config is loaded
- **WHEN** an existing config only records orchestrator, execution host, or legacy acceptance ownership fields
- **THEN** the system SHALL interpret the final acceptance decision owner as the orchestrator unless a newer explicit topology field says otherwise

### Requirement: Optional acceptance reviewers SHALL be additive to the maintained workflow
The system SHALL allow an optional acceptance reviewer to participate in the workflow without replacing the maintained orchestrator-owned acceptance boundary by default.

#### Scenario: Opencode is configured as acceptance reviewer
- **WHEN** a user enables `opencode` as an acceptance reviewer
- **THEN** the reviewer SHALL be allowed to analyze execution evidence, diff scope, and verification completeness
- **AND** it SHALL return findings, recommendations, or a bounded rework packet to the orchestrator
- **AND** it SHALL NOT independently finalize archive readiness by default

#### Scenario: Acceptance reviewer is absent
- **WHEN** the workflow runs without an optional acceptance reviewer
- **THEN** the maintained orchestration and acceptance flow SHALL remain available and functional

### Requirement: Archive readiness and archive action SHALL remain explicit high-trust boundaries
The system SHALL treat archive readiness and archive action as explicit high-trust steps even when optional acceptance reviewers participate.

#### Scenario: Acceptance reviewer recommends success
- **WHEN** an optional acceptance reviewer reports that a change appears acceptable
- **THEN** the orchestrator or configured final decision owner SHALL still confirm the final acceptance outcome
- **AND** archive action SHALL remain a separate explicit step or approval boundary

#### Scenario: Acceptance reviewer reports failure
- **WHEN** an optional acceptance reviewer finds unmet criteria or weak evidence
- **THEN** the workflow SHALL be allowed to produce a bounded rework packet
- **AND** the change SHALL remain open instead of advancing directly toward archive
