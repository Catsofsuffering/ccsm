## Purpose

Define the maintained runtime layout, host-aware path resolution, migration behavior, and verification guardrails for `ccgs`-owned runtime surfaces.

## Requirements

### Requirement: The maintained default runtime layout SHALL be CCGS-owned

The maintained system SHALL use `ccgs`-owned runtime and installation paths as the default surface instead of treating `.ccg` or `skills/ccg` as canonical.

#### Scenario: User performs a default install

- **WHEN** a user performs the maintained default installation
- **THEN** generated runtime and install paths SHALL be `ccgs`-owned by default

#### Scenario: Generated execution instructions reference local assets

- **WHEN** the workflow prints or installs runtime path references for prompts, skills, rules, or worktrees
- **THEN** those references SHALL point to `ccgs`-owned paths by default

### Requirement: Existing installs SHALL have an explicit migration path

The maintained runtime surface SHALL define how existing `ccg`-named runtime directories or generated assets are migrated, reused, or deprecated without silently breaking current users.

#### Scenario: Existing install still uses ccg-owned runtime paths

- **WHEN** the installer or updater encounters an existing `ccg`-named install
- **THEN** it SHALL either migrate the install or preserve compatibility behavior with explicit user-facing logic

#### Scenario: Legacy command assets remain during transition

- **WHEN** old generated assets still exist during migration
- **THEN** the system SHALL distinguish them from the new `ccgs`-owned defaults and avoid treating them as canonical

### Requirement: Runtime ownership SHALL follow the active host home

The maintained system SHALL resolve config, prompt, command, backup, and monitor assets from the active host home instead of assuming `~/.claude` for every maintained surface.

#### Scenario: Codex-owned maintained install is created

- **WHEN** the maintained install path is driven by Codex ownership
- **THEN** the default `ccgs` runtime paths SHALL resolve under the Codex home boundary rather than silently using `~/.claude`

#### Scenario: Claude execution runtime is prepared

- **WHEN** Claude-owned execution helpers or monitor assets are installed
- **THEN** those runtime paths SHALL resolve under the Claude home boundary while keeping the same `ccgs` namespace and migration behavior

### Requirement: Host-owned runtime SHALL support generalized workflow roles

The maintained runtime surface SHALL support host-owned configuration for a generalized Codex and Claude role model.

#### Scenario: Claude is chosen for orchestration

- **WHEN** Claude is configured as the orchestrator host
- **THEN** the runtime surfaces needed for orchestration SHALL resolve through Claude-owned home paths without breaking the `ccgs` namespace

#### Scenario: Codex is chosen for execution

- **WHEN** Codex is configured as the execution host
- **THEN** the runtime surfaces needed for execution SHALL resolve through Codex-owned home paths without falling back to Claude-owned defaults

### Requirement: Verification SHALL guard against identity regressions

The maintained runtime surface SHALL be verifiable against accidental reintroduction of canonical `ccg` ownership outside approved compatibility or historical contexts.

#### Scenario: Maintained source reintroduces canonical ccg naming

- **WHEN** a maintained source or template change adds a new default `ccg` surface outside approved compatibility or historical locations
- **THEN** verification SHALL fail or clearly flag the regression

#### Scenario: Residual ccg references are audited after migration

- **WHEN** the nativeization pass is reviewed
- **THEN** remaining `ccg` references SHALL be explainable as compatibility or history rather than default runtime ownership
