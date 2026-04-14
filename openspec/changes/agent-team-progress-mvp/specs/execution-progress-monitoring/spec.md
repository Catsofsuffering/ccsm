## ADDED Requirements

### Requirement: Wrapper-managed tasks SHALL have structured lifecycle state
The system SHALL track each wrapper-managed execution unit as a structured task with an identifier, dependency metadata, start and finish timestamps, and a lifecycle status of at least pending, running, completed, failed, or blocked.

#### Scenario: Parallel run is initialized
- **WHEN** the wrapper prepares a parallel execution run
- **THEN** it SHALL register each declared task with a pending status before work begins

#### Scenario: Task starts running
- **WHEN** the executor begins work on a registered task
- **THEN** the system SHALL update that task to running and record its start time

#### Scenario: Task is blocked by failed dependencies
- **WHEN** a task is skipped because one or more dependencies failed
- **THEN** the system SHALL mark the task as blocked and retain the blocking dependency identifiers

#### Scenario: Task completes with a result
- **WHEN** a task finishes execution
- **THEN** the system SHALL mark it completed or failed based on the final result and record its finish time

### Requirement: The built-in Web UI SHALL present run-level monitoring
The system SHALL provide a built-in Web dashboard that shows live run summary information and per-task execution state for all monitored tasks in the current run.

#### Scenario: Dashboard loads an active run
- **WHEN** a user opens the wrapper Web UI during an active run
- **THEN** the page SHALL show aggregate counts for task outcomes and a list of monitored tasks with their current status

#### Scenario: Dashboard displays recent activity
- **WHEN** parser callbacks or executor events publish task activity
- **THEN** the dashboard SHALL update the corresponding task with recent activity information without requiring a full page reload

#### Scenario: Dashboard shows final task details
- **WHEN** a task completes or fails
- **THEN** the dashboard SHALL show the final status together with available result details such as log path, changed files, or verification counts

### Requirement: The monitoring dashboard SHALL be delivered as an embedded frontend bundle
The system SHALL serve the monitoring dashboard from a dedicated frontend asset bundle embedded into the wrapper, rather than relying on a large inline HTML document as the primary UI implementation.

#### Scenario: Embedded dashboard assets are available
- **WHEN** the wrapper is built for a release that includes the monitoring UI
- **THEN** the binary SHALL include the dashboard assets needed to render the monitoring experience without requiring a separately hosted web application

#### Scenario: Browser opens monitoring UI
- **WHEN** a user opens the wrapper Web UI entrypoint
- **THEN** the wrapper SHALL serve the embedded dashboard shell and the frontend SHALL load task monitoring data from wrapper-owned monitoring endpoints

### Requirement: Monitoring history SHALL be retained after process exit
The system SHALL persist run state and monitoring events to local wrapper-owned storage so users can inspect the final execution record after the live run ends.

#### Scenario: Run state is updated
- **WHEN** the monitoring model changes during execution
- **THEN** the system SHALL write an updated run snapshot and append a corresponding history event

#### Scenario: Run completes
- **WHEN** the wrapper exits after a monitored run
- **THEN** the retained monitoring snapshot SHALL still exist independently of transient debug log cleanup

### Requirement: Monitoring APIs SHALL expose structured task state
The system SHALL expose structured monitoring data through the built-in monitoring endpoints so the Web UI and future clients can consume task-level state directly.

#### Scenario: Client requests current monitoring state
- **WHEN** a client requests the monitoring state endpoint
- **THEN** the response SHALL include run summary information and the current state of every monitored task

#### Scenario: Client subscribes to live monitoring updates
- **WHEN** a client subscribes to the monitoring stream
- **THEN** the system SHALL emit structured events that identify the affected task and the updated state or activity
