## ADDED Requirements

### Requirement: OpenSpec task state SHALL remain orchestrator-owned

The maintained workflow SHALL keep OpenSpec task completion and acceptance state under the configured orchestrator rather than the execution worker.

#### Scenario: Execution worker completes implementation

- **WHEN** downstream execution work completes
- **THEN** the worker SHALL return implementation evidence to the orchestrator
- **AND** the orchestrator SHALL decide whether to update task checkboxes or request rework

#### Scenario: Execution worker attempts final review

- **WHEN** an execution worker is asked or tempted to run `spec-review`
- **THEN** maintained guidance SHALL identify `spec-review` as an orchestrator-owned acceptance gate
- **AND** the worker SHALL report that final review is reserved for the orchestrator
