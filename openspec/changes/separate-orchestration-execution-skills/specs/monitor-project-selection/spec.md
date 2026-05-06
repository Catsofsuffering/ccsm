## ADDED Requirements

### Requirement: Monitor sidebar SHALL distinguish worktree context

The monitor sidebar SHALL make different Git worktrees visually distinguishable when they resolve to the same repository or similar OpenSpec project identity.

#### Scenario: User views one of multiple worktrees

- **WHEN** the active OpenSpec workspace root is inside a Git worktree
- **THEN** the sidebar SHALL show a concise worktree identity in addition to the project label
- **AND** the full root path SHALL remain available in expanded sidebar detail or tooltip text

#### Scenario: Multiple selectable roots share the same basename

- **WHEN** selectable project roots would produce the same short project label
- **THEN** the project selector SHALL include enough root or worktree detail to distinguish the choices
- **AND** it SHALL indicate the currently active root

#### Scenario: Git branch metadata is unavailable

- **WHEN** the monitor cannot determine a branch or explicit worktree label from bounded local evidence
- **THEN** it SHALL fall back to a stable root/path-derived label
- **AND** it SHALL NOT scan broad filesystem trees to invent worktree metadata
