## Why

CCSM's primary story is now Codex-orchestrated and Claude-executed, but the installed skill surface still treats Codex and Claude skill placement as mostly fixed host paths. This makes it too easy to install orchestration skills on the execution side, or execution-only guidance on the orchestration side, even though the workflow ownership model depends on keeping those responsibilities separate.

Worktree handling also needs a clearer operator surface. Multiple worktrees can currently appear too similar in the monitor/sidebar context, so users cannot reliably tell which worktree they are inspecting or operating from at a glance.

`spec-impl` is an orchestration skill. Its current guidance says Codex controls acceptance, but it should more explicitly prevent execution workers from running `spec-review`, marking OpenSpec tasks complete, or otherwise changing the source-of-truth task state while they are only executing a bounded packet.

## What Changes

- Introduce a first-class distinction between orchestration skills and execution skills in CCSM skill metadata, installer logic, update logic, and generated guidance.
- Install orchestration skills only to the configured orchestration host, and install execution skills only to the configured execution host.
- Preserve compatibility for existing installs while making new installs and updates follow the configured ownership metadata instead of hard-coded Codex/Claude destinations.
- Update user-facing summaries and documentation so users can see which host receives each skill class.
- Improve worktree display identity in the monitor/sidebar so different worktrees are visibly distinguishable even when they belong to the same repository or OpenSpec project.
- Strengthen `spec-impl` guidance and execution packet constraints so Claude/execution workers must return implementation evidence to Codex instead of running `spec-review`, editing OpenSpec `tasks.md`, or changing acceptance/archive state.

## Capabilities

### Modified Capabilities

- `ccgs-command-and-skill-surface`: Skill installation must represent orchestration and execution roles explicitly instead of treating the top-level Codex workflow skill set as the only host-specific skill surface.
- `codex-workflow-orchestration`: Codex remains responsible for artifact progression, task state, review, acceptance, and archive decisions.
- `spec-impl-default-dispatch`: `spec-impl` remains dispatch-first, but its worker boundary must prohibit execution-side review/task mutation.
- `ccsm-runtime-layout`: Installed skill paths must follow configured host ownership while preserving maintained CCSM runtime assets.
- `execution-progress-monitoring` / `monitor-project-selection`: Monitor/sidebar identity must distinguish selected worktree context clearly.

### New Capability Candidate

- `workflow-skill-role-routing`: The installer, updater, and generated guidance classify CCSM skills by workflow role and route each class to the correct host.

## Impact

- Installer and updater paths that copy `templates/codex-skills/`, Claude-facing skills, and shared CCSM skill assets.
- Config ownership metadata for orchestrator, execution host, and acceptance owner.
- Install/uninstall conflict detection for host-specific skills.
- `templates/codex-skills/spec-impl/SKILL.md` and any slash-command templates that dispatch Claude execution packets.
- Monitor/sidebar components and tests that render workspace/project/worktree labels.
- README, README.zh-CN, AGENTS, and install summary language where skill destinations and workflow ownership are described.

## Non-goals

- Do not replace Claude Agent Teams as the default execution layer for Codex-led `spec-impl`.
- Do not allow execution workers to become a second OpenSpec control plane.
- Do not redesign the full monitor navigation or visual system beyond the identity cues needed to distinguish worktrees.
- Do not remove compatibility paths for existing installations in the same change.

## Open Questions

- Whether execution skills should live under Claude's native skill surface, CCSM's maintained `~/.ccsm/skills/ccsm/` surface, or both with explicit ownership markers.
- Which persisted worktree identity should be canonical for display: git branch, worktree path basename, OpenSpec workspace root, or an explicit CCSM label.
- Whether the installer should migrate existing misplaced skills automatically or report a guided repair step first.
