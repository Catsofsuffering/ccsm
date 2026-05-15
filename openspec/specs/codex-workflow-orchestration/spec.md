## Purpose

Define the durable maintained workflow contract where Codex owns orchestration, Claude executes bounded downstream work, and optional integrations stay additive to the primary path.
## Requirements
### Requirement: Codex SHALL remain the primary orchestrator for the maintained workflow

The maintained workflow SHALL treat Codex as the control plane for change creation, spec progression, bounded execution dispatch, and acceptance.

#### Scenario: User starts the primary workflow

- **WHEN** a user starts or advances the maintained workflow
- **THEN** the default path SHALL remain Codex-led rather than Claude-led

#### Scenario: Specification artifacts are advanced

- **WHEN** a change moves through proposal, design, specs, or tasks
- **THEN** Codex SHALL remain the actor responsible for driving the artifact lifecycle

#### Scenario: User starts the primary workflow from Codex-native entrypoints

- **WHEN** a user starts the maintained workflow through Codex-native installed skills
- **THEN** the maintained entry surface SHALL be the top-level `spec-*` skill set instead of a product-prefixed compatibility skill name

### Requirement: Claude execution SHALL be invoked as bounded downstream work

The maintained workflow SHALL let Codex dispatch Claude execution work as a bounded downstream step rather than as an independent control plane.

#### Scenario: Codex dispatches implementation or documentation work

- **WHEN** Codex reaches a step that requires Claude execution
- **THEN** the workflow SHALL provide Claude with bounded scope, expected deliverables, and a return path back to Codex

#### Scenario: Claude returns execution output

- **WHEN** Claude completes a dispatched step
- **THEN** the resulting status and outputs SHALL be available to Codex for review and next-step decisions

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

### Requirement: Optional integrations SHALL remain additive to the Codex-led path

Gemini, MCP, and skills SHALL remain optional integrations that extend the maintained workflow without redefining its Codex-led ownership model.

#### Scenario: User installs or runs the default path without optional integrations

- **WHEN** a user skips Gemini or leaves MCP and skills unused
- **THEN** the maintained Codex-led workflow SHALL remain available and functional

#### Scenario: User enables an optional integration

- **WHEN** a user enables MCP, skills, or another optional integration
- **THEN** the integration SHALL enhance the workflow without replacing Codex as the orchestrator

### Requirement: Codex is the primary workflow orchestrator
The system SHALL treat Codex as the primary control plane for the default development workflow. Codex MUST be responsible for initiating change creation, advancing specification artifacts, dispatching implementation work, collecting execution results, and determining whether the change is ready for acceptance.

#### Scenario: Starting a new change from the default workflow
- **WHEN** a user starts the default project workflow
- **THEN** the workflow begins in a Codex-led path rather than a Claude-led path

#### Scenario: Advancing a change through specification phases
- **WHEN** a change is moved from proposal to specs, design, or tasks
- **THEN** Codex remains the actor responsible for driving the artifact lifecycle

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

#### Scenario: PI is configured as the middle-model reviewer
- **WHEN** a user enables `pi` as the optional middle-model reviewer in the default workflow
- **THEN** Codex SHALL remain the final acceptance and archive decision owner
- **AND** `pi` SHALL contribute evidence rather than replace the Codex-owned final safety boundary

### Requirement: Default workflow preserves a single orchestration narrative
The system SHALL present the default product narrative as "Codex orchestrates, Claude executes" across workflow entry points, command guidance, and lifecycle descriptions. The system MUST avoid presenting Claude as the default host or control plane for the primary workflow.

#### Scenario: User reads workflow guidance
- **WHEN** a user reads the default workflow description or command help
- **THEN** the guidance describes Codex as the orchestrator for the primary path

#### Scenario: User compares available workflow paths
- **WHEN** the product shows the main workflow alongside optional alternatives
- **THEN** the main path is identified as Codex-led and any Claude-led or multi-model variants are treated as secondary or compatibility paths

#### Scenario: User reads compatibility workflow guidance
- **WHEN** a user opens a compatibility or secondary command from the same installation
- **THEN** the guidance keeps Codex-led ownership intact and does not describe Gemini as an unconditional authority or required collaborator

#### Scenario: User reads Codex-native workflow guidance
- **WHEN** a user reads the installed Codex-native workflow skills
- **THEN** the skills describe the maintained primary path through `spec-init`, `spec-research`, `spec-plan`, `spec-impl`, and `spec-review`

### Requirement: Installer surfaces orchestration ownership
The installer SHALL prompt users to confirm who acts as the workflow orchestrator before selecting frontend/backend execution models. Codex MUST remain the recommended default, while Claude SHOULD remain selectable for compatibility. The prompt outcome MUST persist into configuration metadata and be summarized back to the user.

#### Scenario: User runs interactive init with defaults
- **WHEN** a user runs the interactive installer without overriding any options
- **THEN** the orchestrator prompt recommends Codex, shows Claude as the execution host, and saves that ownership metadata into the config file

#### Scenario: User intentionally selects Claude as orchestrator
- **WHEN** a user selects Claude as the orchestrator during the installer step
- **THEN** the resulting configuration records Claude as the orchestrator, Codex as the execution host, and the summary reflects the compatibility setup

