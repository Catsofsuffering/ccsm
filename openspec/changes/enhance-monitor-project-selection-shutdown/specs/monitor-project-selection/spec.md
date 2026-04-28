## ADDED Requirements

### Requirement: The monitor SHALL expose selectable OpenSpec project roots
The monitor SHALL let users choose the active OpenSpec project root from valid project roots discovered through local monitor state and runtime configuration.

#### Scenario: User opens the monitor with multiple discovered projects
- **WHEN** the monitor has more than one valid discovered OpenSpec project root
- **THEN** the monitor UI SHALL present a project selector with recognizable project labels and root paths
- **AND** it SHALL indicate the currently active project root

#### Scenario: User selects a project
- **WHEN** the user chooses a project root from the selector
- **THEN** the monitor SHALL persist that root as the active OpenSpec workspace
- **AND** subsequent project-scoped monitor requests SHALL use the selected root

#### Scenario: User selects an invalid project path
- **WHEN** a project selection request provides a root that does not resolve to a directory containing `openspec/`
- **THEN** the monitor SHALL reject the request with a clear error
- **AND** it SHALL keep the previous active workspace unchanged

### Requirement: Project-scoped monitor views SHALL follow the selected project
Monitor views that represent OpenSpec workflow state SHALL use the active selected project root.

#### Scenario: User switches projects from the monitor UI
- **WHEN** the active project root changes
- **THEN** the OpenSpec board SHALL reload from the selected project root
- **AND** Workflow project summaries SHALL reload from the selected project root
- **AND** Control Plane project data SHALL reload from the selected project root

#### Scenario: User views project sessions
- **WHEN** a project-scoped session or Workflow view is loaded
- **THEN** the monitor SHALL include sessions whose `cwd` or `metadata.project_cwd` resolves under the active selected project root
- **AND** it SHALL exclude sessions from other OpenSpec project roots

#### Scenario: User views Workflow summaries for a selected project
- **WHEN** the Workflow page loads with an active selected project root
- **THEN** all top-level Workflow aggregate sections SHALL use the same selected-project session scope
- **AND** stats, orchestration, tool flow, effectiveness, patterns, model delegation, error propagation, concurrency, complexity, compaction, and cooccurrence SHALL exclude sessions, agents, events, and token usage from other OpenSpec project roots

#### Scenario: OpenSpec is unavailable for the selected project
- **WHEN** the active project root cannot be read or OpenSpec state loading fails
- **THEN** project-scoped views SHALL show an explanatory read-only error state
- **AND** global session/event monitoring SHALL remain usable

### Requirement: Project discovery SHALL avoid broad filesystem scanning
The monitor SHALL discover project roots from bounded local evidence rather than scanning arbitrary filesystem trees.

#### Scenario: The monitor builds project choices
- **WHEN** the monitor returns selectable project roots
- **THEN** candidates SHALL come from active workspace settings, runtime workspace environment variables, session working directories, session project metadata, current process roots, or repository roots
- **AND** every returned candidate SHALL be normalized to the nearest ancestor OpenSpec workspace
- **AND** duplicate roots SHALL be collapsed
