## Purpose

Define the durable execution-graph behavior for live orchestration, including dynamic DAG generation, operator interaction, and real-time progress updates.

## Requirements

### Requirement: The execution DAG SHALL be generated from live orchestration state

The control plane SHALL generate its execution DAG from current facts, intents, hints, worker results, and operator actions rather than from a static predefined graph.

#### Scenario: New fact changes execution options

- **WHEN** a worker or operator introduces a fact that changes the plan
- **THEN** the DAG SHALL update to reflect the new state

#### Scenario: Branch is no longer viable

- **WHEN** a node or branch becomes blocked, invalid, or completed
- **THEN** the DAG SHALL update node state and downstream readiness accordingly

### Requirement: The DAG SHALL be a first-class interactive workspace

The monitor-derived frontend SHALL present the execution DAG as a dedicated interactive workspace for the selected project or session.

#### Scenario: Operator opens the DAG workspace

- **WHEN** the user navigates to the DAG surface
- **THEN** the UI SHALL render the current graph, node states, and node relationships

#### Scenario: Operator inspects a node

- **WHEN** the user selects a node
- **THEN** the UI SHALL display node detail, execution status, worker assignment, and related logs or outputs

### Requirement: Bounded intervention actions SHALL not silently change orchestration semantics

The DAG workspace SHALL allow layout and intervention actions without silently corrupting durable orchestration meaning.

#### Scenario: Operator rearranges layout

- **WHEN** the user drags a node to a new visual position
- **THEN** the UI SHALL persist or remember the layout separately from durable OpenSpec artifact state

#### Scenario: Operator changes execution preference

- **WHEN** the user performs an explicit scheduling or dependency adjustment action
- **THEN** the system SHALL record it as an intentional orchestration intervention rather than treating all drag events as semantic edits

### Requirement: The DAG SHALL reflect real-time execution progress

The execution DAG workspace SHALL update in response to runtime changes without requiring a full page reload.

#### Scenario: Worker state changes

- **WHEN** a worker node starts, completes, fails, or is reopened
- **THEN** the corresponding DAG node SHALL update its state through the live control-plane channel
