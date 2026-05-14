## Why

The maintained CCSM path depends on a hard boundary: Codex prepares a bounded packet, `ccsm claude exec` launches an external Claude session, and Claude Agent Teams execute inside that session. When a host environment interprets "delegate" or "spawn agents" as its own native subagent mechanism, that boundary can be bypassed, which breaks the intended Claude-side Team tools path and weakens return-packet correlation.

The status-driven path also assumes monitor `outputs` will always carry the final Execution Return Packet. That is the preferred transport, but it is not a sufficient only transport when shutdown loops, incomplete hook output, or host/runtime interference leave Codex with a correlated run and no durable final packet to inspect.

## What Changes

- Define the maintained dispatch boundary so Codex-side workflow skills and templates must use the external `ccsm claude exec` path for implementation dispatch instead of substituting host-native agent delegation.
- Preserve Claude Agent Teams as an in-session Claude execution capability rather than a host-level orchestration substitute.
- Add a CCSM-managed persisted return-packet fallback for status-driven runs so Codex can recover the final implementation packet when monitor `outputs` are missing or incomplete.
- Update workflow guidance to inspect monitor `outputs` first, persisted return-packet artifacts second, and never treat raw terminal text as the authoritative completion signal.
- Add implementation, documentation, and test coverage for the dispatch-boundary contract and the fallback return-packet transport.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `claude-execution-dispatch`: The maintained Codex-to-Claude dispatch contract must preserve an external Claude execution boundary and must not let host-native delegation silently replace Claude execution.
- `claude-exec-status-results`: Status-driven Claude exec must provide a durable CCSM-managed return-packet fallback when monitor outputs are unavailable or incomplete.
- `spec-impl-default-dispatch`: The default `spec-impl` path must treat `ccsm claude exec` as the actual dispatch step and record any non-Claude compatibility fallback explicitly.
- `status-driven-workflow-skills`: Installed workflow guidance must teach Codex to read monitor outputs first and persisted return-packet artifacts second without treating raw terminal output as success evidence.

## Impact

- `src/utils/claude-cli.ts` and related tests for run-scoped launch metadata and status-driven result retrieval.
- Dispatch prompt assets under `.claude/ccsm/` plus installed workflow skill/command templates that describe the maintained execution path.
- Runtime layout under `~/.ccsm/` for persisted return-packet artifacts.
- README / contributor guidance where the Codex-to-Claude execution boundary and return-packet handling are described.
