## MODIFIED Requirements

### Requirement: Optional acceptance reviewers SHALL be additive to the maintained workflow
The system SHALL allow an optional acceptance reviewer to participate in the workflow without replacing the maintained orchestrator-owned acceptance boundary by default.

#### Scenario: Opencode is configured as acceptance reviewer
- **WHEN** a user enables `opencode` as an acceptance reviewer
- **THEN** the reviewer SHALL be allowed to analyze execution evidence, diff scope, and verification completeness
- **AND** it SHALL return findings, recommendations, or a bounded rework packet to the orchestrator
- **AND** it SHALL NOT independently finalize archive readiness by default

#### Scenario: PI is configured as acceptance reviewer
- **WHEN** a user enables `pi` as an acceptance reviewer
- **THEN** the reviewer SHALL be allowed to analyze execution evidence, diff scope, and verification completeness
- **AND** it SHALL return findings, recommendations, or a bounded rework packet to the orchestrator
- **AND** it SHALL NOT independently finalize archive readiness by default

#### Scenario: Acceptance reviewer is absent
- **WHEN** the workflow runs without an optional acceptance reviewer
- **THEN** the maintained orchestration and acceptance flow SHALL remain available and functional

#### Scenario: Middle-model agent layer is disabled
- **WHEN** configuration explicitly disables the middle-model agent layer
- **THEN** the workflow SHALL behave as if no optional acceptance reviewer is configured
- **AND** it SHALL NOT require `opencode`, `pi`, or any other middle-model provider for the default path

