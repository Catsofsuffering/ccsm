## ADDED Requirements

### Requirement: Maintained Claude dispatch SHALL preserve an external execution boundary

The maintained Codex-to-Claude execution path SHALL satisfy implementation dispatch by launching the CCSM-managed external Claude execution path rather than by silently substituting a host-native delegation runtime.

#### Scenario: Codex reaches the implementation dispatch step

- **WHEN** a maintained workflow step dispatches implementation work to Claude
- **THEN** the dispatch step SHALL invoke `ccsm claude exec` or the equivalent maintained external Claude launch path
- **AND** host-native agent, subagent, or worktree delegation facilities SHALL NOT by themselves count as satisfying that dispatch step

#### Scenario: Host-native delegation is available

- **WHEN** the host environment can spawn its own agents or delegated workers
- **THEN** that availability SHALL remain optional host behavior rather than the maintained Claude execution path
- **AND** the workflow SHALL record any non-Claude compatibility path explicitly instead of treating it as an implicit default
