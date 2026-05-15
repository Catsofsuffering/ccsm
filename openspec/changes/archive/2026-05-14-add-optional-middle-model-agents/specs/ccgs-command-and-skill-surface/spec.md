## MODIFIED Requirements

### Requirement: Workflow guidance SHALL describe configurable acceptance topology
The maintained command and skill surface SHALL describe acceptance topology separately from execution topology so users can understand optional reviewer participation without losing the maintained orchestration story.

#### Scenario: User reads maintained workflow guidance
- **WHEN** generated setup guidance, command help, or skill text describes workflow responsibilities
- **THEN** it SHALL distinguish orchestration, execution, and optional acceptance-review roles
- **AND** it SHALL keep the maintained default story anchored in a Codex-led orchestration path

#### Scenario: User reads optional acceptance-review guidance
- **WHEN** the product describes an optional reviewer such as `opencode`
- **THEN** the guidance SHALL present that reviewer as an additive acceptance-path participant
- **AND** it SHALL not imply that the reviewer replaces the default orchestrator-owned final safety boundary

#### Scenario: User reads middle-model layer guidance
- **WHEN** installation or generated workflow guidance describes the optional middle-model agent layer
- **THEN** it SHALL explain whether that layer is enabled or disabled independently from the default execution path
- **AND** it SHALL present supported providers such as `opencode` and `pi` as same-class optional reviewer participants

