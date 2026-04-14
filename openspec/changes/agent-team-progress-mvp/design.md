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

The built-in Web UI will become a dashboard that shows run summary cards plus a live task list. Each task panel will display status, dependency information, recent activity, timing, log path, and final result details.

Why this decision:

- The current page only follows the first session and hides parallel progress.
- A dashboard delivers immediate value without adding a separate frontend stack.
- SSE and JSON endpoints already exist, so the UI can stay self-contained in the wrapper.

Alternatives considered:

- Keep the current page and add more text to the single stream.
  Rejected because it still would not communicate per-task state clearly.
- Build a separate external app.
  Rejected because it adds packaging and operational overhead for an MVP.

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
- [The inline HTML dashboard is harder to maintain than a separate frontend] -> Mitigation: keep the page data-driven and focused on monitoring rather than visual complexity.
- [Parallel execution updates may race] -> Mitigation: route all monitoring mutations through the existing server lock and keep state updates explicit.

## Migration Plan

1. Add structured run and task state types in `codeagent-wrapper`.
2. Teach the executor to register tasks, mark lifecycle transitions, and publish result metadata.
3. Persist run snapshots and events to a retained history directory.
4. Replace the single-session page with a multi-task monitoring dashboard and add the supporting JSON/SSE endpoints.
5. Verify state transitions and persisted history through targeted tests.

## Open Questions

- Whether future backend integrations will expose stable teammate identity that can be layered onto the same monitoring model.
- Whether history retention should later move from temp storage to a configurable application data directory.
