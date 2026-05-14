## Context

CCSM already defines the maintained story as Codex orchestrates, Claude executes, and Codex accepts. The runtime path in [src/utils/claude-cli.ts](/B:/project/ccs/src/utils/claude-cli.ts:485) reflects that design: Codex launches an external Claude process, injects Agent Teams env flags, correlates the run with `CCSM_RUN_ID`, and waits for monitor state plus outputs.

The weak point is not the launcher's existence. The weak point is that host environments can interpret agent/delegation language as permission to satisfy the execution step with host-native subagents, worktree agents, or alternative delegation frameworks before `ccsm claude exec` is ever launched. That creates a semantic mismatch:

- CCSM expects Claude-side `TeamCreate`, `TaskCreate`, and `SendMessage`.
- The host may substitute its own agent runtime.
- Codex then loses the clean boundary between orchestration and downstream execution.

The status-driven path has a second weakness. It correctly treats monitor `sessionStatus` as the completion signal and monitor `outputs` as the preferred Execution Return Packet transport, but it does not define a durable CCSM-owned fallback artifact for cases where the run correlates successfully and final outputs are missing, truncated, or unavailable.

## Goals / Non-Goals

**Goals:**

- Preserve a hard external Claude launch boundary for the maintained `spec-impl` path.
- Make host-native delegation an explicit compatibility fallback instead of a silent substitute for Claude execution.
- Add a durable return-packet fallback keyed by run id for status-driven exec.
- Keep monitor `outputs` as the primary evidence path while giving Codex a deterministic secondary source.

**Non-Goals:**

- Replace the monitor as the primary completion/evidence surface.
- Integrate or standardize a specific host-native delegation framework such as paseo.
- Redesign the full orchestration control plane or acceptance model.
- Remove plain `ccsm claude exec` compatibility outside the maintained status-driven path.

## Decisions

### 1. The maintained implementation dispatch step remains an external Claude launch

The workflow contract should distinguish between:

- host-side planning/helping work, and
- the actual implementation dispatch step.

The actual maintained dispatch step is satisfied only when Codex launches the external Claude execution path through `ccsm claude exec` (or the equivalent maintained Claude CLI launch path beneath it). Host-native subagents, delegated workers, or worktree agents may assist before dispatch only if they do not replace that launch. If a workflow intentionally chooses a host-native compatibility path, it must be recorded as an explicit fallback in the packet or result path rather than appearing as the default implementation dispatch.

Alternative considered: treat any host-native agent that edits code as a valid implementation dispatch. Rejected because it collapses the orchestrator/executor boundary and makes Claude Agent Teams semantics optional in exactly the flows that claim they are default.

### 2. Status-driven runs get a run-scoped persisted return-packet artifact

Each status-driven run should allocate a CCSM-managed fallback path under the runtime surface, keyed by the run identifier. The launcher passes that path into the Claude execution environment, and the dispatch prompt instructs Claude to write the final Execution Return Packet there before shutdown.

Recommended shape:

- runtime root: `~/.ccsm/return-packets/`
- per-run artifact: `<run-id>.md`

The artifact is a fallback transport, not a new completion signal. `sessionStatus` remains the terminal-state signal. The persisted packet exists so Codex can still recover bounded implementation evidence when monitor `outputs` are incomplete.

Alternative considered: rely on raw terminal text as fallback evidence. Rejected because terminal text is not a stable transport, is sensitive to host mediation, and conflicts with the status-driven model.

### 3. Result retrieval uses a strict precedence order

For status-driven runs, Codex should retrieve evidence in this order:

1. monitor `outputs`
2. persisted return-packet artifact for the correlated run
3. blocked/incomplete result if neither source is usable

Raw terminal stdout/stderr is diagnostic only. It must not become the authoritative implementation result just because other sources are missing.

### 4. Fallback artifacts remain in the CCSM runtime for auditability

Persisted return packets should live under the CCSM runtime rather than temporary shell-only paths. That keeps the artifact aligned with the rest of the maintained runtime surface, gives Codex a stable place to inspect after a problematic run, and avoids tying the recovery path to a particular host shell or desktop runtime.

Trade-off: this leaves small per-run artifacts on disk. That is acceptable for the first version; retention/pruning can be handled later without changing the contract.

## Risks / Trade-offs

- Host-native delegation remains available in some environments -> Mitigation: make silent substitution a spec violation and document compatibility fallback explicitly.
- Claude may exit without writing the fallback file -> Mitigation: Codex still uses monitor outputs first and treats missing file plus missing outputs as blocked/incomplete rather than inferred success.
- Additional runtime artifacts increase state surface under `~/.ccsm/` -> Mitigation: keep the format simple and run-scoped.
- Prompt and launcher drift could break the fallback path -> Mitigation: add tests for env injection, retrieval precedence, and installed skill/template guidance.

## Migration Plan

1. Extend the status-driven launcher to allocate and pass a run-scoped return-packet path.
2. Update the dispatch prompt and installed workflow guidance so Claude writes the final packet to that path before shutdown.
3. Update result retrieval logic to read monitor outputs first and the persisted artifact second.
4. Refresh docs/tests so the maintained path clearly says the implementation dispatch step is external Claude launch, not host-native delegation.

No user-facing migration is required beyond refreshing installed workflow assets.

## Open Questions

- Whether the status-driven result envelope should include explicit source metadata when outputs come from the persisted fallback rather than monitor `outputs`.
- Whether future retention/pruning should happen opportunistically during `ccsm update`, monitor maintenance, or a dedicated runtime cleanup command.
