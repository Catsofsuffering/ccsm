# monitor-process-control Specification

## Purpose
TBD - created by archiving change fix-agent-teams-monitoring. Update Purpose after archive.
## Requirements
### Requirement: The CLI SHALL provide a monitor restart action
The CCSM CLI SHALL provide `ccsm monitor restart` as an explicit monitor lifecycle action that restarts the local monitor service for the current workspace.

#### Scenario: User restarts a running monitor
- **WHEN** the user runs `ccsm monitor restart` and a CCSM monitor is already listening on the configured monitor port
- **THEN** the CLI SHALL stop the running monitor instance
- **AND** start a fresh monitor instance bound to the current workspace root
- **AND** print the monitor URL and monitor directory

#### Scenario: User restarts when monitor is not running
- **WHEN** the user runs `ccsm monitor restart` and no monitor is listening on the configured monitor port
- **THEN** the CLI SHALL start a fresh monitor instance for the current workspace
- **AND** report that the monitor started successfully

#### Scenario: Port is occupied by an unknown service
- **WHEN** the user runs `ccsm monitor restart` and the configured port is occupied by a process that cannot be safely identified or stopped as the CCSM monitor
- **THEN** the CLI SHALL fail with a clear error
- **AND** it SHALL NOT silently kill unrelated processes

### Requirement: Restart SHALL preserve existing monitor actions
Adding restart SHALL NOT change the behavior of existing monitor lifecycle commands.

#### Scenario: User starts the monitor normally
- **WHEN** the user runs `ccsm monitor` or `ccsm monitor start`
- **THEN** the CLI SHALL keep the existing start-or-reuse behavior

#### Scenario: User installs monitor assets
- **WHEN** the user runs `ccsm monitor install`
- **THEN** the CLI SHALL install monitor runtimes and trust/hook configuration as before

#### Scenario: User configures hooks
- **WHEN** the user runs `ccsm monitor hooks`
- **THEN** the CLI SHALL configure Claude monitor hooks as before

### Requirement: Restart SHALL use the current project context
The restart action SHALL bind the restarted monitor to the nearest OpenSpec workspace for the directory where the command is invoked.

#### Scenario: User restarts from a project subdirectory
- **WHEN** the user runs `ccsm monitor restart` from inside a project that contains an ancestor `openspec/` directory
- **THEN** the restarted monitor SHALL use that ancestor as `OPENSPEC_WORKSPACE_ROOT`
- **AND** monitor board and session views SHALL target that project context

