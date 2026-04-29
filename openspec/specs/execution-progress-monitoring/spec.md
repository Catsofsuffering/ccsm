## Purpose

Define the durable monitoring surface for maintained execution progress, including hook-driven state collection, the integrated local monitor, and read-only OpenSpec progression views.
## Requirements
### Requirement: The maintained workflow SHALL monitor execution through Claude hook events

The maintained workflow SHALL collect monitoring data from Claude Code hook events rather than from wrapper-owned execution state.

#### Scenario: Claude activity is emitted

- **WHEN** Claude Code emits session, tool-use, or subagent lifecycle hook events
- **THEN** the monitoring system SHALL update the corresponding session, agent, and activity records

#### Scenario: Claude session ends

- **WHEN** Claude Code emits a terminal session event
- **THEN** the monitoring system SHALL mark the session as completed or otherwise terminal according to the received event data

### Requirement: The primary monitor SHALL be delivered as an integrated local service and UI

The maintained monitoring surface SHALL be provided by an integrated local service and web UI instead of relying on `codeagent-wrapper` as the required execution or monitoring boundary.

#### Scenario: User opens the monitor UI

- **WHEN** the local monitor service is running
- **THEN** the user SHALL be able to open a dashboard that shows sessions, agent activity, and recent event history

#### Scenario: Monitoring data changes live

- **WHEN** new hook events are received
- **THEN** the monitor UI SHALL update without requiring a full page reload

### Requirement: Installation SHALL configure the monitor hooks needed by the maintained path

The maintained workflow SHALL configure the Claude hooks required by the integrated monitor during install or update.

#### Scenario: User installs or updates the maintained workflow

- **WHEN** the installer or updater runs
- **THEN** the required Claude hook entries SHALL be present in the active Claude settings without overwriting unrelated settings

#### Scenario: Existing Claude settings are present

- **WHEN** hook configuration is written
- **THEN** existing unrelated Claude settings SHALL be preserved

### Requirement: The monitor SHALL expose OpenSpec change progression read-only

The integrated monitor SHALL provide an OpenSpec board view that summarizes change stage, artifact readiness, and task completion without becoming a second durable source of truth.

#### Scenario: User opens the OpenSpec board

- **WHEN** the repository contains OpenSpec changes and the monitor UI is open
- **THEN** the user SHALL be able to inspect changes grouped by workflow stage with artifact and task summaries

#### Scenario: OpenSpec state cannot be loaded

- **WHEN** the monitor cannot read OpenSpec state from the local workspace
- **THEN** the board SHALL fail read-only with an explanatory empty or error state while the rest of the monitor remains usable

### Requirement: The maintained workflow SHALL monitor Claude Agent Teams through Claude hook events
The system SHALL collect monitoring data for the maintained workflow from Claude Code hook events rather than from wrapper-managed execution state.

#### Scenario: Claude session starts
- **WHEN** Claude Code emits a session start hook event
- **THEN** the monitoring system SHALL register or reactivate the corresponding monitored session

#### Scenario: Claude tools and subagents execute
- **WHEN** Claude Code emits tool-use or subagent lifecycle hook events
- **THEN** the monitoring system SHALL update the corresponding session, agent, and activity records

#### Scenario: Claude session ends
- **WHEN** Claude Code emits a session end hook event
- **THEN** the monitoring system SHALL mark the session as completed or otherwise terminal according to the received event data

### Requirement: The primary monitoring UI SHALL be delivered by an integrated local monitor service
The system SHALL provide the maintained monitoring dashboard through an integrated local service and web UI rather than through the embedded `codeagent-wrapper` page.

#### Scenario: User opens the monitor UI
- **WHEN** the integrated monitor service is running locally
- **THEN** the user SHALL be able to open a dashboard that shows sessions, agent activity, and recent event history

#### Scenario: Monitoring data changes live
- **WHEN** new hook events are received
- **THEN** the monitoring UI SHALL update without requiring a full page reload

### Requirement: Installation SHALL configure Claude hooks for the maintained path
The system SHALL configure the Claude hook entries needed by the integrated monitor during installation or update of the maintained workflow.

#### Scenario: User installs or updates CCG
- **WHEN** the maintained workflow is installed or refreshed
- **THEN** the required Claude hook entries SHALL be present in `~/.claude/settings.json`

