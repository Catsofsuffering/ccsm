# workflow-model-attribution Specification

## Purpose
TBD - created by archiving change enhance-monitor-project-selection-shutdown. Update Purpose after archive.
## Requirements
### Requirement: Workflow sessions SHALL show the best-known model label
Workflow analytics and session complexity views SHALL identify the concrete model used by a session whenever monitor data contains enough evidence.

#### Scenario: Hook payload includes a model
- **WHEN** a session is created or updated from hook data with a non-empty model that is not `unknown`
- **THEN** the monitor SHALL persist that model as the session model
- **AND** Workflow views SHALL display that model for the session

#### Scenario: Transcript token usage includes model data
- **WHEN** hook data omits a concrete model
- **AND** transcript extraction records one or more concrete `token_usage.model` rows for the session
- **THEN** the monitor SHALL backfill the session model from the best-known token usage model
- **AND** Workflow views SHALL display the backfilled model instead of `unknown`

#### Scenario: Multiple token models are present
- **WHEN** a session has token usage rows for multiple concrete models
- **THEN** the session-level display model SHALL be selected deterministically from the model with the largest effective token total
- **AND** per-model token usage rows SHALL remain available for cost and token breakdowns

### Requirement: Workflow model attribution SHALL preserve uncertainty
The monitor SHALL avoid inventing a model label when no reliable model evidence exists.

#### Scenario: No model evidence exists
- **WHEN** a session has no concrete hook model, transcript token model, or supported metadata/runtime model hint
- **THEN** the session model MAY remain null or `unknown`
- **AND** Workflow SHALL make that uncertainty visible without assigning a guessed provider

#### Scenario: Existing model is more specific than new evidence
- **WHEN** a session already has a concrete model
- **AND** a later hook or metadata update only provides an empty or `unknown` model
- **THEN** the monitor SHALL keep the existing concrete model

### Requirement: Model labels SHALL be consistent across Workflow aggregates
Workflow model delegation and session complexity SHALL use the same best-known model resolution rule.

#### Scenario: Workflow aggregates model delegation
- **WHEN** Workflow calculates main model and subagent model counts
- **THEN** it SHALL group by the best-known model for each session
- **AND** it SHALL not group sessions under `unknown` when concrete token usage model data exists

#### Scenario: Workflow lists session complexity
- **WHEN** Workflow returns session complexity rows
- **THEN** each row SHALL include the same best-known session model that model delegation would use for that session
