# status-driven-workflow-skills Specification

## Purpose
TBD - created by archiving change sync-status-driven-exec-skills. Update Purpose after archive.
## Requirements
### Requirement: Codex-native spec-impl SHALL dispatch with status-driven Claude exec
The Codex-native `spec-impl` skill SHALL use status-driven `ccsm claude exec` for the default Claude Agent Teams execution path.

#### Scenario: Default Agent Teams dispatch
- **WHEN** Codex runs the default `spec-impl` Agent Teams path
- **THEN** the skill guidance SHALL dispatch with `ccsm claude exec --status-driven --prompt-file .claude/ccsm/claude-dispatch-prompt.txt`
- **AND** Codex SHALL treat the command's structured JSON result as the execution result envelope

#### Scenario: Plain Claude exec remains available
- **WHEN** a user explicitly runs plain `ccsm claude exec` outside the status-driven workflow
- **THEN** the documented compatibility behavior SHALL remain valid
- **AND** the skill update SHALL NOT imply that the plain exec path has been removed

### Requirement: Workflow guidance SHALL distinguish completion state from return packet content
Workflow skills and slash-command templates SHALL distinguish monitor terminal state from Claude's implementation return packet content.

#### Scenario: Status-driven result returns completed
- **WHEN** status-driven exec returns JSON with `sessionStatus: completed`
- **THEN** Codex SHALL use that terminal state as evidence that execution finished
- **AND** Codex SHALL inspect `outputs` to find the Execution Return Packet and implementation evidence

#### Scenario: Status-driven result returns error or abandoned
- **WHEN** status-driven exec returns JSON with `sessionStatus: error` or `sessionStatus: abandoned`
- **THEN** Codex SHALL treat execution as failed or incomplete
- **AND** Codex SHALL use available `outputs` only as diagnostic evidence for a rework packet

#### Scenario: Return packet wording appears in templates
- **WHEN** a workflow template requires an Execution Return Packet
- **THEN** the template SHALL describe it as content expected inside structured monitor outputs
- **AND** the template SHALL NOT describe raw terminal text as the authoritative completion signal

### Requirement: Installed skill refresh SHALL cover status-driven guidance
The installer/update flow SHALL make refreshed Codex skill templates available to installed skill locations so users do not keep stale `spec-impl` behavior after updating CCSM.

#### Scenario: CCSM installs Codex-native skills
- **WHEN** the installer copies Codex-native skill templates
- **THEN** the installed `spec-impl` skill SHALL include `--status-driven` in the default dispatch command
- **AND** it SHALL include guidance to review structured JSON monitor results

#### Scenario: CCSM update refreshes workflow assets
- **WHEN** a user updates workflow assets through the supported update path
- **THEN** refreshed Codex-native skill templates SHALL be copied or clearly reported as needing refresh
- **AND** stale installed `spec-impl` guidance SHALL NOT be silently preserved when the update path claims success

### Requirement: Status-driven skill guidance SHALL preserve fallback safety
Status-driven workflow guidance SHALL define safe fallback behavior without allowing silent local implementation.

#### Scenario: Status-driven dispatch cannot start
- **WHEN** `ccsm claude exec --status-driven` cannot start Claude execution or cannot use the required monitor correlation path
- **THEN** Codex SHALL report the implementation cycle as blocked or produce an explicit rework/fallback packet
- **AND** Codex SHALL NOT continue by editing product code locally unless the user explicitly approves that fallback

#### Scenario: Monitor result is unavailable
- **WHEN** status-driven execution cannot produce a correlated monitor result
- **THEN** the skill guidance SHALL instruct Codex to treat the run as blocked or use an explicitly documented compatibility fallback
- **AND** Codex SHALL NOT infer success from raw terminal text alone

