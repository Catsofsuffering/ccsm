## ADDED Requirements

### Requirement: The maintained Codex-native skill surface SHALL include a fast-path orchestrator

The maintained Codex-native primary skill surface SHALL include a higher-level orchestration skill that can drive the existing phase skills as one managed lifecycle.

#### Scenario: Installed workflow skills are inspected

- **WHEN** a maintainer inspects the installed Codex-native workflow skills
- **THEN** the maintained surface SHALL include `spec-fast` alongside `spec-init`, `spec-research`, `spec-plan`, `spec-impl`, and `spec-review`

#### Scenario: User invokes the fast-path orchestrator

- **WHEN** a user invokes `spec-fast`
- **THEN** the workflow SHALL remain Codex-led
- **AND** `spec-fast` SHALL use the existing maintained phase contracts rather than inventing a parallel non-OpenSpec control plane
