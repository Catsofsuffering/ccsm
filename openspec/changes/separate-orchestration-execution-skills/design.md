## Context

CCSM already persists workflow ownership in config:

- `ownership.orchestrator`
- `ownership.executionHost`
- `ownership.acceptance`

The installer currently uses that ownership to choose the command host home, but Codex-native workflow skill installation remains hard-coded to `codexHomeDir`. Shared CCSM skills are copied into the canonical `~/.ccsm/skills/ccsm/` runtime surface, and generated command summaries still describe "Codex workflow skills" as a fixed destination.

The monitor sidebar already exposes active OpenSpec workspace information and selectable project roots. The current collapsed and expanded labels rely primarily on a path basename such as `Project: ccs`, which is not enough when multiple Git worktrees share a repository identity or similar basename.

`spec-impl` already says Codex owns acceptance and archive decisions. The missing contract is more specific: Claude/execution workers must not mutate OpenSpec task state or run the `spec-review` acceptance gate while executing a bounded implementation packet.

## Decisions

### 1. Skill Role Routing

Introduce explicit CCSM skill roles:

- `orchestration`: workflow control-plane skills that create/advance OpenSpec artifacts, dispatch execution, perform review, or decide archive readiness.
- `execution`: downstream worker skills or guidance used by the configured execution host while implementing a bounded packet.
- `shared`: reusable canonical CCSM skills that remain under `~/.ccsm/skills/ccsm/` and can be bridged into host commands without becoming a host-owned workflow control plane.

The top-level `spec-*` workflow skills are orchestration skills. With the default Codex-led setup they continue to install into `~/.codex/skills/`. If a compatibility setup selects Claude as orchestrator, those orchestration skills install into the configured orchestration host instead of remaining hard-coded to Codex.

Execution skills should be routed to `ownership.executionHost`. This change should add the routing mechanism and summary language even if the current repository has few or no dedicated execution-skill templates yet.

### 2. Compatibility And Conflict Handling

Managed skill markers must remain host-specific. Existing managed Codex skills can be refreshed or removed by CCSM, but user-owned skills with the same names must still be treated as conflicts.

Migration should be conservative:

- New installs route skills according to ownership.
- Updates refresh managed skills in the correct role destination.
- Misplaced managed skills from older installs may be removed or reported when the correct destination is installed successfully.
- User-owned conflicting skills must not be overwritten.

### 3. Worktree Identity In Sidebar

The monitor should render a distinct worktree identity alongside project identity. The display should prefer bounded local evidence:

1. explicit selectable-project label if present,
2. worktree path basename and branch metadata when available,
3. normalized workspace root/path fallback.

The first implementation should not redesign monitor navigation. It should add a stable short label and root/path detail that make two worktrees visually distinguishable in the sidebar and project selector.

If branch metadata is not already exposed by the server, the UI can still distinguish worktrees by showing both a project label and a concise root label/path. Broader Git metadata discovery can be added only if bounded and tested.

### 4. `spec-impl` Worker Boundary

`spec-impl` must tell Claude Agent Teams:

- implement only within the allowed paths from the packet,
- return implementation evidence to Codex,
- do not run `spec-review`,
- do not edit `openspec/changes/**/tasks.md`,
- do not mark tasks complete,
- do not archive or make acceptance decisions.

Codex remains the actor that writes or updates task checkboxes during acceptance. Codex may add acceptance/E2E tests and run verification after Claude execution returns.

## Execution Handoff Contract

### Execution Goal

Implement role-aware CCSM skill installation, worktree-distinct monitor sidebar identity, and stricter `spec-impl` execution-worker boundaries for change `separate-orchestration-execution-skills`.

### Allowed Surface

- `src/utils/installer.ts`
- `src/utils/identity.ts`
- `src/utils/config.ts`
- `src/types/index.ts`
- `src/commands/init.ts`
- `src/commands/update.ts`
- `src/commands/menu.ts`
- `src/utils/__tests__/**/*.ts`
- `src/commands/__tests__/**/*.ts`
- `templates/codex-skills/spec-impl/SKILL.md`
- `templates/commands/spec-impl.md`
- `templates/commands/team-exec.md`
- `templates/commands/team-review.md`
- `claude-monitor/client/src/components/Sidebar.tsx`
- `claude-monitor/client/src/components/__tests__/Sidebar.test.tsx`
- `claude-monitor/client/src/lib/types.ts`
- `claude-monitor/server/lib/openspec-state.js`
- `claude-monitor/server/routes/settings.js`
- `claude-monitor/server/**/__tests__/*.js`
- `README.md`
- `README.zh-CN.md`
- `AGENTS.md`

### Protected Surface

- Do not change package name, binary name, or canonical namespace.
- Do not remove compatibility aliases or legacy migration inputs.
- Do not change OpenSpec archive state.
- Do not edit `openspec/changes/separate-orchestration-execution-skills/tasks.md`; Codex owns task state.
- Do not run `spec-review` from Claude or claim acceptance/archive readiness.
- Do not redesign monitor navigation beyond worktree identity cues.

### Worker Topology

Use Claude Agent Teams because the work spans installer/config logic, frontend monitor display, workflow template text, and documentation. Recommended split:

- Installer worker: role metadata, routing, install/update/uninstall tests.
- Monitor worker: sidebar worktree identity and UI tests.
- Template/docs worker: `spec-impl` worker-boundary language and docs.

Each worker must report changed files, tests run, and any blockers through the team lead. The team lead must produce one Execution Return Packet.

### Codex-Owned Verification

Codex will add or adjust acceptance/E2E-style tests after Claude returns if the implementation does not already provide enough coverage. Required verification:

- `pnpm test -- src/utils/__tests__/installer.test.ts`
- `pnpm test -- src/commands/__tests__` when command summaries change
- `npm --prefix claude-monitor/client run test -- Sidebar`
- `pnpm typecheck`
- `openspec validate separate-orchestration-execution-skills --strict`

### Rework Triggers

- Orchestration skills still install only to `codexHomeDir` regardless of configured orchestrator.
- Execution skill routing is absent or undocumented.
- User-owned skill conflicts can be overwritten.
- Sidebar cannot distinguish two worktrees with similar project identity.
- `spec-impl` allows Claude/execution workers to run `spec-review`, edit task state, or decide archive readiness.
- Tests only check strings without proving install destination behavior.
