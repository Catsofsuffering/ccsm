## ADDED Requirements

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