#### Scenario: Existing Claude settings are present
- **WHEN** hook configuration is written
- **THEN** existing unrelated Claude settings SHALL be preserved

### Requirement: The maintained primary workflow SHALL not require `codeagent-wrapper`
The maintained Codex -> Claude Agent Teams -> Codex workflow SHALL not depend on `codeagent-wrapper` as its required execution or monitoring boundary.

#### Scenario: User follows the maintained workflow
- **WHEN** the user uses the primary CCG path
- **THEN** execution and monitoring SHALL work without requiring `codeagent-wrapper`

#### Scenario: Product documentation describes the maintained path
- **WHEN** CCG documents the primary workflow
- **THEN** it SHALL describe the Claude hook-based monitor path instead of wrapper-owned monitoring as the required default

### Requirement: The monitoring UI SHALL be implemented as a React frontend using Tailwind CSS and shadcn/ui primitives
The integrated monitor frontend SHALL remain a React application and SHALL use Tailwind CSS tokens plus shadcn/ui-style primitives for shared UI building blocks instead of ad hoc page-specific styling.

#### Scenario: Shared UI primitives are needed
- **WHEN** the monitor frontend needs buttons, inputs, separators, drawers, tables, or similar primitives
- **THEN** the implementation SHALL define or adopt them through a shared Tailwind + shadcn/ui-compatible component layer in `claude-monitor/client`

#### Scenario: Primary monitoring pages are rendered
- **WHEN** the user opens the dashboard, sessions, activity, or session detail pages
- **THEN** those pages SHALL be rendered by the existing React client using the shared Tailwind + shadcn/ui design system rather than bespoke one-off page shells

### Requirement: The monitoring UI SHALL follow a restrained dark editorial visual system
The integrated monitor UI SHALL present a dark, industrial, Japanese magazine-inspired interface with a monochrome palette, one deep-green accent, and at most two font families.

#### Scenario: Color and typography tokens are defined
- **WHEN** the monitor design system defines its visual tokens
- **THEN** it SHALL limit colors to black, white, and gray neutrals plus a single deep-green accent color
- **AND** it SHALL use no more than two font families across the primary interface

#### Scenario: A page section is composed
- **WHEN** a dashboard or detail section is laid out
- **THEN** that section SHALL perform one primary job
- **AND** the page SHALL not introduce multiple competing hero visuals inside the same viewport
- **AND** unnecessary card grids SHALL be avoided in favor of editorial rails, rules, tables, lists, and typographic grouping

### Requirement: The monitoring UI SHALL expose OpenSpec change progression in a board view
The integrated monitor UI SHALL provide an OpenSpec board that groups changes by workflow stage and summarizes artifact readiness and task completion without becoming a second source of truth.

#### Scenario: User opens the OpenSpec board
- **WHEN** the repository contains OpenSpec changes and the monitor UI is open
- **THEN** the user SHALL be able to open a dedicated OpenSpec board page from monitor navigation
- **AND** the page SHALL group changes into workflow-stage columns derived from OpenSpec artifact completion and overall change status

#### Scenario: User inspects a change tile
- **WHEN** a change is rendered on the OpenSpec board
- **THEN** the tile SHALL show the change name, current stage, artifact completion summary, and task completion progress
- **AND** the tile SHALL indicate the next artifact or whether the change is already in implementation/completed state

#### Scenario: OpenSpec state cannot be loaded
- **WHEN** the monitor cannot read OpenSpec state from the local workspace
- **THEN** the OpenSpec board SHALL fail read-only with an explanatory empty or error state
- **AND** the rest of the monitor UI SHALL remain usable

### Requirement: Motion in the monitoring UI SHALL be purposeful and sparse
The integrated monitor frontend SHALL use no more than two or three intentional motion patterns, and those patterns SHALL communicate state changes, page entry, or content disclosure rather than decorative noise.

#### Scenario: Live monitoring state changes
- **WHEN** new hook events arrive or a status transitions in the UI
- **THEN** motion MAY be used to draw attention to the changed item
- **BUT** the motion set SHALL remain limited to purposeful patterns defined by the shared design system

#### Scenario: Reduced-motion preferences are present
- **WHEN** the user's environment requests reduced motion
- **THEN** non-essential animation SHALL be disabled or simplified while preserving usability

