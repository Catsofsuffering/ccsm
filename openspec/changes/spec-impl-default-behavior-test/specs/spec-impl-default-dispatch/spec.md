## ADDED Requirements

### Requirement: `spec-impl` defaults to dispatch-first behavior

When a planned change enters `spec-impl`, the system SHALL dispatch work through the Claude execution path before any Codex-side product implementation begins.

#### Scenario: No user-forced local fallback

- **WHEN** the initiating request does not explicitly require local Codex implementation
- **THEN** Codex prepares a bounded execution packet and attempts Claude dispatch first

### Requirement: Default worker topology remains Agent Teams-first unless fallback is explicit

When the initiating request does not force a worker topology, the system SHALL treat Agent Teams as the default `spec-impl` execution mode unless the packet explicitly documents a justified fallback.

#### Scenario: User input does not force worker topology

- **WHEN** the user request does not explicitly require Agent Teams or single-worker Claude
- **THEN** the default path is Agent Teams-first

#### Scenario: Single-worker fallback is used

- **WHEN** the execution packet selects a non-Agent-Teams path
- **THEN** the packet records the concrete runtime or scope reason for that fallback

### Requirement: Agent Teams launch defaults inject permission mode unless explicitly overridden

For Agent Teams `spec-impl` launches, the system SHALL inject the default permission mode unless the caller already provided an explicit permission configuration.

#### Scenario: No explicit permission override is provided

- **WHEN** `ccsm claude exec` is launched for the default Agent Teams path without an explicit permission flag or override
- **THEN** the launch includes the default permission mode

#### Scenario: Explicit permission configuration is provided

- **WHEN** the caller already provides a Claude permission flag or override value
- **THEN** the launcher preserves that explicit configuration instead of replacing it
