---
artifact: prd
version: "1.0"
created: 2026-05-10
status: revised
---

# PRD: 编排验收器与执行器分层工作流

## Overview

### Problem Statement

当前仓库已经具备一条以 Codex 为主编排、以 Claude Agent Teams 为默认执行层、以 OpenSpec 为变更源事实、以本地 monitor 为状态回传面的工作流骨架，但产品叙事仍主要停留在“谁负责什么”，还没有把“为什么这样分工能在保证效果前提下降低成本”沉淀为统一的需求文档。

在复杂需求落地时，如果同一个高成本高智能模型同时承担需求分析、方案规划、代码执行、测试整理、验收判断和归档决策，会出现三个问题：

1. 高价值推理与机械执行混在一起，成本结构不稳定。
2. 实际执行容易偏离计划，返工责任不清晰。
3. 验收和执行边界模糊，导致 source of truth 被多处修改。

项目当前的 spec 和代码已经在朝“编排验收器”和“执行器”分层演进，例如：

- `spec-fast`、`spec-init`、`spec-plan`、`spec-impl`、`spec-review` 被定义为编排技能。
- `spec-impl` 明确要求先派发执行，再由编排端做验证与验收。
- monitor 和 `ccsm claude exec --status-driven` 已能把执行完成信号和实现证据结构化回传给编排端。
- 安装器已经支持按角色把技能路由到 orchestration host 与 execution host。

现在缺的是一份面向产品、策略和交付协同的 PRD，把“高智能模型负责输入密集型分析与验收，低成本快速模型负责输出密集型执行”正式定义为产品能力，而不仅仅是实现细节。

### Solution Summary

构建一套双层模型工作流：

- 编排验收器负责理解需求、推进 OpenSpec 变更、生成执行交接契约、拆解任务、收集执行结果、组织验证、做最终验收与归档判断。
- 执行器负责在明确边界内完成代码实现、局部检查、证据回传和返工执行，不拥有验收与源事实修改权限。
- 系统通过 OpenSpec、状态驱动执行和 monitor 把“计划、执行、回传、验收”串成一条可追踪链路。
- 在满足质量目标的前提下，优先把高成本模型用在输入密集、价值密集的环节，把输出密集、重复性高的工作交给更快更便宜的执行模型。

### Target Users

- 使用 CCG/CCSM 进行 spec-driven 开发的个人开发者
- 需要在多模型协作中控制成本与质量的 AI 工作流维护者
- 需要审计变更过程、执行证据与验收责任边界的团队负责人

## Goals & Success Metrics

### Goals

1. 建立“编排验收器 / 执行器”分层作为产品默认工作流，而不是零散的命令约定。
2. 在不牺牲验收质量的前提下，降低复杂变更的平均模型成本。
3. 让执行结果必须通过结构化证据回流到编排端，降低实现偏移与 source-of-truth 污染。

### Success Metrics

| Metric | Current Baseline | Target | Timeline |
|--------|-----------------|--------|----------|
| 默认工作流中由编排端完成最终验收的变更占比 | 已有约束，但缺少统一产品口径 | 100% | 2026-06-15 |
| `spec-impl` 执行先派发、后本地验收的遵循率 | 依赖提示词约束，未统一度量 | >= 90% | 2026-06-15 |
| 成功完成的复杂变更单次平均模型成本 | 未建立统一基线 | 相比“单高阶模型包办全流程”下降 25% | 2026-07-15 |
| 首轮执行通过后直接进入 `archive-ready` 或仅需 1 轮返工的比例 | 未建立统一基线 | >= 70% | 2026-07-15 |
| 执行侧越权修改 `tasks.md` / 直接做验收决策的事件数 | 通过规则约束，未统一审计 | 0 | 2026-06-15 |

### Non-Goals

- 不在本期内把执行层从 Claude 专门替换成任意多执行器市场。
- 不在本期内自动归档成功变更；归档仍然是显式决策。
- 不在本期内把所有质量门禁下沉到运行时强制拦截；当前仍以技能契约、状态流和审查为主。

## User Stories

