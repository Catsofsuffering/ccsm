## Context

`codeagent-wrapper` already has the ingredients for a useful monitoring system:

- task IDs and dependency graphs in parallel mode
- real-time parser callbacks for messages, reasoning, commands, and compact progress lines
- a short-lived Web UI backed by SSE
- task results with exit code, log path, changed files, and test counts

What it lacks is a first-class execution model. The current Web UI treats monitoring as a text stream tied to the first available session, so it cannot answer the operational questions users actually ask:

- What is running right now?
- Which work package is blocked?
- What already completed or failed?
- Where can I inspect the run after it finishes?

The backend also does not expose stable Claude Agent Teams teammate identifiers through the wrapper today. Because of that, the MVP should monitor wrapper-known execution units such as task IDs and work packages instead of inventing fake teammate precision.

## Goals / Non-Goals

**Goals:**

- Add a structured run/session/task state model inside `codeagent-wrapper`.
- Surface multi-task live monitoring in the built-in Web UI.
- Track task lifecycle changes for parallel execution, including blocked states caused by failed dependencies.
- Persist run state and event history beyond process exit.
- Reuse existing parser and executor knowledge rather than depending on new backend protocol support.

**Non-Goals:**

- Reverse-engineering exact Claude Agent Teams teammate identity when the backend does not expose it.
- Building a terminal TUI in this MVP.
- Creating a long-term database service or external monitoring backend.
- Replacing existing textual output summaries printed to stdout/stderr.

## Decisions

### Decision: Monitor wrapper-managed tasks as the primary execution unit

The MVP will model progress around wrapper-known tasks and work packages. A task is the strongest execution unit the wrapper can identify reliably because it already has `TaskSpec.ID`, dependency edges, log paths, and final result metadata.

Why this decision:

- The executor already knows task IDs and dependency failures.
- Task-level state is reliable for Codex-dispatched work packages.
- Claude teammate identity is not consistently available from current backend events.

Alternatives considered:

- Infer teammate identity from free-form output text.
  Rejected because it is brittle and would mislead users.
- Wait for backend-native teammate events before shipping monitoring.
  Rejected because the wrapper can already provide meaningful progress with existing signals.

### Decision: Replace the single-session Web UI with a run dashboard

The built-in Web UI will become a dashboard that shows run summary cards plus a live task list. Each task panel will display status, dependency information, recent activity, timing, log path, and final result details. The dashboard should move out of an inline HTML string and into a dedicated frontend bundle embedded into the wrapper binary.

Why this decision:

- The current page only follows the first session and hides parallel progress.
- The current inline page in `codeagent-wrapper/server.go` is already becoming too large and brittle to evolve safely.
- AgentField demonstrates a maintainable pattern for a Go-served, embedded React/Vite UI that we can adapt without adopting its whole product.
- SSE and JSON endpoints already exist, so the UI can stay self-contained in the wrapper even when the frontend is built separately.

Alternatives considered:

- Keep the current page and add more text to the single stream.
  Rejected because it still would not communicate per-task state clearly.
- Build a separate external app that is deployed independently from the wrapper.
  Rejected because it adds packaging and operational overhead and breaks the current single-binary experience.

### Decision: Use AgentField as a frontend reference and partial donor, not a drop-in control plane

The implementation will use the cloned upstream repository at `B:\project\agentfield` as a reference frontend. We will selectively borrow structure, build tooling, and monitor-oriented interaction patterns from `control-plane/web/client`, while keeping CCG's monitoring backend, endpoints, and run model.

Why this decision:

- `AgentField` already ships an embedded React/Vite frontend through Go `embed`, which solves the maintainability problem better than continuing to grow inline HTML.
- The upstream dashboard, page shell, SSE hooks, and component organization are more production-grade than the current wrapper page and provide a strong base for a CCG-specific monitoring UI.
- A full drop-in reuse is not realistic because AgentField expects `/api/ui/v1/*`, API-key auth, many control-plane resources, and domain models that do not exist in `codeagent-wrapper`.

Alternatives considered:

- Rebuild a brand-new monitoring frontend without using AgentField as a reference.
  Rejected because it discards a strong starting point and increases design churn.
- Attempt a near-direct transplant of the full AgentField frontend.
  Rejected because the API/auth/product mismatch is too large and would force unnecessary backend scope expansion.

### Decision: Persist run snapshots and event history in wrapper-owned temp storage

The wrapper will write a run directory under temp storage that contains a summary snapshot and append-only event history. Monitoring history will survive process exit even if transient debug logs are cleaned up separately.

Why this decision:

- Current runtime logs are treated as temporary diagnostics and are deleted on normal exit.
- Users need retained execution history for post-run inspection.
- Temp storage keeps the MVP self-contained and avoids introducing a new service dependency.

Alternatives considered:

- Reuse existing logger files as the history system.
  Rejected because logger lifecycle and cleanup behavior are optimized for diagnostics, not retained monitoring records.
- Store history only in memory.
  Rejected because it disappears when the wrapper exits.

### Decision: Task status changes should come from executor state, not parsed guesswork

Pending, running, blocked, completed, and failed task states will be driven by executor events. Parser callbacks will enrich activity text and command/message history, but lifecycle truth will come from the executor.

Why this decision:

- The executor knows when a task starts, when dependency failures cause a block, and when a final result arrives.
- Parsed text is useful context but not authoritative lifecycle state.
- This keeps summary statistics deterministic.

