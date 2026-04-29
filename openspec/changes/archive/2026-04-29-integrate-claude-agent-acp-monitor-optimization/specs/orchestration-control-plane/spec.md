## MODIFIED Requirements

### Requirement: The control plane SHALL discover worker adapters through a runtime adapter registry
The orchestration control plane SHALL derive worker adapter availability and capabilities from a shared runtime adapter registry rather than hard-coded route-specific checks.

#### Scenario: Control Plane loads adapter state
- **WHEN** Control Plane overview or project data is requested
- **THEN** it SHALL list known worker adapters using the shared adapter registry
- **AND** each adapter SHALL include runtime, transport, availability, capabilities, health, and launch-readiness metadata

#### Scenario: Existing CLI adapters are discovered
- **WHEN** Codex and Claude CLI binaries are available or configured
- **THEN** the existing `codex-cli` and `claude-cli` adapter identities SHALL remain stable
- **AND** existing client payload expectations SHALL remain compatible

#### Scenario: ACP adapter is discovered
- **WHEN** `claude-agent-acp` is available or explicitly configured
- **THEN** Control Plane SHALL include it as an optional adapter with ACP transport metadata
- **AND** it SHALL NOT make ACP the default dispatch adapter unless launch readiness and selection rules explicitly allow it

### Requirement: Dispatch selection SHALL preserve the maintained default path
The control plane dispatcher SHALL keep the stable Claude CLI execution path as the default for implementation-stage replay while optional ACP support is being introduced.

#### Scenario: Implementation-stage replay is requested
- **WHEN** a replay action is requested for an implementation-stage or execution-ready project
- **THEN** Control Plane SHALL continue to prefer the stable Claude CLI adapter by default
- **AND** ACP SHALL only be selected through explicit gating, operator selection, or a later validated dispatch rule

#### Scenario: ACP is available but not launch-ready
- **WHEN** ACP is discovered but its adapter health says launch is not ready
- **THEN** Control Plane SHALL not create a running ACP dispatch
- **AND** it SHALL surface a blocked or unavailable dispatch reason

### Requirement: Control-plane health SHALL include adapter-specific diagnostics
The control plane SHALL expose adapter health in project and overview payloads so operators can understand runtime capacity.

#### Scenario: Worker health is summarized
- **WHEN** Control Plane returns worker health
- **THEN** each runtime adapter SHALL report availability, launch readiness, active/running workload counts where applicable, and last known error or limitation

#### Scenario: Optional adapter is unavailable
- **WHEN** an optional adapter such as ACP is unavailable
- **THEN** Control Plane SHALL report that state without treating the project as blocked solely because the optional adapter is missing