| ID | User Story | Priority |
|----|-----------|----------|
| US-1 | 作为工作流使用者，我希望复杂需求先由高智能编排器拆解并生成执行包，以便执行阶段不偏题。 | P0 |
| US-2 | 作为维护者，我希望执行器只能在允许范围内改动并把证据回传，而不能直接改 OpenSpec 任务状态或替我验收。 | P0 |
| US-3 | 作为成本敏感的团队，我希望把高价模型主要用在分析、测试和验收上，把输出密集型实现交给更便宜快速的执行器。 | P0 |
| US-4 | 作为审查者，我希望在 monitor 中看到执行完成信号、输出证据和会话归因，方便判断是接受还是返工。 | P1 |
| US-5 | 作为安装者，我希望初始化时能明确编排端和执行端分别落在哪个宿主，并看到技能按角色安装到哪里。 | P1 |

See `openspec/specs/codex-workflow-orchestration/spec.md`, `openspec/specs/spec-impl-default-dispatch/spec.md`, `openspec/specs/execution-progress-monitoring/spec.md`, and `openspec/changes/separate-orchestration-execution-skills/design.md` for implementation-aligned acceptance context.

## Scope

### In Scope

- 把“编排验收器 / 执行器”定义为默认产品叙事与核心工作流边界。
- 统一 `spec-fast -> spec-init/spec-plan/spec-impl/spec-review` 的编排责任定义。
- 统一 `team-plan -> team-exec -> team-review` 作为执行层协作路径的产品定位。
- 把成本优化目标纳入模型分工原则：高智能模型用于分析、测试、验收，低成本模型用于执行。
- 把状态驱动执行、Execution Return Packet、monitor 输出与验收决策串联为正式需求。
- 把技能角色路由、宿主归属和冲突保护纳入安装与更新体验。

### Out of Scope

- 新增第三种“自治归档器”角色。
- 将 OpenSpec 替换为其他变更事实源。
- 重做 monitor 的整体视觉系统或导航架构。
- 在本期内引入自动成本结算、计费结算或外部财务报表。

### Future Considerations

- 可配置的执行器选择策略。当前先固定为“编排端主导，执行器可替换但必须服从契约”，避免过早抽象。
- 基于 monitor 的成本与返工分析面板增强。当前仓库已经落地最小分析面，但 orchestrator / execution 级别仍以保守归因为主，后续需继续补强证据链。
- 更细粒度的角色分工。未来可在“编排器 / 执行器”之外，引入“预验收审查器”或“质量仲裁器”这样的中间层角色，用于在高智能编排与低成本执行之间增加一层中等成本的质量过滤。
- 更强的运行时门禁。当前主要依赖技能合同和审查回路，未来可考虑对越权行为做硬性阻断。

## Solution Design

### Functional Requirements

#### 1. 角色分层与职责边界

- FR-1: 系统必须把工作流角色明确划分为“编排验收器”和“执行器”。
- FR-2: 编排验收器必须负责需求理解、OpenSpec 工件推进、执行交接契约生成、执行派发、测试组织、验收判断和归档决策。
- FR-3: 执行器必须只负责有边界的实现、局部验证、问题上报和执行证据回传。
- FR-4: 执行器不得运行 `spec-review`、不得编辑活动 change 的 `tasks.md`、不得标记任务完成、不得决定 acceptance 或 archive readiness。

#### 2. OpenSpec 驱动的编排主线

- FR-5: 默认工作流必须通过 OpenSpec 管理 proposal、design、specs 和 tasks，不得绕过工件直接进入不透明实现。
- FR-6: `spec-fast` 必须根据当前工件状态从首个缺失或 pending 阶段继续推进，而不是每次从头重跑。
- FR-7: `spec-fast` 必须支持有界返工回路，并在 `archive-ready`、`blocked` 或 `retry-budget-exhausted` 停止。
- FR-8: `spec-impl` 必须默认采用 dispatch-first 策略，在执行派发成功前，编排端不得静默转为本地直接实现。

#### 3. 执行交接契约与执行回传

- FR-9: 编排端必须生成 bounded execution packet，至少包含目标、允许/禁止改动范围、worker topology、必做验证和 return packet 格式。
- FR-10: 执行器必须以 Execution Return Packet 的形式回传 changed files、tests run、unresolved issues 和 accept/rework recommendation。
- FR-11: 系统必须把 Execution Return Packet 视为 monitor `outputs` 内的结构化内容，而不是原始终端文本。
- FR-12: 当执行失败、阻塞或证据不足时，编排端必须生成 rework packet，而不是直接在 review 阶段接管实现。

#### 4. 成本优化模型分工

