## ADDED Requirements

### Requirement: Fast-path orchestration SHALL still preserve reviewable artifacts

The system SHALL not let a fast-path orchestration entrypoint bypass the artifact structure required for reviewable OpenSpec changes.

#### Scenario: `spec-fast` handles a fresh request

- **WHEN** `spec-fast` creates or advances a new change
- **THEN** the change SHALL still produce proposal, design/spec deltas, and tasks as required by the active schema before implementation begins

#### Scenario: `spec-fast` resumes an execution-ready change

- **WHEN** a change already has the required planning artifacts
- **THEN** `spec-fast` MAY reuse those artifacts
- **BUT** it SHALL not conceal missing or invalid planning state behind direct execution
