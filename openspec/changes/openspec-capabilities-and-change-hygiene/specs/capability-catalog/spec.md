## ADDED Requirements

### Requirement: The repository SHALL maintain canonical main capability specs under `openspec/specs/`

The repository SHALL represent durable maintained behavior through canonical main specs in `openspec/specs/` rather than leaving the capability catalog empty.

#### Scenario: User inspects the repository capability surface

- **WHEN** a maintainer or contributor reviews `openspec/specs/`
- **THEN** they SHALL find named capability specs that describe the maintained product surface
- **AND** the catalog SHALL not be empty once stable capabilities have already been defined through accepted or near-stable changes

#### Scenario: Durable behavior has already been specified in change-local specs

- **WHEN** completed or strongly established changes already describe stable behavior
- **THEN** the repository SHALL promote that behavior into canonical main specs so future changes can build on them

### Requirement: Canonical main specs SHALL be organized around stable capability boundaries

The main-spec catalog SHALL use capability names and requirement groupings that remain understandable after individual changes are archived.

#### Scenario: A capability is promoted from current changes

- **WHEN** the repository turns change-local requirements into a main capability spec
- **THEN** the resulting capability name SHALL describe a durable product boundary rather than a one-off task name

#### Scenario: A maintainer reads a main spec later

- **WHEN** the original implementation change is no longer active
- **THEN** the main spec SHALL still make sense as the durable source of truth for that capability