- FR-13: 产品必须把“高智能模型承担输入密集型分析与验收、低成本模型承担输出密集型执行”定义为推荐默认策略。
- FR-14: 安装与配置必须显式记录 orchestrator、executionHost 和 acceptance owner 的角色归属。
- FR-15: 当兼容模式切换 orchestrator host 时，技能与命令安装必须仍保持角色边界，而不是绑定死到某一个宿主目录。
- FR-16: 系统必须保留对模型归因、token/cost 记录和执行会话输出的观测能力，为后续成本优化提供证据。
- FR-16a: 第一阶段不需要把“成本优化策略”直接暴露为用户可配置策略；系统只需提供明确的默认推荐路径与可观测性。
- FR-16b: 执行器不应被长期固定为 Claude；Claude 只是当前默认执行宿主，具体执行宿主应允许由用户后续决定或替换。

#### 5. 观测、审查与验收

- FR-17: monitor 必须提供执行完成状态、会话输出、Agent Teams 回传和 OpenSpec 进度的统一观察面。
- FR-18: 编排端必须基于 `sessionStatus` 判断执行是否真正完成，并基于 `outputs` 校验实现证据。
- FR-19: `team-review` 和 `spec-review` 必须保留在编排端主导的验收链路中，执行侧仅能提供证据与建议。
- FR-20: 当多个 worktree 或项目根并存时，monitor 必须能够区分当前观察的工作上下文，避免把错误执行结果用于验收。
- FR-21: monitor 需要新增专门的“成本/返工效率”观察视图或等价分析面，用于验证模型分工是否真的降低了成本并控制了返工。

### User Experience

用户体验上应保持“一条默认主线，多个显式阶段”的感觉：

- 安装时，用户先选择谁做编排，再配置前后端模型与可选能力。
- 日常使用时，用户优先从 `spec-fast` 或 `spec-impl` 等编排入口进入，而不是自己手工拼装执行流程。
- 执行发生在下游，但结果必须统一回到 monitor 与编排端。
- 用户看到的不是“多个模型在乱跑”，而是“编排器在掌控、执行器在干活、监控面在回证据”。

### Edge Cases

| Scenario | Expected Behavior |
|----------|------------------|
| `ccsm claude exec` 无法启动或无法关联 monitor session | 停止为 `blocked`，不得静默回退为编排端本地直接实现 |
| 执行器回传了代码，但没有结构化证据 | 编排端拒绝直接验收，生成 rework packet 或阻塞说明 |
| 执行器发现 spec/tasks 不一致 | 只能在 return packet 中报告，不能自行改 `tasks.md` |
| 多个 worktree 名称相近 | monitor 需展示可区分的 project/worktree identity，避免错误验收 |
| 高智能编排模型成本过高 | 允许后续调优模型组合，但不能牺牲编排/验收边界 |

## Technical Considerations

### Constraints

- 当前实现以 OpenSpec 为唯一变更事实源。
- 当前默认执行层是 Claude Agent Teams，且 `spec-impl` 已围绕 `ccsm claude exec --status-driven` 设计。
- 运行时约束目前主要来自技能合同、命令模板和 review 回路，不是完全的硬门禁。
- 仓库当前仍存在 `CCG`、`CCGS`、`CCSM` 等历史命名痕迹；PRD 需要以“角色分层”高于“历史命名差异”的方式表述。

### Integration Points

- OpenSpec: 负责 change 生命周期、proposal/design/spec/tasks 工件和归档边界。
- `ccsm claude exec`: 负责执行器启动与状态驱动回传。
- Monitor: 负责 `sessionStatus`、`outputs`、模型归因、worktree/project 上下文和执行可视化。
- Installer / config: 负责 orchestrator、executionHost、acceptance owner 与技能角色路由。

### Data Requirements

- 需要持久化角色归属配置：`ownership.orchestrator`、`ownership.executionHost`、`ownership.acceptance`。
- 需要保留执行结果的结构化输出，而非仅保留终端文本。
- 需要保留模型归因和 token/cost 记录，以支撑成本优化评估。
- 不应把 monitor 变成第二个 source of truth；OpenSpec 仍然是工件与任务状态的唯一事实源。

## Dependencies & Risks

### Dependencies

