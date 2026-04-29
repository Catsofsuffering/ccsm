## 1. Runtime Adapter Registry

- [x] Refactor `claude-monitor/server/lib/worker-runtime.js` into a shared runtime adapter registry while preserving existing `codex-cli` and `claude-cli` adapter ids and payload fields.
- [x] Add optional `claude-agent-acp` discovery using `CCSM_CLAUDE_AGENT_ACP_PATH` first, then PATH lookup.
- [x] Add ACP version detection that reports detected version, supported status, and warning reason when version cannot be read.
- [x] Ensure ACP absence is represented as unavailable/optional, not as monitor startup failure.
- [x] Add unit tests for adapter discovery across explicit path, PATH, missing binary, and unreadable version cases.

## 2. Runtime Health Diagnostics

- [x] Add a server-side runtime health helper that summarizes adapters, hooks, DB/storage, active OpenSpec workspace, WebSocket, transcript cache, and ingestion status.
- [x] Extend settings/diagnostics API payloads to expose structured runtime health while keeping existing fields backward compatible.
- [x] Keep health checks non-blocking so optional ACP failures do not break sessions, events, Workflow, or OpenSpec board APIs.
- [x] Update OpenAPI docs if API response shapes change.
- [x] Add server tests for healthy, degraded ACP, missing ACP, and degraded OpenSpec diagnostics.

## 3. ACP Event Normalization

- [x] Add an ACP normalization helper that maps supported ACP session/lifecycle/action/output/model metadata into monitor session, agent, event, and output concepts.
- [x] Add a narrow ACP ingestion route or adapter-facing helper that persists normalized ACP events without pretending they are Claude hook payloads.
- [x] Store source metadata such as `source: "acp"`, adapter id, transport, run/session correlation fields, and raw safe metadata in `events.data`.
- [x] Add deduplication fingerprints so hook and ACP observations of the same run/output do not create duplicate user-facing outputs.
- [x] Add tests for ACP session creation, output event persistence, source metadata, unsupported payload handling, and hook/ACP duplicate suppression.

## 4. Control Plane Integration

- [x] Update Control Plane overview/project adapter payloads to use the shared runtime adapter registry.
- [x] Preserve existing `codex-cli` and `claude-cli` behavior and client contract.
- [x] Include `claude-agent-acp` as an optional adapter when discovered or explicitly configured.
- [x] Keep Claude CLI as the default implementation-stage/replay adapter unless ACP launch readiness is explicitly enabled and validated.
- [x] Ensure ACP unavailable or not launch-ready status produces a clear blocked/unavailable dispatch reason.
- [x] Add Control Plane API tests for existing adapter compatibility, ACP visibility, ACP non-default selection, and ACP blocked dispatch behavior.

## 5. Client Diagnostics Surface

- [x] Update client types/API helpers for runtime adapter health and diagnostics payloads.
- [x] Surface ACP adapter status and runtime health in the existing Settings or Control Plane diagnostics UI using current monitor UI patterns.
- [x] Avoid navigation, palette, typography, or page-shell redesign.
- [x] Add client tests for rendering available ACP, missing ACP, and degraded ACP states.

## 6. Compatibility And Performance Guardrails

- [x] Verify existing Claude hook ingestion still creates sessions, agents, events, token usage, TeamReturn outputs, and WebSocket updates.
- [x] Verify status-driven `ccsm claude exec` still reads monitor session status and outputs unchanged.
- [x] Keep WebSocket broadcast payloads concise for ACP-originated events.
- [x] Keep transcript/OpenSpec parsing behind existing cache boundaries; do not introduce broad polling or filesystem scans.

## 7. Verification

- [x] Run `openspec validate integrate-claude-agent-acp-monitor-optimization`.
- [x] Run targeted monitor server unit/API tests for runtime adapters, health diagnostics, ACP normalization, and Control Plane behavior.
- [x] Run targeted monitor client tests for diagnostics display if client code changes.
- [x] Run `npm --prefix claude-monitor run test` or the narrow server/client equivalents if full monitor tests are too slow.
- [x] Run `npm --prefix claude-monitor/client run build` if client code changes.
- [x] Run `pnpm typecheck` if root TypeScript changes are made.
- [x] Run `pnpm build` if root package code changes are made.
