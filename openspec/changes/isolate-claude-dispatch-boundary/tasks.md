## 1. External Claude Dispatch Boundary

- [x] 1.1 Update maintained workflow skills and slash-command templates so the implementation dispatch step is explicitly `ccsm claude exec`, not host-native agent delegation.
- [x] 1.2 Update Claude dispatch prompt assets so the Claude session writes the final Execution Return Packet to the CCSM-managed fallback path before shutdown.
- [x] 1.3 Ensure maintained guidance keeps Claude Agent Teams as an in-session Claude capability and treats any host-native delegation path as an explicit compatibility fallback only.

## 2. Status-Driven Return-Packet Fallback

- [x] 2.1 Extend `src/utils/claude-cli.ts` to allocate a run-scoped persisted return-packet path for status-driven runs and pass it to the Claude launch environment.
- [x] 2.2 Update status-driven result retrieval so Codex reads monitor `outputs` first and the persisted return-packet artifact second when outputs are missing or incomplete.
- [x] 2.3 Surface incomplete-evidence outcomes clearly when neither monitor outputs nor the persisted return packet is usable.
- [x] 2.4 Keep plain `ccsm claude exec` compatibility intact when status-driven monitoring is disabled or unavailable.

## 3. Tests And Documentation

- [x] 3.1 Add or update launcher/runtime tests for run-scoped return-packet path injection and retrieval precedence.
- [x] 3.2 Add or update template/install coverage proving maintained `spec-impl` guidance forbids host-native delegation from silently replacing Claude dispatch.
- [x] 3.3 Update README, README.zh-CN, and contributor guidance where needed to describe the external Claude dispatch boundary and the persisted return-packet fallback location.

## 4. Validation

- [x] 4.1 Run `pnpm test -- src/utils/__tests__/claude-cli.test.ts`.
- [x] 4.2 Run the affected workflow-template / command tests that cover `spec-impl` and Claude dispatch guidance.
- [x] 4.3 Run `openspec validate isolate-claude-dispatch-boundary --strict`.
