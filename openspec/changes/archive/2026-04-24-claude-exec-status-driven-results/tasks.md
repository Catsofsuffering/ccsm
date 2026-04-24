## 1. Run Correlation

- [x] 1.1 Add tests for generating a unique CCSM run id per monitored `ccsm claude exec` invocation.
- [x] 1.2 Pass the run id and workspace metadata through the Claude launch environment without breaking existing env construction.
- [x] 1.3 Add or reuse monitor ingestion support so sessions can be looked up deterministically by run id or persisted metadata.
- [x] 1.4 Add tests proving concurrent exec invocations do not select sessions by newest timestamp alone.

## 2. Status Polling And Completion

- [x] 2.1 Add a focused monitor client/polling helper for health checks, session lookup, terminal-state waiting, and timeout handling.
- [x] 2.2 Treat `completed`, `error`, and `abandoned` as terminal session states for status-driven exec.
- [x] 2.3 Continue polling for a bounded grace period when the Claude child process exits before monitor terminal state arrives.
- [x] 2.4 Add tests for successful completion, error completion, process-exit-before-hook-close, and timeout cases.

## 3. Structured Result Retrieval

- [x] 3.1 Fetch final outputs from the correlated monitor session after terminal state.
- [x] 3.2 Preserve multi-agent output structure by default, including agent id, latest output, timestamps, source metadata, and output counts.
- [x] 3.3 Define CLI output behavior for human-readable and machine-readable modes if the existing command surface needs both.
- [x] 3.4 Add tests for multi-agent outputs and fallback hook-derived outputs.

## 4. Compatibility And User Surface

- [x] 4.1 Preserve current process-exit behavior when monitor status tracking is disabled or unavailable in compatible mode.
- [x] 4.2 Add a clear strict-mode failure path if strict status monitoring cannot find a correlated session.
- [x] 4.3 Preserve existing Claude args, prompt handling, stdio behavior, and `--disable-agent-teams` behavior.
- [x] 4.4 Update CLI help or README documentation for status-driven completion and fallback behavior.

## 5. Verification

- [x] 5.1 Run targeted tests for changed CLI and monitor utility modules.
- [x] 5.2 Run targeted monitor server tests if monitor routes, hooks, or schema are changed.
- [x] 5.3 Run `pnpm typecheck`.
- [x] 5.4 Run `pnpm build`.
- [x] 5.5 Run `pnpm test` or document any unrelated pre-existing failures.