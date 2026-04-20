## 1. Inventory Current OpenSpec State

- [ ] 1.1 Audit the current active and completed change set under `openspec/changes/` and map the capability coverage that already exists in change-local specs.
- [ ] 1.2 Identify which durable requirements should be promoted into canonical main specs under `openspec/specs/`.

## 2. Build The Main Capability Catalog

- [ ] 2.1 Create or supplement canonical capability specs under `openspec/specs/` so the repository has a first coherent main-spec catalog.
- [ ] 2.2 Ensure each new main spec uses durable capability naming and scenario-based OpenSpec requirements rather than task-specific wording.

## 3. Normalize Current Changes

- [ ] 3.1 Update current change artifacts so proposals, specs, and task structure make capability coverage and execution boundaries easier to review.
- [ ] 3.2 Supplement any missing or weak OpenSpec artifact details needed for archive review or future bounded execution, while staying inside `openspec/**`.

## 4. Validate And Summarize

- [ ] 4.1 Run `openspec list --specs --json`, `openspec list --json`, and `openspec validate openspec-capabilities-and-change-hygiene --strict`.
- [ ] 4.2 Return a summary of the created main specs, the normalized changes, and any remaining follow-up items for Codex review.