Alternatives considered:

- Derive status only from progress lines or message content.
  Rejected because message timing is not a reliable representation of task state.

## Risks / Trade-offs

- [Task-level monitoring is less precise than real teammate-level monitoring] -> Mitigation: document the MVP boundary and name the monitored units as tasks/work packages.
- [Persisted history in temp storage can accumulate over time] -> Mitigation: keep files compact and scope this MVP to retained local history; cleanup policy can be added later.
- [A dedicated frontend bundle adds Node/Vite build complexity to a Go wrapper] -> Mitigation: keep the frontend scope narrow, embed production assets into the binary, and reuse AgentField's proven build pattern rather than inventing a custom pipeline.
- [AgentField-inspired reuse could accidentally expand the project into a control-plane clone] -> Mitigation: explicitly constrain allowed surfaces to monitoring pages and wrapper-owned APIs only.
- [Parallel execution updates may race] -> Mitigation: route all monitoring mutations through the existing server lock and keep state updates explicit.

## Migration Plan

1. Add structured run and task state types in `codeagent-wrapper`.
2. Teach the executor to register tasks, mark lifecycle transitions, and publish result metadata.
3. Persist run snapshots and events to a retained history directory.
4. Replace the single-session page with an embedded frontend bundle that renders a multi-task monitoring dashboard against the existing monitoring endpoints.
5. Verify state transitions, embedded asset serving, and frontend behavior through targeted tests.

## Open Questions

- Whether future backend integrations will expose stable teammate identity that can be layered onto the same monitoring model.
- Whether history retention should later move from temp storage to a configurable application data directory.

## Execution Handoff Contract

### Execution Goal

Replace the current inline monitoring page with an embedded, AgentField-inspired frontend for `codeagent-wrapper` while preserving the wrapper's existing monitoring semantics and bounded single-binary delivery.

### Upstream Reference

- Cloned repository: `B:\project\agentfield`
- Relevant upstream surfaces inspected: `control-plane/web/client`, `control-plane/internal/embedded/ui.go`, `control-plane/README.md`
- Key finding: upstream is a React 19 + Vite + TypeScript SPA embedded into Go binaries, but it targets `/api/ui/v1/*`, API-key auth, and broader control-plane domain models that CCG must not import wholesale.

### Allowed Change Surface

- `codeagent-wrapper/server.go` and monitoring HTTP route wiring
- `codeagent-wrapper/monitoring.go` and closely related monitoring DTOs only if the frontend needs small additive fields
- New frontend workspace under `codeagent-wrapper` for bundled UI assets and build configuration
- Wrapper-side embedded asset serving code and frontend-aware tests
- Build/test scripts needed to produce and verify the embedded monitoring UI

### Protected Surface

- Root CLI/install workflow outside what is strictly needed to build or package the wrapper UI
- Backend selection, task execution semantics, parser meaning, and non-monitoring runtime behavior
- OpenSpec changes unrelated to `agent-team-progress-mvp`
- Any attempt to introduce AgentField control-plane resources, auth flows, database assumptions, or non-monitoring pages into CCG

### Work Packages

1. Create the dedicated monitoring frontend foundation inside `codeagent-wrapper`, using AgentField's React/Vite embedding pattern as the baseline.
2. Implement a thin CCG-specific data layer for `/api/state`, `/api/sessions`, `/api/events`, and `/api/stream/:sessionID` without expanding the backend into AgentField API shapes.
3. Build the monitoring dashboard shell, summary cards, task list, event/activity views, and responsive layout, borrowing patterns from AgentField where useful.
4. Replace inline HTML serving with embedded static asset serving while keeping the same browser entrypoint behavior for users.
5. Add frontend and wrapper verification for build, rendering, SSE updates, and embedded asset delivery.

### Required Verification

- Frontend production build succeeds inside the new monitoring UI workspace
- Frontend tests cover initial snapshot rendering and at least one live update path from monitoring events
- Wrapper tests cover monitoring API compatibility and embedded asset serving
- `go test ./...` passes in `codeagent-wrapper`
- Any new JS/TS lint or test command added for the monitoring frontend is run and recorded in the return packet

### Rework Triggers

- The proposed frontend requires new backend concepts beyond task/session monitoring to render core screens
- The implementation attempts to introduce AgentField auth, control-plane navigation, or non-monitoring entities into the wrapper
- The embedded asset approach breaks the existing one-command local user flow or requires a separately hosted web app
- Frontend state management depends on polling-only behavior when the existing SSE stream can satisfy the view

### Exact Bounded Packet For `ccg-spec-impl`

- Change id: `agent-team-progress-mvp`
- Execution goal: adopt an AgentField-inspired embedded monitoring frontend for `codeagent-wrapper`, replacing inline HTML while keeping wrapper-owned monitoring APIs and single-binary delivery
- Allowed boundaries: wrapper monitoring routes/DTOs, new `codeagent-wrapper` frontend workspace, embedded asset serving code, related tests/build scripts
- Protected boundaries: root product workflow/installer surfaces, backend execution semantics, AgentField auth/control-plane pages, unrelated OpenSpec changes
- Required verification: frontend build/test, wrapper API/asset tests, `go test ./...` in `codeagent-wrapper`
- Next skill: `ccg-spec-impl`