| Dependency | Owner | Status | Impact if Delayed |
|------------|-------|--------|-------------------|
| OpenSpec artifact lifecycle and status commands | OpenSpec / workflow maintainers | Active | 没有稳定状态读取就无法可靠编排与恢复 |
| `ccsm claude exec --status-driven` and monitor correlation | Runtime / monitor maintainers | Active | 无法确认执行完成或读取结构化证据，验收链会断裂 |
| Skill role routing in installer/update path | CLI / installer maintainers | Active | 角色边界只能停留在文档，无法在安装面体现 |
| Model attribution and token/cost persistence | Monitor maintainers | Partial | 无法验证“省成本”目标是否真的实现 |

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| 角色边界只停留在提示词层，执行器仍可能越权 | M | H | 保持模板、review、monitor 审计一致，并逐步增加硬门禁 |
| 成本优化目标缺少统一基线，难以证明收益 | H | M | 先以 monitor 的 token/model 数据建立基线，再推进报表化 |
| 高智能编排器如果过度介入实现，节省成本目标会失效 | M | H | 强化 dispatch-first 与 blocked-stop 原则，禁止静默本地 fallback |
| 多宿主/历史命名混杂导致用户理解负担高 | M | M | 在产品文案中固定使用“编排端 / 执行端 / canonical home”叙事 |
| 执行器能力不足导致返工率过高，抵消成本优势 | M | H | 通过更强 execution packet、返工包和分层 review 控制偏移 |
| 过早把最终 acceptance owner 从 orchestrator 中拆出，可能削弱验收责任闭环 | M | H | 第一阶段默认保持 orchestrator 负责最终 acceptance；若引入独立中间模型，先承担预审而不是最终放行 |

## Timeline & Milestones

| Milestone | Description | Target Date |
|-----------|-------------|-------------|
| M1 | 统一产品叙事与 PRD，明确角色边界、默认路径与成本原则 | 2026-05-17 |
| M2 | 对齐命令模板、技能描述、README 和安装摘要，形成一致口径 | 2026-05-31 |
| M3 | 建立最小成本与返工观测基线，能按角色追踪执行质量 | 2026-06-15 |
| Launch | 将“编排验收器 / 执行器分层”作为默认工作流对外表达 | 2026-07-15 |

## Open Questions

- [x] 执行器是否长期固定为 Claude，还是只把 Claude 视为当前默认执行宿主？
  Decision: 不固定。Claude 仅作为当前默认执行宿主，执行器选择应由用户决定。
- [x] 成本优化是否要在第一阶段直接暴露为用户可配置策略，而不仅是默认推荐策略？
  Decision: 第一阶段不需要。先提供默认推荐策略与可观测性，再决定是否开放策略配置。
- [x] `acceptance` owner 是否应允许与 `orchestrator` 不同，还是默认保持同一高智能模型更稳妥？
  Decision: 第一阶段默认保持 `acceptance owner = orchestrator`。可以为未来独立 decision owner 预留配置概念，但不应让 legacy 配置或默认安装静默改变最终验收归属。
- [x] 是否需要在 monitor 中新增专门的“成本/返工效率”视图来验证 PRD 指标？
  Decision: 需要，作为验证 PRD 成本与质量目标的关键观察面。

## Discussion: Acceptance Owner

### 问题背景

当前产品故事已经明确区分了：

- 编排器负责理解需求、拆解工作、派发执行、组织测试、做最终验收和归档判断。
- 执行器负责低级、机械、输出密集的实现工作。

你提出的进一步细化很有价值：是否可以再加入一个中等能力、中等成本的模型，把“最终验收前的质量过滤”单独抽出来，从而形成：

1. 高智能编排器
2. 低成本执行器
3. 中间层审查/验收辅助模型

这在成本结构上是合理的，因为最终链路里最贵的不一定是执行，而是“高智能模型亲自读全部输出、亲自做所有审查”的部分。

### 结论建议

PRD 建议采用分阶段策略：

1. 第一阶段默认保持 `acceptance owner = orchestrator`。
2. 第一阶段不要把最终 acceptance decision 下放给独立中间模型。
3. 如果要引入第三模型，优先把它定义为“预验收审查器”或“验收辅助器”，而不是最终 acceptance owner。
4. 等 monitor 的成本/返工视图建立起来后，再决定是否开放真正独立的 acceptance owner。

### 为什么第一阶段不建议直接拆开

- 当前仓库里的实现和规格仍然把最终 acceptance 明确绑定在编排端。
- `src/types/index.ts` 已经为 `opencode` 预留了类型入口，但当前产品定位仍应把它限制在“验收辅助 / 预审 reviewer”，而不是最终 decision owner。
- 一旦把最终 acceptance owner 拆成独立角色，责任闭环会变复杂：
  谁对错误放行负责，谁决定 archive-ready，谁在 review 失败时拥有最高仲裁权，都需要重新定义。
