## Context

CCSM 当前的主路径已经完成了两层职责拆分：

- orchestrator 负责 change 生命周期、工件推进、执行派发、review、acceptance 与 archive 判断
- execution host 负责有边界的实现执行与证据回传

同时，仓库已经具备这次设计可依赖的基础：

- `ownership.orchestrator`
- `ownership.executionHost`
- `ownership.acceptance`
- `spec-review` / `spec-impl` 的编排契约
- monitor 的状态驱动结果、模型归因和 token/cost 数据基础

但这些能力现在仍然耦合在两个旧假设上：

1. `ModelType` 既表示“模型/提供方”，又表示“角色拥有者”
2. `acceptance` 虽然存在于配置中，但产品语义仍然接近“最终验收 = orchestrator”

如果把 `opencode` 纳入验收路径，而不先澄清这些概念，系统会很快陷入语义混乱：

- 谁是 host runtime
- 谁是执行 provider
- 谁是 acceptance reviewer
- 谁是 acceptance decision owner
- 谁能宣布 archive-ready

这次 change 因此不是“增加一个 provider”，而是“把验收拓扑正式建模”。

## Goals / Non-Goals

**Goals:**

- 让 workflow ownership 可以表达“编排、执行、验收辅助、最终验收”这些不同层次的角色。
- 允许 `opencode` 进入验收路径，并在第一版中承担预验收或验收辅助职责。
- 保持默认主路径保守可靠：最终 acceptance 仍由 orchestrator 兜底，archive 仍是显式高信任动作。
- 让 monitor 能展示验收相关模型归因、成本和返工效率，验证三层分工是否带来收益。
- 为后续把 acceptance reviewer 与 acceptance decision owner 完全拆开预留类型和规格空间。

**Non-Goals:**

- 第一版不让 `opencode` 直接接管 archive decision。
- 第一版不要求所有用户都显式配置独立 acceptance owner。
- 第一版不重做整套 `spec-review` 命令面交互，仅调整其拓扑语义和配置边界。
- 第一版不把成本优化暴露成复杂的策略编排器。

## Decisions

### 1. 将“模型 / 宿主 / 角色拥有者”拆成不同概念

**Decision**

把现有近似等价的几个概念拆开：

- `HostRuntime`: 哪个宿主负责承载命令、技能、桥接或执行入口
- `ModelProvider`: 实际参与执行、review、验收辅助的模型提供方
- `WorkflowOwnership`: orchestrator、executionHost、acceptanceOwner，以及未来可扩的 acceptanceReviewer

第一版至少要在设计和配置语义上完成拆分，即使实现层暂时还保留一部分兼容映射。

**Why**

如果不拆，`opencode` 一进入系统就会同时触发类型、安装、文案和监控面的歧义。我们需要先让系统能表达“由谁运行”和“由谁判断”是两回事。

**Alternatives considered**

- 继续让 `ModelType` 同时承担 provider 与 owner 语义。
  Rejected，因为这会让 acceptance 拓扑永远被锁死在二元模型里。
- 先只把 `opencode` 写进文案，不动配置模型。
  Rejected，因为后续实现一定会回头返工，而且 monitor 无法可靠归因。

### 2. 第一版把 `opencode` 定位为预验收 reviewer，而不是最终 acceptance decision owner

**Decision**

允许 `opencode` 作为新的验收路径成员进入系统，但第一版只承担：

- 预验收 reviewer
- 验收辅助分析器
- rework packet 结构化辅助器

最终 acceptance 继续由 orchestrator 兜底。

**Why**

这满足产品目标中的成本细化：在高智能编排器与低成本执行器之间加入一层中等成本质量过滤，同时不破坏现有高信任验收闭环。

**Alternatives considered**

- 让 `opencode` 直接成为最终 acceptance owner。
  Rejected for v1，因为当前没有足够运行证据来证明其在高风险 acceptance 上稳定可靠。
- 不引入第三层，只保留 orchestrator + executor。
  Rejected，因为这无法实现更细粒度的成本控制目标。

