## Why

The Workflow monitor page currently flashes when Agent output updates arrive, especially during Claude Agent Teams runs. The update path appears to refresh or reanimate large output regions instead of applying a stable, incremental transition, making live monitoring distracting and harder to read.

## What Changes

- Smooth Agent output updates in the Workflow page so new output is highlighted without remounting or flashing the whole reader.
- Preserve scroll position and selected Agent context while live output refreshes.
- Replace broad re-entry animations on existing output with small, purposeful update affordances.
- Respect reduced-motion preferences for all new update animation behavior.
- Keep the current dark editorial monitor style and avoid a broader UI redesign.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `execution-progress-monitoring`: Workflow live output updates must be visually stable, incremental, and reduced-motion aware.

## Impact

- `claude-monitor/client/src/pages/Workflows.tsx`
- `claude-monitor/client/src/components/workflows/WorkflowLiveReader.tsx`
- Shared monitor CSS or motion utilities if the fix needs a reusable reduced-motion-safe update animation.
- Monitor client tests for Workflow live reader update stability where practical.
