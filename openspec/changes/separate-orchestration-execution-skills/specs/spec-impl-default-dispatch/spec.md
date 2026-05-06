## ADDED Requirements

### Requirement: `spec-impl` execution workers SHALL NOT perform acceptance control-plane actions

The `spec-impl` execution packet and installed skill guidance SHALL prevent downstream execution workers from becoming a second OpenSpec control plane.

#### Scenario: Claude Agent Teams receives a `spec-impl` execution packet

- **WHEN** Codex dispatches implementation work to Claude Agent Teams
- **THEN** the packet SHALL instruct workers not to run `spec-review`
- **AND** it SHALL instruct workers not to archive the change or decide acceptance readiness
- **AND** it SHALL require implementation evidence to be returned to Codex for review

#### Scenario: Worker implementation touches OpenSpec task state

- **WHEN** a Claude execution worker is implementing the packet
- **THEN** the worker SHALL NOT edit the active change `tasks.md`
- **AND** the worker SHALL NOT mark tasks complete or rewrite task scope
- **AND** Codex SHALL remain responsible for task checkbox updates during acceptance

#### Scenario: Worker discovers task/spec inconsistency

- **WHEN** a worker believes tasks or specs are incomplete or wrong
- **THEN** the worker SHALL report the inconsistency in the return packet
- **AND** it SHALL stop short of mutating source-of-truth OpenSpec artifacts unless Codex explicitly dispatches a follow-up planning task
