## Context

The Workflow page combines periodic API refreshes, WebSocket-triggered refreshes, focused session loading, and a live reader for Agent outputs. During active Agent Teams runs, output events can arrive frequently. The current UI can re-run broad refresh paths and remount the highlighted output panel, which makes the latest output card flash instead of communicating a stable incremental update.

The existing monitor design system already requires purposeful, sparse motion and reduced-motion support. This change narrows that principle to Workflow Agent output updates.

## Goals / Non-Goals

**Goals:**

- Keep the selected session and selected Agent stable while output data refreshes.
- Avoid remounting the latest-output region solely to replay an animation.
- Highlight newly arrived output with a small, local affordance instead of reanimating the whole reader.
- Preserve reader scroll position unless the user is already near the bottom or explicitly changes selection.
- Respect `prefers-reduced-motion` for any new transition.

**Non-Goals:**

- Redesigning the Workflow page layout.
- Replacing the WebSocket or polling data source.
- Changing monitor server APIs.
- Introducing a new animation library.

## Decisions

### Stabilize Identity Before Styling Motion


The implementation should first remove update patterns that force unnecessary React remounts. In particular, the live reader should not key the whole latest-output block by a refresh counter when the selected Agent is unchanged. Stable keys should be based on durable output or message identity, and motion should be applied through class/state changes rather than component recreation.

### Localize The Update Affordance

New output should be communicated with a restrained local change such as a short accent border wash, timestamp pulse, or small "updated" marker. The full markdown body should remain readable and visually anchored.

### Preserve User Reading Position

The output reader should not jump to the top or bottom on every refresh. Auto-scroll is acceptable only when the user is already near the bottom of the output region or when they select a different Agent/session.

### Keep Motion Token-Based And Reduced-Motion Safe

Any new CSS should use existing CSS/Tailwind conventions and include a reduced-motion fallback. No new runtime dependency should be introduced.

## Risks / Trade-offs

- Output identity may be incomplete for some hook-derived messages -> fall back to timestamp/source plus agent id while avoiding broad remounts.
- Removing remount-based animation may make updates too subtle -> use a small local affordance that is visible but not disruptive.
- Preserving scroll position can hide new output when the user is reading older content -> show a non-intrusive update indicator instead of forcing scroll.

## Execution Handoff Contract

**Execution goal:** Smooth Workflow Agent output updates so live Agent output changes are stable, incremental, and reduced-motion aware.

**Allowed paths:**

- `claude-monitor/client/src/pages/Workflows.tsx`
- `claude-monitor/client/src/components/workflows/WorkflowLiveReader.tsx`
- `claude-monitor/client/src/index.css` or existing monitor CSS token files if a reusable animation class is needed
- `claude-monitor/client/src/components/workflows/**/__tests__` or existing adjacent client tests

**Protected paths:**

- Do not change monitor server APIs.
- Do not edit unrelated monitor pages.
- Do not redesign Workflow page layout or color system.
- Do not touch active backend changes under `claude-monitor/server/**` for this change.

**Required verification:**

- Run the relevant monitor client test for Workflow/LiveReader if present or added.
- Run `npm --prefix claude-monitor/client run test` or the narrow equivalent available in the client package.
- Run `npm --prefix claude-monitor/client run build` after UI changes.

**Rework triggers:**

- Latest output still flashes by remounting on every refresh.
- Selecting an Agent is lost during routine output updates.
- Reader scroll position jumps during routine updates.
- Reduced-motion users still receive non-essential update animation.
