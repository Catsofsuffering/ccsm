## Context

The monitor currently combines several runtime concepts without a shared boundary:

- Claude hook events arrive through `claude-monitor/server/routes/hooks.js` and are persisted as sessions, agents, events, token usage, and output feeds.
- Control Plane worker discovery lives in `claude-monitor/server/lib/worker-runtime.js`, currently as CLI binary detection for `codex-cli` and `claude-cli`.
- Control Plane dispatch launch lives in `claude-monitor/server/lib/worker-dispatch.js`, and only `claude-cli` has executable launch behavior.
- Runtime health is spread across `/api/health`, `/api/settings/info`, hook status, DB counters, WebSocket state, transcript cache stats, and Control Plane adapter summaries.

`claude-agent-acp` should be integrated through these boundaries instead of being added as a special case inside page or route code. The current npm package is `@agentclientprotocol/claude-agent-acp`, exposing the `claude-agent-acp` binary. Package versions move independently, so CCSM should detect installed binary/package versions and report support status rather than pinning one version in monitor logic.

## Goals / Non-Goals

**Goals:**

- Add optional discovery of a `claude-agent-acp` runtime adapter.
- Report ACP adapter availability, version, command path, capabilities, and launch readiness in monitor health and Control Plane adapter payloads.
- Add a narrow ACP runtime event normalization path that can map ACP-observed activity into the existing session/agent/event/output model.
- Keep Claude hook monitoring and status-driven `ccsm claude exec` as the default maintained path.
- Rationalize monitor diagnostics so operators can see adapter, hook, workspace, DB, WebSocket, transcript cache, and ingestion health in one consistent model.
- Bound monitor optimization to concrete data-flow and diagnostics improvements, not a visual redesign.

**Non-Goals:**

- Replace Claude hook ingestion with ACP.
- Require ACP for base install or for the primary Codex -> Claude Agent Teams -> Codex workflow.
- Implement a full ACP client UI or editor-style interactive ACP terminal in the monitor.
- Make ACP the default Control Plane dispatch adapter in the first implementation.
- Redesign monitor pages, navigation, color system, or typography.
- Change OpenSpec lifecycle semantics.

## Decisions

### ACP Is Optional And Auto-Detected

The first implementation should not add `@agentclientprotocol/claude-agent-acp` as a required dependency of the root package or bundled monitor. Detection should support:

- explicit `CCSM_CLAUDE_AGENT_ACP_PATH`
- PATH lookup for `claude-agent-acp`
- optional managed install path only if a later installer task explicitly enables it

The adapter should report `available`, `command`, `source`, `version`, `supported`, and `reason` fields. Missing ACP should be a normal health state, not an error.

### Runtime Adapters Need A Shared Shape

`worker-runtime.js` should evolve from CLI-only detection into a runtime adapter registry. Each adapter should expose:

- `id`
- `runtime`
- `transport`
- `available`
- `command`
- `source`
- `version`
- `capabilities`
- `health`
- `launchReady`
- `limitations`

Existing `codex-cli` and `claude-cli` payloads must remain backward compatible for client types. ACP can add `transport: "acp"` while still using command detection.

### ACP Event Ingestion Is Separate From Claude Hooks

ACP-originated monitor events should enter through a narrow adapter route/helper rather than pretending to be Claude hook payloads. The normalizer should emit the same internal record concepts:

- session identity and run correlation
- main/worker agent identity
- lifecycle event
- tool/action event when present
- output message
- model/runtime metadata
- source metadata with `source: "acp"` and `adapterId: "claude-agent-acp"`

This preserves existing APIs while making deduplication possible when hooks and ACP observe the same run.

### First Implementation Is Observe-Ready, Not Default Dispatch

Control Plane should list `claude-agent-acp` and surface its health/capabilities. It may create blocked or opt-in dispatch intents for ACP, but it should not prefer ACP over the stable Claude CLI path until executable ACP launch and return-packet behavior are explicitly validated.

If executable ACP dispatch is implemented in this change, it must be gated by adapter health and a clear operator/action path. It must not alter `ccsm claude exec --status-driven` behavior.

### Monitor Optimization Means Data And Health Reliability

"Optimize the whole monitor" is scoped to:

- reduce duplicate adapter/health logic
- reduce duplicate hook/ACP event presentation
- keep expensive transcript/OpenSpec parsing behind existing caches
- keep WebSocket fanout payloads concise
- make diagnostics actionable
- add tests around the critical ingestion and adapter paths

