## Purpose

Define the canonical `CCGS` identity for maintained user-facing defaults while preserving explicit, bounded historical and compatibility references to `ccg`.

## Requirements

### Requirement: Maintained user-facing defaults SHALL use CCGS as the canonical identity

The maintained system SHALL present `CCGS` as the canonical project identity across current user-facing defaults.

#### Scenario: User reads current project guidance

- **WHEN** a user reads maintained installation, workflow, or command guidance
- **THEN** the guidance SHALL identify `CCGS` as the canonical project

#### Scenario: User inspects package or CLI metadata

- **WHEN** a user inspects maintained package metadata, CLI help, or executable naming
- **THEN** the default identity surfaced to the user SHALL be `ccgs` or `CCGS`, not `ccg`

### Requirement: Compatibility naming SHALL remain explicit

The maintained system SHALL label retained `ccg` naming as compatibility or migration-only instead of letting it silently define the default experience.

#### Scenario: Compatibility alias is retained

- **WHEN** the implementation keeps a `ccg` alias for install, command, or runtime compatibility
- **THEN** the alias SHALL be documented or surfaced as compatibility rather than as canonical

#### Scenario: Canonical and compatibility surfaces coexist

- **WHEN** both `ccgs` and `ccg` surfaces exist during migration
- **THEN** the `ccgs` surface SHALL be clearly preferred and the `ccg` surface SHALL be bounded as a bridge

### Requirement: Historical references SHALL remain historical

Archived or historical references to `ccg` MAY remain factual records, but they SHALL not justify keeping `ccg` as the maintained default identity.

#### Scenario: User reads archived history

- **WHEN** a user opens archived OpenSpec artifacts or past release notes
- **THEN** factual `ccg` references MAY remain as historical record

#### Scenario: Maintained guidance is updated

- **WHEN** current maintained guidance is revised
- **THEN** it SHALL not continue to present deleted-upstream `ccg` identity as the active default
