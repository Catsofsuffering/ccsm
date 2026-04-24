## 1. Diagnose Workflow Output Refresh Behavior

- [x] 1.1 Inspect `Workflows.tsx` WebSocket, polling, focused-session, and selected-session update paths to identify what causes output remounts or loading flashes.
- [x] 1.2 Inspect `WorkflowLiveReader.tsx` key usage, refresh counters, scroll handling, and output selection behavior.
- [x] 1.3 Identify the smallest state boundary that can update output content without resetting selected Agent or the reader shell.

## 2. Stabilize Live Reader State

- [x] 2.1 Remove or replace any broad `key`/refresh-counter pattern that remounts the latest-output panel on every output refresh.
- [x] 2.2 Preserve selected session and selected Agent across routine output refreshes when those ids still exist.
- [x] 2.3 Preserve reader scroll position when the user is not near the bottom; only keep live-tail behavior when the user is already following the bottom.
- [x] 2.4 Add a non-disruptive "new output available" or equivalent indicator if new output arrives while the user is reading older content.

## 3. Replace Flashing With Localized Motion

- [x] 3.1 Replace full-region re-entry animation with a small localized update affordance on the changed output area.
- [x] 3.2 Ensure the affordance follows the existing dark editorial visual system and does not introduce new accent colors or layout patterns.
- [x] 3.3 Add or reuse reduced-motion-safe CSS so non-essential update animation is disabled or simplified under `prefers-reduced-motion`.

## 4. Tests And Verification

- [x] 4.1 Add or update client tests that cover selected Agent preservation during output refresh.
- [x] 4.2 Add or update client tests for reduced-motion or no-remount behavior where practical.
- [x] 4.3 Run the narrow client test command for the affected Workflow/LiveReader components.
- [x] 4.4 Run `npm --prefix claude-monitor/client run build` after UI changes.
- [ ] 4.5 Manually verify, if possible, that live Agent output updates no longer flash the reader panel.