Frontend work should be limited to exposing the richer diagnostics and ACP adapter status using existing monitor UI patterns.

## Dependencies

- Optional external binary/package: `@agentclientprotocol/claude-agent-acp` exposing `claude-agent-acp`.
- Existing monitor runtime: Node.js, Express, SQLite, WebSocket, React client.
- Existing Claude hook install remains required for the maintained default monitor path.

## Risks / Trade-offs

- ACP package/protocol versions may change -> detect installed versions, mark unsupported versions explicitly, and keep version logic isolated.
- Hook and ACP observations can duplicate events -> require source/run correlation and event fingerprint deduplication.
- ACP lifecycle may not map one-to-one to hook lifecycle -> preserve raw ACP metadata in event data while normalizing only stable fields.
- Adding launch behavior too early could destabilize Control Plane -> default to discovery/health/observe-ready behavior unless tests prove dispatch is reliable.
- Diagnostics can become noisy -> expose concise health summaries with drill-down details.

## Execution Handoff Contract

**Execution goal:** Add optional `claude-agent-acp` monitor support and improve monitor runtime health/adapter boundaries while preserving the existing hook-driven primary workflow.

**Allowed paths:**

- `claude-monitor/package.json` only if an optional/dev dependency or script is required and justified.
- `claude-monitor/server/lib/worker-runtime.js`
- `claude-monitor/server/lib/worker-dispatch.js`
- `claude-monitor/server/lib/**` for new runtime adapter, ACP normalization, health, or dedupe helpers
- `claude-monitor/server/routes/settings.js`
- `claude-monitor/server/routes/control-plane.js`
- `claude-monitor/server/routes/hooks.js` only for shared dedupe/helper extraction, not broad hook rewrites
- `claude-monitor/server/routes/**` for a narrow ACP ingestion or runtime health route if needed
- `claude-monitor/server/db.js` only for narrow metadata/index support if helper-level storage is insufficient
- `claude-monitor/server/openapi.js` if public API payloads change
- `claude-monitor/server/__tests__/api.test.js`
- `claude-monitor/server/lib/__tests__/**`
- `claude-monitor/client/src/lib/types.ts`
- `claude-monitor/client/src/lib/api.ts`
- `claude-monitor/client/src/pages/Settings.tsx`
- `claude-monitor/client/src/pages/ControlPlane.tsx`
- adjacent client tests under `claude-monitor/client/src/**/__tests__`
- `src/utils/claude-monitor.ts`, `src/commands/monitor.ts`, `src/cli-setup.ts` only if an explicit monitor command is added for ACP diagnostics/install
- `openspec/changes/integrate-claude-agent-acp-monitor-optimization/tasks.md`

**Protected paths:**

- Do not change the default `ccsm claude exec --status-driven` contract.
- Do not make ACP a required install dependency.
- Do not remove or weaken Claude hook installation/ingestion.
- Do not rewrite the monitor UI visual system.
- Do not change OpenSpec archive contents.
- Do not change unrelated product story, release metadata, or installer language outside the ACP/monitor scope.
- Do not make MCP, Gemini, or `codeagent-wrapper` required.

**Required verification:**

- Run server tests for adapter discovery, ACP missing/available states, runtime health payloads, ACP normalization, and hook compatibility.
- Run Control Plane API tests proving `claude-cli` remains available/selected as before and ACP appears only when detected or explicitly configured.
- Run client tests for diagnostics/adapter display if client changes are made.
- Run `openspec validate integrate-claude-agent-acp-monitor-optimization`.
- Run `pnpm typecheck` if root TypeScript changes are made.
- Run `pnpm build` if root package code changes are made.
- Run `npm --prefix claude-monitor run test` or targeted server/client equivalents after monitor changes.
- Run `npm --prefix claude-monitor/client run build` if client code changes.

**Rework triggers:**

- Monitor fails or warns when ACP is absent.
- ACP becomes the default dispatch path without explicit gating.
- Existing Claude hook events stop creating sessions, agents, events, token usage, or outputs.
- Workflow Live Reader or status-driven return packets regress.
- Control Plane no longer reports existing `codex-cli` / `claude-cli` adapters in the expected shape.
- ACP and hook events for the same run appear as duplicate unreadable sessions without source metadata.
- Runtime health output is too vague to identify adapter, hook, DB, workspace, WebSocket, or cache failure causes.
