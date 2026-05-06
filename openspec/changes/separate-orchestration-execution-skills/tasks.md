## 1. Skill Role Routing

- [x] 1.1 Add role metadata/types for CCSM skill installation (`orchestration`, `execution`, `shared`) without changing package or command namespace identity.
- [x] 1.2 Route top-level `spec-*` orchestration skills to the configured orchestrator host instead of hard-coding Codex as the destination.
- [x] 1.3 Add execution-skill routing support for the configured execution host, even if the initial execution template set is empty or minimal.
- [x] 1.4 Preserve managed-skill refresh and user-owned conflict protection for every role-routed host destination.
- [x] 1.5 Update install/update summaries to show role, host, and destination path for installed workflow skills.

## 2. Worktree Sidebar Identity

- [x] 2.1 Extend monitor workspace/project data or UI helpers so the sidebar can render a distinct worktree label for the active root.
- [x] 2.2 Update the sidebar project selector so roots with similar labels remain distinguishable.
- [x] 2.3 Preserve current project switching behavior, active-root indication, and expanded root detail.
- [x] 2.4 Avoid broad filesystem scanning; use active workspace settings, selectable roots, root paths, and bounded Git metadata only if already local and cheap.

## 3. `spec-impl` Worker Boundary

- [x] 3.1 Update `templates/codex-skills/spec-impl/SKILL.md` so execution workers are explicitly forbidden from running `spec-review`, editing active change `tasks.md`, marking tasks complete, archiving, or deciding acceptance.
- [x] 3.2 Update dispatch/slash templates that describe Claude execution packets with the same worker boundary.
- [x] 3.3 Ensure generated guidance tells workers to report task/spec inconsistencies in the return packet instead of mutating OpenSpec source-of-truth artifacts.

## 4. Documentation

- [x] 4.1 Update README and README.zh-CN to describe orchestration skills versus execution skills and their host destinations.
- [x] 4.2 Update AGENTS.md if product story, contributor rules, or command/skill ownership language changes.
- [x] 4.3 Document the worktree identity cue in monitor/sidebar guidance if the README already describes monitor project selection.

## 5. Codex-Owned Acceptance Tests And Verification

- [x] 5.1 Add/adjust installer tests proving orchestration skills route to the configured orchestrator host and do not overwrite user-owned conflicts.
- [x] 5.2 Add/adjust tests proving execution skill routing is represented in install results or summaries.
- [x] 5.3 Add/adjust monitor client tests proving two worktree roots with similar labels are visually distinguishable.
- [x] 5.4 Add/adjust template tests proving `spec-impl` guidance forbids execution-worker `spec-review` and task mutation.
- [x] 5.5 Run `pnpm test -- src/utils/__tests__/installer.test.ts`.
- [x] 5.6 Run monitor sidebar tests.
- [x] 5.7 Run `pnpm typecheck`.
- [x] 5.8 Run `openspec validate separate-orchestration-execution-skills --strict`.

## 6. Review Boundary

- [x] 6.1 Codex reviews Claude's execution return packet and current diff.
- [x] 6.2 Codex updates this task list only after verification evidence is available.
- [x] 6.3 Keep the change active; do not archive in this implementation cycle.
