## 1. Monitor Session Discovery

- [x] 1.1 Add targeted tests that reproduce an Agent Teams hook event with `session_id` and project `cwd` and require the session to appear in the monitor session API.
- [x] 1.2 Audit `claude-monitor/server/routes/hooks.js` event handling for Agent Teams payload shapes including `Agent`, `SubagentStop`, mailbox, and notification events.
- [x] 1.3 Update hook ingestion so Agent Teams sessions are created/reactivated and associated with the best available workspace context.
- [x] 1.4 Verify `ccsm monitor` rebinding updates the running monitor workspace root when launched from another OpenSpec project directory.

## 2. Real-Time Team-Agent Returns

- [x] 2.1 Add tests for team-agent return or mailbox-style hook payloads that must persist an event and broadcast over WebSocket immediately.
- [x] 2.2 Extend event normalization to extract return summaries from `SendMessage`, `SubagentStop`, notification, or transcript-derived output where available.
- [x] 2.3 Update agent/session state transitions so teammate completion and return output update the correct agent without waiting for session completion.
- [x] 2.4 Add deduplication for return events observed from both hook payloads and transcript parsing.

## 3. Monitor Restart Command

- [x] 3.1 Add CLI routing for `ccsm monitor restart` while preserving `start`, `install`, and `hooks` behavior.
- [x] 3.2 Add a monitor restart helper in `src/utils/claude-monitor.ts` that safely stops an existing CCSM monitor and starts a fresh instance.
- [x] 3.3 Add command-level output for restart success and failure, including monitor URL, monitor directory, and clear unknown-port-occupant errors.
- [x] 3.4 Add targeted tests for restart when the monitor is running, not running, and when the port cannot be safely stopped.

## 4. Documentation And Verification

- [x] 4.1 Update user-facing CLI help or README content for `ccsm monitor restart` if command behavior changes the public surface.
- [x] 4.2 Run targeted monitor server tests and root tests for CLI/process helpers.
- [x] 4.3 Run `pnpm build` after TypeScript changes.
- [x] 4.4 If monitor client code changes, run the monitor client test/build commands.