### Requirement: The monitor SHALL discover Claude Agent Teams sessions for the launch workspace
The monitoring system SHALL register or reactivate Claude Agent Teams sessions from Claude hook events and associate them with the workspace where `ccsm monitor` was launched or rebound.

#### Scenario: Agent Teams session emits hook events
- **WHEN** Claude Agent Teams execution emits a hook event with a valid `session_id` and project `cwd`
- **THEN** the monitor SHALL create or update the corresponding session record
- **AND** the session SHALL be visible in the monitor for the matching workspace

#### Scenario: Monitor is already running for another workspace
- **WHEN** the user runs `ccsm monitor` from a different OpenSpec workspace while the monitor is healthy
- **THEN** the monitor SHALL update its workspace root to the current OpenSpec workspace
- **AND** subsequent board and session views SHALL reflect that workspace context

### Requirement: Team-agent return updates SHALL be visible in real time
The monitoring system SHALL persist and broadcast team-agent return or mailbox-style updates as soon as they are observed through hook events or transcript-derived output.

#### Scenario: Team agent sends a return message
- **WHEN** a Claude Agent Teams worker emits a return, mailbox, or `SendMessage`-style update
- **THEN** the monitor SHALL store an event associated with the correct session and best-known agent
- **AND** the monitor SHALL broadcast the update over the existing WebSocket channel without waiting for session completion

#### Scenario: Structured Agent Teams tool output is observed
- **WHEN** a Claude hook event contains structured `TeamCreate`, `TaskCreate`, `TaskUpdate`, `SendMessage`, or teammate mailbox payload data
- **THEN** the monitor SHALL parse the structured payload instead of relying only on notification text matching
- **AND** any teammate `summary` or `message` content SHALL be persisted as realtime output for the session
- **AND** the Workflow Live Reader output endpoint SHALL expose that content before `SubagentStop` or `SessionEnd`

#### Scenario: Structured Agent Teams lifecycle event has no teammate output
- **WHEN** a Claude hook event contains `TeamCreate`, `TaskCreate`, or `TaskUpdate` payload data without teammate message text
- **THEN** the monitor MAY record normal lifecycle activity
- **BUT** it SHALL NOT create a fake teammate return output

#### Scenario: Structured teammate output is later observed through a fallback source
- **WHEN** the same teammate message is first observed through structured `SendMessage` or mailbox payload data
- **AND** the same text later appears through `SubagentStop`, `Notification`, or transcript-derived output
- **THEN** the monitor SHALL avoid duplicate visible output entries for the same session and best-known agent

#### Scenario: Subagent completes with final output
- **WHEN** a `SubagentStop` or transcript-derived event includes final teammate output
- **THEN** the monitor SHALL update the relevant agent status and output summary
- **AND** connected monitor clients SHALL receive a live update for the changed event or agent

#### Scenario: Duplicate return signals are observed
- **WHEN** the same teammate return is observed through both hook payload and transcript processing
- **THEN** the monitor SHALL avoid presenting duplicate live return entries for the same session and agent

### Requirement: Existing monitor behavior SHALL remain compatible
The Agent Teams monitoring changes SHALL preserve existing hook-driven sessions, main-agent events, token usage extraction, and live UI refresh behavior.

#### Scenario: Non-Agent Teams Claude session emits hooks
- **WHEN** a normal Claude session emits session, tool-use, notification, or terminal events
- **THEN** the monitor SHALL continue to create sessions, update agents, persist events, and broadcast live updates as before

#### Scenario: OpenSpec state cannot be loaded
- **WHEN** the monitor cannot read OpenSpec state for the current workspace
- **THEN** OpenSpec board views SHALL fail read-only with an explanatory state
- **AND** session and event monitoring SHALL remain usable

### Requirement: Workflow Agent output updates SHALL be visually stable
The Workflow monitor UI SHALL update live Agent output without remounting or flashing the entire live reader region during routine output refreshes.

#### Scenario: New Agent output arrives for the selected Agent
- **WHEN** the Workflow page receives refreshed output for the currently selected Agent
- **THEN** the latest output content SHALL update in place without replaying a full panel entry animation
- **AND** the UI SHALL use only a small localized affordance to indicate the new output

