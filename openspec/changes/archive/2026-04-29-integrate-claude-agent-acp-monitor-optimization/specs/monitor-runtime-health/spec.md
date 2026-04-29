## ADDED Requirements

### Requirement: The monitor SHALL expose unified runtime health
The monitor SHALL provide a diagnostics model that summarizes adapter, hook, database, workspace, WebSocket, transcript cache, and ingestion health in one coherent payload.

#### Scenario: User opens monitor diagnostics
- **WHEN** monitor diagnostics or settings info is loaded
- **THEN** the response SHALL include runtime adapter health
- **AND** hook installation health
- **AND** database/storage health
- **AND** active workspace/OpenSpec health
- **AND** WebSocket connection health
- **AND** transcript/cache health

#### Scenario: A runtime component is degraded
- **WHEN** one monitored component is unavailable, stale, or misconfigured
- **THEN** the diagnostics payload SHALL identify the component and reason
- **AND** unrelated healthy components SHALL still be reported normally

### Requirement: Runtime health SHALL be concise but inspectable
The monitor SHALL expose operator-readable summaries while preserving structured details for the UI and tests.

#### Scenario: Health is summarized in the UI
- **WHEN** the monitor client renders runtime health
- **THEN** it SHALL show concise status labels for each runtime component
- **AND** it SHALL avoid long raw payload dumps in primary navigation or page headers

#### Scenario: Detailed health is needed
- **WHEN** a component has warnings or errors
- **THEN** structured details SHALL be available in the diagnostics data
- **AND** the details SHALL include enough source/version/path information to guide repair

### Requirement: Health reporting SHALL be non-blocking
Runtime health collection SHALL avoid making normal monitor pages unavailable when optional integrations fail.

#### Scenario: ACP health check fails
- **WHEN** ACP version or binary probing fails
- **THEN** monitor health SHALL mark the ACP adapter degraded or unavailable
- **AND** existing sessions, events, OpenSpec board, Workflow, and Control Plane pages SHALL remain usable

#### Scenario: OpenSpec health check fails
- **WHEN** OpenSpec state cannot be loaded
- **THEN** OpenSpec-specific health SHALL be degraded
- **AND** non-OpenSpec monitor data SHALL remain available
