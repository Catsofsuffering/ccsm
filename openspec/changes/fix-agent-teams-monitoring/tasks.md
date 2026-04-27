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

## 5. Reopened Rework: Structured Agent Teams Output

- [x] 5.1 Add representative test fixtures for structured Agent Teams hook payloads:
  - `PreToolUse` / `PostToolUse` with `tool_name: "SendMessage"`.
  - mailbox or teammate-message payloads containing `summary` and `message`.
  - nested payload variants where message text is inside `tool_input`, `tool_response`, `payload`, `content`, or `data`.
- [x] 5.2 Add a tolerant server-side normalizer for Agent Teams tool payloads:
  - recognize `TeamCreate`, `TaskCreate`, `TaskUpdate`, `SendMessage`, and mailbox/teammate-message shapes.
  - extract message text, summary, team/task metadata, sender/recipient, and raw source.
  - ignore lifecycle-only team events that do not contain teammate output.
- [x] 5.3 Persist structured teammate output as first-class monitor events:
  - use `TeamReturn` or an equivalent existing event type unless a stronger reason exists.
  - associate with the best-known agent by explicit id, teammate name, subagent type, task/team metadata, or session-level fallback.
  - keep raw payload details in `events.data`.
  - dedupe against existing `SubagentStop`, notification-derived, and transcript-derived returns.
- [x] 5.4 Include structured TeamReturn/mailbox event text in session output aggregation:
  - `/api/sessions/:id/outputs` exposes the structured message before `SubagentStop` or `SessionEnd`.
  - Workflow Live Reader can show the message without client-side special cases.
  - existing transcript and `last_assistant_message` fallbacks remain intact.
- [x] 5.5 Add WebSocket/API tests:
  - structured `SendMessage` persists and broadcasts immediately.
  - structured mailbox output appears in `/api/sessions/:id/outputs`.
  - no duplicate output appears when the same text later arrives through `SubagentStop` or notification fallback.
  - non-Agent Teams hook events still behave as before.
- [x] 5.6 Run required verification:
  - targeted monitor server test command for the hook/session-output path.
  - broader monitor server API tests if available.
  - `openspec validate fix-agent-teams-monitoring`.
  - client tests/build only if client files changed.
