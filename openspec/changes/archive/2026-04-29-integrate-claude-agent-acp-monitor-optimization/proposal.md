## Why

The monitor has grown from a hook dashboard into the operational surface for Codex-led planning, Claude execution, OpenSpec state, Workflow analytics, and Control Plane dispatch. That growth is useful, but the runtime boundaries are now uneven: Claude CLI execution, Agent Teams hook ingestion, Control Plane worker adapters, Workflow output reading, and monitor health all live in separate paths with overlapping concepts.

`claude-agent-acp` is a promising integration point because it exposes a Claude-backed coding agent through Agent Client Protocol (ACP). If CCSM adds ACP awareness, the monitor can observe an explicit agent runtime surface instead of relying only on Claude hooks and ad hoc worker adapter metadata. This should be optional and layered; CCSM's primary path must keep working when ACP is not installed.

## Research Brief

**Goal:** Add optional `claude-agent-acp` support to the monitor and use that work to rationalize monitor runtime health, adapter discovery, event ingestion, and Workflow/Control Plane visibility.

**Scope boundaries:**

- Research and proposal only in this step; no product code changes.
- ACP support must be optional and additive.
- Existing Claude hook monitoring remains the default maintained path.
- Existing Codex-led OpenSpec workflow semantics must not change.
- "Optimize the whole monitor" is bounded to architecture, reliability, data consistency, performance, and operator usability; it does not mean a full UI redesign.

**Success signals:**

- Monitor can detect whether the ACP Claude agent adapter is installed and launchable.
- Control Plane can list ACP as a worker adapter with clear health/capability status.
- ACP-originated sessions/events can be normalized into the existing sessions/agents/events/output model.
- Workflow and session views can show ACP-backed runtime activity without duplicate or conflicting hook entries.
- Monitor server/client code gains clearer boundaries for runtime adapters, event normalization, workspace scoping, and health reporting.

## Research Notes

- Current npm package for the binary is `@agentclientprotocol/claude-agent-acp`; it exposes the `claude-agent-acp` bin and describes itself as an ACP-compatible coding agent powered by the Claude Agent SDK.
- Current package metadata changes independently from CCSM releases; on 2026-04-28 npm reports version `0.31.1`, with dependencies on `@agentclientprotocol/sdk` `0.20.0`, `@anthropic-ai/claude-agent-sdk` `0.2.119`, and `zod`. Planning should detect and report installed versions instead of hard-coding a single package version.
- The older package namespace `@zed-industries/claude-agent-acp` also exists but is behind at `0.23.1`; planning should prefer the `@agentclientprotocol/*` package unless a compatibility reason appears.
- The repository currently has no `claude-agent-acp` or ACP integration.
- The monitor already has a worker adapter layer in `claude-monitor/server/lib/worker-runtime.js`, but it only detects CLI-style `codex-cli` and `claude-cli` adapters.
- Control Plane dispatch creation and launch are split between `worker-runtime.js` and `worker-dispatch.js`; only `claude-cli` currently has executable launch behavior.
- Hook ingestion is mature for Claude CLI and Agent Teams events, but ACP events would need their own adapter/normalizer instead of being forced into Claude hook payload shapes.
- The monitor server is CommonJS/Express/SQLite/WebSocket, while the root CLI is TypeScript ESM. ACP integration should avoid forcing a bundler/runtime migration.

## What Changes

- Add optional ACP adapter discovery for `claude-agent-acp`, including package/binary detection and version/health reporting.
- Introduce a monitor runtime adapter abstraction so `claude-cli`, `codex-cli`, and `claude-agent-acp` can report capabilities consistently.
- Add an ACP event/session normalization path that maps ACP runtime activity into the existing `sessions`, `agents`, `events`, token/model, and output APIs.
- Update Control Plane adapter selection so ACP can be visible and selectable where appropriate, without becoming the default until proven reliable.
- Improve monitor health and diagnostics so runtime adapters, hook status, workspace state, WebSocket state, DB state, and transcript/cache state are visible from one coherent surface.
- Optimize monitor internals around event ingestion, query boundaries, project scoping, model attribution, and live update fanout where measurable issues exist.

## Capabilities

### New Capabilities

- `monitor-acp-runtime-adapter`: The monitor can discover and represent ACP-compatible worker runtimes such as `claude-agent-acp`.
- `monitor-runtime-health`: The monitor reports adapter, hook, database, workspace, WebSocket, and cache health through a coherent diagnostics model.

### Modified Capabilities

- `execution-progress-monitoring`: Runtime events from hooks and optional ACP adapters normalize into the same monitor session/agent/event/output model.
- `workflow-model-attribution`: ACP runtime model/provider evidence can participate in the same best-known model attribution rule.
- `orchestration-control-plane`: Worker adapter discovery and selection account for optional ACP adapters without breaking existing CLI adapters.

## Hard Constraints

- ACP support must be opt-in or auto-detected only when installed; base install must not require ACP.
- Existing `ccsm monitor`, Claude hook ingestion, Agent Teams monitoring, Workflow Live Reader outputs, and status-driven `ccsm claude exec` must remain compatible.
- Monitor storage must continue using the existing SQLite session/agent/event model unless design proves a narrow migration is required.
- ACP-originated data must be tagged with source/runtime metadata so duplicate hook and ACP observations can be deduplicated.
- Any dependency addition must be justified against package size, runtime compatibility, and install/update behavior.

## Soft Constraints

- Prefer adapter modules with narrow interfaces over cross-cutting conditionals in route handlers.
- Prefer structured runtime health payloads over additional one-off settings fields.
- Keep ACP integration behind a small launch/detection boundary so future ACP agents can reuse it.
- Do not widen the monitor UI palette or redesign pages as part of backend adapter work.

## Risks

- ACP and `claude-agent-acp` are still evolving; protocol/package changes may require version gating.
- Running Claude through ACP and through hooks at the same time may duplicate sessions/events unless source correlation is explicit.
- ACP may expose a different event lifecycle than Claude hooks; over-normalizing can hide important runtime state.
- Adding an executable ACP adapter before health/diagnostics are solid could make Control Plane dispatch less predictable.
- Monitor optimization can become too broad; planning must split it into measurable work packages.

## Open Questions For Planning

- Should CCSM install `@agentclientprotocol/claude-agent-acp` as an optional managed runtime, or only detect a user-installed binary?
- Should ACP initially be observe-only in the monitor, or should Control Plane be allowed to dispatch through it in the first implementation?
- What event source should win when the same Claude run is visible through both hooks and ACP?
- Which monitor performance issues are currently measurable enough to optimize first: API query latency, WebSocket fanout, transcript parsing/cache churn, or frontend refresh behavior?

## Impact

- Root CLI monitor install/update behavior if CCSM manages an optional ACP runtime.
- `claude-monitor/server/lib/worker-runtime.js` and `worker-dispatch.js` adapter model.
- Monitor settings/health APIs and client diagnostics UI.
- Event/session normalization code and deduplication rules.
- Workflow, Control Plane, and session output views.
- Tests for adapter discovery, runtime health, ACP event normalization, duplicate suppression, and compatibility with existing hook-driven sessions.
