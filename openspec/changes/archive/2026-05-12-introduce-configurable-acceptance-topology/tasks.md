## 1. Topology Model And Config

- [x] 1.1 Extend workflow ownership types so acceptance topology can distinguish orchestrator, execution host, and optional acceptance-review roles.
- [x] 1.2 Add backward-compatible config semantics that keep final acceptance aligned with the orchestrator by default while allowing a future explicit reviewer path.
- [x] 1.3 Add or update config migration coverage so legacy installs map existing acceptance ownership safely onto the new topology defaults.

## 2. Acceptance Workflow Surface

- [x] 2.1 Update `spec-review` and related acceptance-path guidance to describe optional pre-acceptance review without delegating the maintained final archive boundary away from the orchestrator.
- [x] 2.2 Update `spec-impl`, review prompts, and generated workflow guidance so `opencode` can participate as an additive acceptance reviewer rather than as a silent replacement for final acceptance.
- [x] 2.3 Update install/init summaries and help text so users can understand the configured acceptance topology separately from execution routing.

## 3. Optional Integration And Provider Support

- [x] 3.1 Introduce `opencode` as an optional acceptance-review integration without making it a mandatory dependency of the default path.
- [x] 3.2 Extend provider/model identification surfaces so acceptance-review participation can be represented without collapsing into existing `codex` / `claude` assumptions.
- [x] 3.3 Add compatibility and conflict-handling coverage for any new acceptance-review configuration or prompt assets.

## 4. Monitor Attribution And Analytics

- [x] 4.1 Extend monitor model attribution so acceptance-review sessions can display best-known provider labels such as `opencode`.
- [x] 4.2 Add a cost / rework efficiency analysis surface that distinguishes orchestrator, execution, and optional acceptance-review participation where evidence exists.
- [x] 4.3 Ensure incomplete or ambiguous runtime evidence remains explicit in monitor analytics instead of producing guessed role-attribution or fabricated efficiency claims.

## 5. Documentation And Verification

- [x] 5.1 Update README, README.zh-CN, AGENTS, and maintained workflow docs to describe the first-version acceptance topology and its conservative defaults.
- [x] 5.2 Add or update tests for ownership/config defaults, acceptance-path guidance, provider attribution, and monitor analytics introduced by this change.
- [x] 5.3 Run the relevant OpenSpec validation and project verification so the new topology remains compatible with the maintained Codex-led workflow story.
