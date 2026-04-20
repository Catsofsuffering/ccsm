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

### Requirement: Claude execution SHALL be invoked as bounded downstream work

The maintained workflow SHALL let Codex dispatch Claude execution work as a bounded downstream step rather than as an independent control plane.

#### Scenario: Codex dispatches implementation or documentation work

- **WHEN** Codex reaches a step that requires Claude execution
- **THEN** the workflow SHALL provide Claude with bounded scope, expected deliverables, and a return path back to Codex

#### Scenario: Claude returns execution output

- **WHEN** Claude completes a dispatched step
- **THEN** the resulting status and outputs SHALL be available to Codex for review and next-step decisions

### Requirement: Codex SHALL control acceptance and archive decisions

The maintained workflow SHALL require Codex to perform final verification and decide whether a change is ready for archive.

#### Scenario: Acceptance passes

- **WHEN** Codex verifies that the change satisfies its requirements and checks
- **THEN** the workflow SHALL mark the change as eligible for archive review

#### Scenario: Acceptance fails

- **WHEN** Codex finds unmet criteria or failed verification
- **THEN** the workflow SHALL keep the change open for rework instead of archiving it

### Requirement: Optional integrations SHALL remain additive to the Codex-led path

Gemini, MCP, and skills SHALL remain optional integrations that extend the maintained workflow without redefining its Codex-led ownership model.

#### Scenario: User installs or runs the default path without optional integrations

- **WHEN** a user skips Gemini or leaves MCP and skills unused
- **THEN** the maintained Codex-led workflow SHALL remain available and functional

#### Scenario: User enables an optional integration

- **WHEN** a user enables MCP, skills, or another optional integration
- **THEN** the integration SHALL enhance the workflow without replacing Codex as the orchestrator