### 3. “acceptance owner” 与 “archive decision” 在语义上拆开

**Decision**

第一版开始，系统在设计上区分：

- acceptance review result
- archive-ready signal
- archive action

即便未来 acceptance owner 可以独立配置，archive 仍然保持为显式高信任动作，不由低信任或中等信任路径自动触发。

**Why**

一旦把 acceptance 与 archive 绑定死，任何引入新 reviewer/provider 的动作都会直接触碰最高风险边界。拆开后，系统可以先接受“预验收通过”或“建议 archive-ready”，再由高信任主体确认。

**Alternatives considered**

- 继续把 acceptance passed 视为 archive-ready + archive action 的直接前置。
  Rejected，因为这会让 `opencode` 的引入风险不必要地升高。

### 4. monitor 先成为“拓扑验证器”，再成为“策略编排器”

**Decision**

第一版 monitor 只做两件事：

- 能正确归因 orchestrator / executor / acceptance reviewer 的模型参与
- 提供成本 / 返工效率视图来验证是否值得继续扩大验收拓扑能力

它不负责在第一版自动替用户切换 acceptance owner 或动态升级模型。

**Why**

先建立观测，再开放策略，能避免在没有证据的情况下过早暴露复杂配置。

**Alternatives considered**

- 第一版直接开放自动成本策略切换。
  Rejected，因为缺少命中率、返工率和误放行率基线。

### 5. 采用“兼容演进”而不是一次性推翻现有 Codex-led story

**Decision**

保留当前主叙事：

- Codex-led orchestration
- configurable execution host
- configurable acceptance topology

`opencode` 作为 optional integration 加入，不改变“编排主线由 orchestrator 推进”的默认产品故事。

**Why**

这与现有 `optional-integrations` 和 `codex-workflow-orchestration` 的定位一致，也能减少 README、命令模板和安装引导的破坏性变更。

**Alternatives considered**

- 把 `opencode` 提升为新的默认验收主角。
  Rejected，因为这会重写当前产品故事，超出这次 change 的安全边界。

## Risks / Trade-offs

- [角色模型变复杂，用户更难理解] → Mitigation: 第一版只在内部配置和文案中引入拓扑语义，对外默认仍显示保守路径。
- [`opencode` 预审命中率不足，反而增加返工开销] → Mitigation: monitor 必须提供成本/返工效率视图，用数据判断是否继续放大使用范围。
- [兼容旧配置时出现 `acceptance` 语义混乱] → Mitigation: 迁移时把现有配置解释为 `acceptanceOwner = orchestrator`，除非用户明确切换。
- [文案说支持 acceptance topology，但实现层仍只有 `codex | claude`] → Mitigation: 在同一 change 中补上 provider 扩展与可识别标签，避免只有文案没有类型。
- [archive 风险被新 reviewer 路径放大] → Mitigation: 第一版保持 archive 为显式高信任动作，不交给 `opencode` 自动决策。

## Migration Plan

1. 保持历史配置可读，将缺失或旧式 `ownership.acceptance` 映射为当前 orchestrator。
2. 扩展类型和配置结构，使系统能表达 `opencode` 作为模型提供方或 reviewer。
3. 更新命令、技能、README 和安装摘要文案，说明 acceptance topology 的默认与可选行为。
4. 扩展 monitor 的模型归因和分析面，确保新 provider 不再落到 `unknown`。
5. 在没有显式新配置时，系统继续按原来的保守路径工作。
6. 如果集成不稳定，回滚到“acceptance owner 与 orchestrator 一致”的默认解释，同时保留新的观测数据结构。

## Open Questions

- 第一版是否只暴露 `acceptanceReviewer=opencode`，把 `acceptanceOwner` 独立配置先保留给内部或后续版本？
- `opencode` 的配置入口更适合放在 install/init 流程里，还是作为后续显式配置命令？
- cost/rework 视图的第一版指标是否只做只读分析，还是要附带“建议升级/降级模型”的提示？
