## MODIFIED Requirements

### Requirement: Codex SHALL control acceptance and archive decisions

The maintained workflow SHALL require Codex, acting as the orchestrator, to retain the final high-trust acceptance and archive boundary even when optional acceptance reviewers participate in the path.

#### Scenario: Optional acceptance reviewer participates

- **WHEN** an optional acceptance reviewer analyzes execution evidence or produces review findings
- **THEN** Codex SHALL remain responsible for the final maintained acceptance outcome by default
- **AND** the reviewer output SHALL flow back to Codex as evidence rather than as an unconditional final verdict

#### Scenario: Acceptance reviewer finds issues

- **WHEN** an optional acceptance reviewer reports missing evidence, scope violations, or failed checks
- **THEN** Codex SHALL keep the change open for rework instead of archiving it
- **AND** the workflow SHALL allow Codex to convert the reviewer findings into a bounded rework path

#### Scenario: Acceptance reviewer recommends success

- **WHEN** an optional acceptance reviewer recommends that a change is acceptable
- **THEN** Codex SHALL still decide whether the maintained workflow is ready to advance toward archive review
- **AND** archive SHALL remain an explicit high-trust action rather than an automatic side effect of reviewer output

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
