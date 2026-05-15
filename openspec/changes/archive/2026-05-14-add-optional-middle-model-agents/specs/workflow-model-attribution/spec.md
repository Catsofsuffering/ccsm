## MODIFIED Requirements

### Requirement: Workflow attribution SHALL identify optional acceptance-path providers
Workflow analytics and session views SHALL identify optional acceptance-path providers such as `opencode` whenever monitor data contains enough evidence to do so.

#### Scenario: Acceptance reviewer session has concrete provider evidence
- **WHEN** a review or acceptance-assistance session contains concrete model or provider evidence for `opencode`
- **THEN** the monitor SHALL persist the best-known model label for that session
- **AND** Workflow views SHALL display that label instead of collapsing it into `unknown`

#### Scenario: Acceptance-path token usage contains provider evidence
- **WHEN** direct session metadata is incomplete
- **AND** token usage or normalized runtime data includes a concrete acceptance-path provider label
- **THEN** the monitor SHALL backfill the best-known model label from that evidence
- **AND** the resulting model label SHALL remain available to cost and rework analytics

#### Scenario: PI reviewer session has concrete provider evidence
- **WHEN** a review or acceptance-assistance session contains concrete model or provider evidence for `pi`
- **THEN** the monitor SHALL persist the best-known model label for that session
- **AND** Workflow views SHALL display that label instead of collapsing it into `unknown`

#### Scenario: PI token usage contains provider evidence
- **WHEN** direct session metadata is incomplete
- **AND** token usage or normalized runtime data includes a concrete acceptance-path provider label for `pi`
- **THEN** the monitor SHALL backfill the best-known model label from that evidence
- **AND** the resulting model label SHALL remain available to cost and rework analytics

