## MODIFIED Requirements

### Requirement: Codex controls acceptance and archive decisions
The system SHALL require Codex to retain the maintained final acceptance and archive decision boundary even when optional acceptance-path participants are configured.

#### Scenario: Acceptance reviewer is configured in the default workflow
- **WHEN** a user enables an optional reviewer such as `opencode` in the default workflow
- **THEN** Codex SHALL continue to evaluate the implementation outcome and determine whether maintained acceptance criteria have passed
- **AND** the reviewer SHALL augment that decision with evidence instead of replacing the default Codex-owned safety boundary

#### Scenario: Acceptance reviewer is not configured
- **WHEN** the workflow runs without an optional reviewer layer
- **THEN** the system SHALL preserve the existing Codex-led acceptance and archive decision flow

#### Scenario: Archive is about to happen
- **WHEN** implementation results, reviewer findings, and verification checks all indicate success
- **THEN** the workflow SHALL still require Codex to confirm archive readiness before archive proceeds

#### Scenario: PI is configured as the middle-model reviewer
- **WHEN** a user enables `pi` as the optional middle-model reviewer in the default workflow
- **THEN** Codex SHALL remain the final acceptance and archive decision owner
- **AND** `pi` SHALL contribute evidence rather than replace the Codex-owned final safety boundary
