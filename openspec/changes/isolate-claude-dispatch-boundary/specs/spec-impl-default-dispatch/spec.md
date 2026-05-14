## ADDED Requirements

### Requirement: `spec-impl` SHALL preserve the maintained external Claude dispatch step

The default `spec-impl` path SHALL treat `ccsm claude exec` as the implementation dispatch step and SHALL NOT silently replace that step with host-native delegation or orchestration-side workers.

#### Scenario: Default `spec-impl` dispatch runs from Codex

- **WHEN** Codex prepares a bounded execution packet for the maintained implementation path
- **THEN** Codex MAY inspect context, assemble prompts, and prepare packet artifacts locally
- **AND** it SHALL satisfy the dispatch step only by launching the maintained Claude execution path
- **AND** it SHALL NOT treat host-native delegated workers as the dispatched executor unless the packet records an explicit compatibility fallback

#### Scenario: Compatibility fallback is selected

- **WHEN** `spec-impl` uses a non-Claude or host-native compatibility fallback
- **THEN** the packet or result record SHALL describe the concrete runtime or policy reason for that fallback
- **AND** the workflow SHALL treat that path as an explicit exception rather than the maintained default
