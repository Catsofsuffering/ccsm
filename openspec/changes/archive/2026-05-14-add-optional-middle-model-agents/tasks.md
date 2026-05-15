## 1. Config And Installer

- [x] 1.1 Extend model/provider typings and config structures to represent `pi` and the middle-model agent enable/disable switch.
- [x] 1.2 Update config defaults and backward-compatibility mapping so legacy reviewer configs infer the correct middle-model layer state.
- [x] 1.3 Update interactive `init` flow and install summary so users can disable the middle-model agent layer or choose `opencode` / `pi` when enabled.

## 2. Workflow Guidance And Docs

- [x] 2.1 Update maintained command/skill templates and installer-facing guidance to describe the middle-model agent layer as optional and same-class for `opencode` and `pi`.
- [x] 2.2 Update README and README.zh-CN to explain that middle-model agents are optional and can be disabled at install time.

## 3. Monitor Attribution And Analytics

- [x] 3.1 Extend monitor session attribution and provider normalization so `pi` is recognized wherever `opencode` is currently treated as an acceptance-path provider.
- [x] 3.2 Update monitor analytics/client typing so `pi` is surfaced consistently in reviewer-layer evidence and role/cost views.

## 4. Verification

- [x] 4.1 Add or update tests for config migration/defaults, installer prompt branches, and disabled middle-model layer behavior.
- [x] 4.2 Add or update monitor attribution and analytics tests covering `pi` evidence and the no-middle-model path.
- [x] 4.3 Run the relevant OpenSpec validation and project verification for the new middle-model agent flow.