#### Scenario: Existing output refreshes with no selected Agent change
- **WHEN** output data refreshes but the selected session and selected Agent remain the same
- **THEN** the live reader SHALL preserve the selected Agent context
- **AND** it SHALL NOT reset the reader to an empty, loading, or re-entering visual state

#### Scenario: Background refresh starts while output is already visible
- **WHEN** the Workflow Live Reader already has visible Agent output
- **AND** a WebSocket or polling refresh starts a new request for the same session
- **THEN** the existing output SHALL remain visible while the request is in flight
- **AND** the reader SHALL NOT replace the output body with a full loading placeholder
- **AND** any refresh affordance SHALL be local and non-disruptive

### Requirement: Workflow Agent output refreshes SHALL preserve reading position
The Workflow live reader SHALL avoid unexpected scroll jumps during routine output refreshes.

#### Scenario: User is reading previous output
- **WHEN** new Agent output arrives while the user has scrolled away from the bottom of the reader
- **THEN** the reader SHALL preserve the user's scroll position
- **AND** it SHALL surface a non-disruptive indication that newer output is available

#### Scenario: User is following the live tail
- **WHEN** new Agent output arrives while the user is already near the bottom of the reader
- **THEN** the reader MAY keep the latest output in view
- **AND** it SHALL avoid abrupt jump or full-region flash behavior

### Requirement: Workflow update motion SHALL respect reduced-motion preferences
The Workflow live reader SHALL make new output affordances reduced-motion aware.

#### Scenario: Reduced motion is requested
- **WHEN** the user's environment requests reduced motion
- **THEN** non-essential output update animation SHALL be disabled or simplified
- **AND** the update shall remain understandable through static visual state

#### Scenario: Motion is allowed
- **WHEN** reduced motion is not requested
- **THEN** any output update motion SHALL remain localized to the changed output indicator or border treatment
- **AND** it SHALL NOT animate unrelated Workflow panels or the whole page shell

### Requirement: Runtime events SHALL normalize into the monitor execution model
The maintained workflow SHALL collect execution progress from Claude hook events and optional runtime adapter events, then normalize supported events into the same monitor session, agent, event, token/model, and output model.

#### Scenario: Claude hook activity is emitted
- **WHEN** Claude Code emits session, tool-use, Agent Teams, or subagent lifecycle hook events
- **THEN** the monitoring system SHALL update the corresponding session, agent, activity, token, and output records as before

#### Scenario: ACP runtime activity is observed
- **WHEN** an optional ACP adapter provides supported session, lifecycle, tool/action, output, or model metadata
- **THEN** the monitor SHALL normalize the activity into the existing session, agent, event, and output APIs
- **AND** it SHALL preserve ACP source metadata in the stored event data

#### Scenario: Unsupported ACP payload is observed
- **WHEN** ACP runtime data does not match a supported normalized shape
- **THEN** the monitor SHALL retain safe diagnostic metadata where practical
- **AND** it SHALL NOT corrupt hook-driven session state

### Requirement: Duplicate runtime observations SHALL be suppressed
The monitor SHALL avoid presenting duplicate user-facing sessions or output entries when the same execution is observed through more than one runtime source.

#### Scenario: Hook and ACP data describe the same run
- **WHEN** hook and ACP events carry the same run id, session id, transcript path, or equivalent correlation metadata
- **THEN** the monitor SHALL associate them with one monitor session where practical
- **AND** event data SHALL record each source without duplicating equivalent output entries

#### Scenario: Correlation is unavailable
- **WHEN** two runtime sources cannot be confidently correlated
- **THEN** the monitor SHALL keep source metadata explicit
- **AND** it SHALL avoid destructive merging or guessed identity

### Requirement: Existing hook-driven monitoring SHALL remain compatible with optional runtimes
Adding optional runtime adapter events SHALL preserve existing hook-driven monitoring behavior.

#### Scenario: Non-ACP Claude session emits hooks
- **WHEN** a normal Claude or Agent Teams session emits hook events
- **THEN** the monitor SHALL continue to create sessions, update agents, persist events, extract token usage, expose outputs, and broadcast live updates as before

#### Scenario: ACP is absent
- **WHEN** no ACP adapter is installed or configured
- **THEN** execution progress monitoring SHALL continue through Claude hooks without degraded default behavior
