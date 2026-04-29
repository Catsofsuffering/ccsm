## ADDED Requirements

### Requirement: The CLI SHALL provide a monitor shutdown action
The CCSM CLI SHALL provide `ccsm monitor shutdown` as an explicit monitor lifecycle action that stops the running local monitor service without starting a replacement.

#### Scenario: User shuts down a running monitor
- **WHEN** the user runs `ccsm monitor shutdown` and a healthy CCSM monitor is listening on the configured monitor port
- **THEN** the CLI SHALL stop the running monitor instance
- **AND** wait until the monitor health endpoint is no longer reachable
- **AND** print a clear shutdown success message

#### Scenario: User shuts down when monitor is not running
- **WHEN** the user runs `ccsm monitor shutdown` and no service is listening on the configured monitor port
- **THEN** the CLI SHALL report that the monitor is not running
- **AND** exit successfully

#### Scenario: Shutdown finds an unknown service
- **WHEN** the user runs `ccsm monitor shutdown` and the configured port is occupied by a process that cannot be safely identified as the CCSM monitor
- **THEN** the CLI SHALL fail with a clear error
- **AND** it SHALL NOT silently kill the unrelated process

### Requirement: Shutdown SHALL preserve existing monitor actions
Adding shutdown SHALL NOT change the behavior of existing monitor lifecycle commands.

#### Scenario: User starts the monitor normally
- **WHEN** the user runs `ccsm monitor` or `ccsm monitor start`
- **THEN** the CLI SHALL keep the existing start-or-reuse behavior

#### Scenario: User restarts the monitor
- **WHEN** the user runs `ccsm monitor restart`
- **THEN** the CLI SHALL keep the existing stop-and-start behavior
- **AND** bind the restarted monitor to the current OpenSpec workspace root

#### Scenario: User installs or configures monitor support
- **WHEN** the user runs `ccsm monitor install` or `ccsm monitor hooks`
- **THEN** the CLI SHALL preserve the existing install and hook configuration behavior