- 如果中间模型能力不足，它可能既不能像高智能模型那样稳，也比低成本执行器更贵，反而让成本收益不明显。

### 为什么仍然值得为独立 acceptance owner 预留方向

- 从产品架构上看，三层结构比二层结构更适合长期成本优化。
- 很多变更并不需要最高智能模型亲自做每一次细读审查，可以先由中等模型做预筛。
- 如果预筛发现明显问题，可以直接生成 rework packet，减少高成本模型参与次数。
- 只有通过预筛的结果，再交给编排器做最终 acceptance 和 archive judgment，会更稳。

### 关于 opencode 的位置建议

如果未来纳入 `opencode`，更建议它优先承担以下角色之一：

- 预验收审查器：检查 return packet、差异范围、基础验证证据、明显偏题和遗漏。
- 返工分流器：把 review findings 结构化成更适合执行器消费的 rework packet。
- 成本守门员：结合 monitor 的 token/cost 与返工率数据，建议是否值得升级到高智能模型复核。

不建议在第一阶段直接让 `opencode` 成为最终 acceptance owner，原因是：

- 这会直接触碰现有“编排端负责最终 acceptance”的核心契约。
- 当前没有足够的运行数据来证明它在高风险 acceptance 上稳定可靠。
- 一旦验收错误，损失通常比节省的那点成本更大。

### 推荐的演进路径

建议按下面顺序推进：

1. 先保持最终 acceptance 仍由 orchestrator 负责。
2. 在 PRD 和架构上新增“预验收审查器”概念，允许未来接入 `opencode`。
3. 先在 monitor 中补足成本/返工效率视图，建立三种证据：
   编排器参与成本、执行器返工率、预审模型对最终 acceptance 的命中率。
4. 当命中率和稳定性足够高时，再评估是否把 `acceptance owner` 从“最终决策者”拆成：
   `acceptanceReviewer` 与 `acceptanceDecisionOwner` 两层。

### 产品决策建议

本 PRD 建议这样落地：

- 现在允许“acceptance owner”作为配置概念保留，但默认与 orchestrator 一致。
- 第一阶段不要求对用户暴露独立 acceptance owner 选择。
- 若未来引入 `opencode`，先把它纳入“验收辅助/预审”而非“最终验收归属”。
- 最终 acceptance 和 archive readiness 在第一阶段继续由编排器保底。

## Appendix

### Related Documents

- Problem Statement: `openspec/changes/separate-orchestration-execution-skills/proposal.md`
- Technical Design: `openspec/changes/separate-orchestration-execution-skills/design.md`
- Workflow Orchestration Spec: `openspec/specs/codex-workflow-orchestration/spec.md`
- Dispatch Contract Spec: `openspec/specs/spec-impl-default-dispatch/spec.md`
- Monitoring Spec: `openspec/specs/execution-progress-monitoring/spec.md`
- Role Routing Spec: `openspec/changes/separate-orchestration-execution-skills/specs/workflow-skill-role-routing/spec.md`
- Current Orchestration Skill: `templates/codex-skills/spec-impl/SKILL.md`
- Current Top-level Orchestrator: `templates/codex-skills/spec-fast/SKILL.md`
- Installer Routing Logic: `src/utils/installer.ts`
- Ownership Schema: `src/types/index.ts`, `src/utils/config.ts`

### Current Alignment Notes

- 当前实现已经支持 `acceptanceReviewer = opencode` 的可选入口，并在 README、技能模板和初始化摘要中将其描述为 additive reviewer。
- 当前实现已经提供 monitor analytics 中的 Acceptance Topology / Rework Efficiency 分析面，但 reviewer 之外的 orchestrator / execution 角色归因仍保持保守，不应被解读为完整精确分摊。
- legacy `ownership.acceptance` 应只作为兼容字段保留，不应覆盖第一阶段 `acceptance owner = orchestrator` 的默认语义。

### Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.2 | 2026-05-13 | Codex | Closed the acceptance-owner decision, aligned monitor analytics status with current implementation, and clarified conservative legacy-config semantics |
| 1.1 | 2026-05-10 | Codex | Resolved three open questions, added monitor cost/rework view requirement, and expanded acceptance-owner discussion with phased recommendation |
| 1.0 | 2026-05-10 | Codex | Initial draft based on current OpenSpec artifacts and repository implementation |
