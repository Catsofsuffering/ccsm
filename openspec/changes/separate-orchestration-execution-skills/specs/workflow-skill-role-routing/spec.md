## ADDED Requirements

### Requirement: CCSM skills SHALL declare workflow role for host routing

The system SHALL distinguish CCSM skill classes by workflow role so installation can route control-plane skills and execution-worker skills to different hosts.

#### Scenario: Maintained workflow skill metadata is inspected

- **WHEN** the installer evaluates maintained workflow skills
- **THEN** each skill SHALL be classified as `orchestration`, `execution`, or `shared`
- **AND** the top-level `spec-init`, `spec-research`, `spec-plan`, `spec-impl`, and `spec-review` skills SHALL be classified as `orchestration`

#### Scenario: Shared canonical skills are installed

- **WHEN** reusable CCSM skills are copied into the maintained runtime
- **THEN** shared skills SHALL remain under the canonical `~/.ccsm/skills/ccsm/` surface
- **AND** shared canonical skill storage SHALL NOT imply orchestration ownership by Codex or Claude

### Requirement: Skill installation SHALL route by configured ownership

The installer and updater SHALL install role-specific skills to the host selected for that role instead of using fixed Codex or Claude paths.

#### Scenario: Codex is the configured orchestrator

- **WHEN** a user installs or updates the default Codex-led workflow
- **THEN** orchestration skills SHALL be installed into the configured Codex host skill directory
- **AND** execution skills SHALL be installed into the configured Claude execution host skill directory when execution skill templates are present

#### Scenario: Claude is the configured orchestrator

- **WHEN** a user installs or updates a compatibility setup with Claude as orchestrator
- **THEN** orchestration skills SHALL be installed into the configured Claude host skill directory
- **AND** they SHALL NOT be installed only into the Codex host skill directory by hard-coded default

#### Scenario: Installation summary is shown

- **WHEN** skill installation succeeds
- **THEN** the summary SHALL identify skill role, installed skill names, and destination host path clearly enough for a user to know which side owns orchestration and execution

### Requirement: Role-routed skill conflicts SHALL preserve user-owned skills

Role-routed skill installation SHALL refresh CCSM-managed skills without overwriting unrelated user-owned skills.

#### Scenario: Managed role-routed skill already exists

- **WHEN** a destination skill exists and carries a CCSM managed marker or exactly matches expected managed content
- **THEN** the installer MAY refresh it in place

#### Scenario: User-owned skill conflict exists

- **WHEN** a destination skill path already exists and is not recognized as CCSM-managed
- **THEN** the installer SHALL report a conflict
- **AND** it SHALL NOT overwrite that user-owned skill

#### Scenario: Deprecated or misplaced managed skill is found

- **WHEN** a managed skill from an older fixed-host install is found outside the configured role destination
- **THEN** the installer or updater SHALL either remove it after installing the correct destination or report a guided repair action
- **AND** it SHALL NOT remove user-owned conflicting skills
