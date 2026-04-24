## Why

`ccsm claude exec` currently behaves like a direct Claude CLI wrapper: it starts a Claude process and waits for process completion or returned text. In the Codex-led CCSM workflow, that makes the CLI dependent on terminal output shape even though the maintained monitor already tracks session lifecycle, agent state, transcripts, and extracted outputs.

For Agent Teams execution, the more reliable contract is status-driven: the CLI should know which monitored execution it launched, wait for that monitored session to reach a terminal state, and then let Codex or the calling model fetch structured outputs from the monitor for review and acceptance.

## What Changes

- Add a status-driven result mode for `ccsm claude exec` that binds each launched execution to a monitor session/run identifier.
- Have the CLI detect completion from monitor session state instead of treating returned text as the primary completion signal.
- Fetch final structured outputs from the monitor after the session reaches a terminal state.
- Preserve the existing Claude process fallback path for monitor-unavailable or explicitly disabled status monitoring cases.
- Keep Codex as the owner of final interpretation, acceptance, and archive decisions.

## Capabilities

### New Capabilities

- `claude-exec-status-results`: Claude execution may complete through monitor-observed session state and expose final monitor outputs to Codex or callers.

### Modified Capabilities

- None.

## Impact

- CLI Claude execution wrapper in `src/commands/claude.ts` and `src/utils/claude-cli.ts`.
- Monitor integration helpers in `src/utils/claude-monitor.ts` or a focused adjacent utility.
- Claude monitor session and output endpoints under `claude-monitor/server/` only if existing endpoints cannot support stable run/session lookup.
- Tests for run/session binding, terminal-state polling, result retrieval, and fallback behavior.