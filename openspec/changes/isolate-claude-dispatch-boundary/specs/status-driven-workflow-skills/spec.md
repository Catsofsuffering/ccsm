## ADDED Requirements

### Requirement: Status-driven workflow guidance SHALL describe persisted return-packet fallback

Installed workflow skills and slash-command templates SHALL teach Codex to inspect structured monitor outputs first and a CCSM-managed persisted return-packet artifact second when reviewing a correlated status-driven run.

#### Scenario: Monitor outputs contain the Execution Return Packet

- **WHEN** status-driven exec returns a correlated terminal state and monitor `outputs` contain a usable Execution Return Packet
- **THEN** the workflow guidance SHALL describe monitor `outputs` as the primary implementation-evidence source
- **AND** the persisted fallback artifact SHALL be treated as optional diagnostic or backup context

#### Scenario: Monitor outputs do not contain usable final evidence

- **WHEN** status-driven exec returns a correlated terminal state but monitor `outputs` are missing, truncated, or otherwise unusable for acceptance review
- **THEN** the workflow guidance SHALL instruct Codex to inspect the persisted return-packet artifact for that run
- **AND** it SHALL continue to treat raw terminal text as non-authoritative diagnostic output
