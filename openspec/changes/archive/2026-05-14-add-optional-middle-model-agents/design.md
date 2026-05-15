## Context

仓库刚完成第一版 acceptance topology，把 `opencode` 建模成可选 acceptance reviewer，并保持 Codex 为最终 decision owner。当前实现已经覆盖：

- `ModelType` / 配置结构里可表达 `opencode`
- 初始化安装流程中可选择 `acceptanceReviewer`
- monitor attribution / analytics 能识别 `opencode` 并在 acceptance-review 角色上展示证据

但这套实现仍然把“中间模型层”近似等同于“`opencode` 这个单一 provider”。这会带来两个问题：

1. 无法表达与 `opencode` 同层的其他 provider，例如你现在要加的 `PI`
2. 安装交互只能问“reviewer 是谁”，却不能先决定“要不要启用中间模型 agent 这一层”

因此这次设计需要把“中间模型 agent 层是否启用”与“启用后选哪个 provider”拆开，同时保持当前 acceptance-topology 的高信任边界不变。

## Goals / Non-Goals

**Goals:**

- 把 `PI` 纳入与 `opencode` 同层的中间模型 agent / reviewer provider
- 在配置与安装流程中新增显式开关，允许用户关闭整个中间模型 agent 层
- 在中间模型 agent 层关闭时，默认主路径继续保持 Codex decision owner + Claude execution worker
- 让 monitor / analytics / attribution 能把 `PI` 识别成与 `opencode` 同类的中间层 provider，而不是落入 `unknown`
- 保持文档、命令模板、安装摘要对这层能力的叙事一致

**Non-Goals:**

- 不把 `PI` 或 `opencode` 提升为最终 acceptance owner
- 不改变 Codex 持有最终 acceptance / archive 决策的边界
- 不引入新的自动调度策略，例如根据成本自动切换中间模型 provider
- 不在这次变更中重做 monitor 的整套角色归因逻辑，只扩展现有中间层 provider 识别面

## Decisions

### 1. 引入“中间模型 agent 层启用状态”作为独立配置，而不是只靠 `acceptanceReviewer` 是否为空推断

**Decision**

在 ownership / topology 相关配置中新增一个显式布尔开关，例如 `middleModelAgentEnabled`，用来表示是否启用中间模型 agent 层；`acceptanceReviewer` 保留为 provider 选择字段，仅在该层启用时生效。

**Why**

如果继续用 `acceptanceReviewer` 是否为空来隐式表达开关，会把“用户主动关闭该层”和“用户尚未选择 provider”混在一起。显式开关可以让安装体验、摘要输出、兼容迁移和后续扩展都更清晰。

**Alternatives considered**

- 继续用 `acceptanceReviewer?: ModelType` 隐式表示开关
  Rejected，因为无法区分“关闭”与“未配置”，而且难以在 installer 中给出清晰摘要。
- 把 `middleModelAgentEnabled` 放到 routing 而不是 ownership
  Rejected，因为这层能力更接近 workflow topology，而不是 frontend/backend 执行模型路由。

### 2. 将 `PI` 与 `opencode` 一起建模为“中间模型 provider 集合”，但 v1 仍通过单选 provider 暴露

**Decision**

扩展 `ModelType` / `ModelProvider` 支持 `pi`，并把 `acceptanceReviewer` 继续保持为单值选择；installer 在启用中间模型 agent 层后，提供 `opencode`、`pi` 或未来更多 provider 的单选。

**Why**

这满足当前需求，同时不把实现复杂度一下推高到“多 reviewer 并行”。当前 monitor、config、summary、docs 都是按单个 reviewer provider 叙事，单值扩展是最小安全演进。

**Alternatives considered**

- 直接改成 `acceptanceReviewers: ModelType[]`
  Rejected，因为这会放大 monitor attribution、summary、docs 与测试面，超出当前需求。
- 为 `PI` 单独增加平行字段
  Rejected，因为它与 `opencode` 属于同类角色，拆成并列字段会制造重复语义。

### 3. 关闭中间模型 agent 层时，安装流程不再要求选择 provider，并在摘要中显式显示“disabled”

**Decision**

交互式 `init` 顺序调整为：

1. 选择 orchestrator / frontend / backend
2. 选择是否启用中间模型 agent 层
3. 若启用，再选择 provider（如 `opencode` / `pi`）
4. 摘要中同时显示 owner、middle-model layer 状态、以及 reviewer provider

**Why**

这与用户的心智模型一致：先决定要不要这层能力，再决定由谁承担。对“不启用中间模型 agent”的用户来说，也避免了多余配置噪音。

**Alternatives considered**

- 继续先问 provider，再额外确认是否启用
  Rejected，因为步骤顺序反直觉，而且在关闭场景下会让用户先做无效选择。

### 4. monitor attribution 对 `PI` 采用与 `opencode` 相同的保守归因策略

**Decision**

在 session model backfill、analytics role family、control-plane model normalization 等位置，将 `pi` 纳入与 `opencode` 相同的中间层 provider 识别逻辑。只有存在具体证据时才归因为中间模型 agent，否则继续保留 `unknown`。

**Why**

这保持了 acceptance-topology v1 的核心原则：没有证据就不猜。`PI` 只是 provider 集合扩展，不应该引入更激进的角色推断。

**Alternatives considered**

- 仅在配置中支持 `pi`，monitor 暂不识别
  Rejected，因为这会导致 UI/analytics 与 config 语义脱节。
- 只要看到 `pi` 字样就默认认定为 acceptance-review
  Accepted with constraint：仅在现有“provider/model evidence exists”路径里这样做，不扩展到无证据推断。

## Risks / Trade-offs

- [配置字段增多，用户理解成本上升] → Mitigation: 用“是否启用中间模型 agent”作为第一层问题，provider 选择只在启用时出现，并在摘要中显示最终状态。
- [旧配置迁移后语义混乱] → Mitigation: 若旧配置已有 `acceptanceReviewer`，则默认 `middleModelAgentEnabled = true`；若 reviewer 为空，则默认关闭。
- [`PI` 命名大小写或运行时证据形态不一致，导致 attribution 漏识别] → Mitigation: 统一采用小写归一化匹配，并为直接 model、metadata hint、token usage 三类证据加测试。
- [未来需要多个中间模型 reviewer 并行时，单值 provider 设计会受限] → Mitigation: 在 design 中明确这是 v1 单 provider 模式，保留后续扩展为数组字段的空间。

## Migration Plan

1. 扩展类型与配置 schema，新增 `pi` provider 与 `middleModelAgentEnabled`。
2. 在 config 默认值与读取逻辑中加入兼容映射：
   - 已存在 `acceptanceReviewer` → 推断 `middleModelAgentEnabled = true`
   - 无 reviewer → `middleModelAgentEnabled = false`
3. 更新交互式 init 提示与 summary。
4. 扩展 monitor attribution / analytics / client types，使 `pi` 能被识别和展示。
5. 更新 README、README.zh-CN、命令模板与 skill 文案。
6. 补充测试覆盖：
   - config 默认值与迁移
   - init/install 分支
   - monitor attribution 与 analytics
   - 安装时关闭中间模型 agent 的默认路径

## Open Questions

- `PI` 在运行时证据里最终是稳定显示为 `pi`、`PI`，还是带前缀的 provider 名？当前提案按 `pi` 小写规范处理，实现时需要和真实输出保持一致。
- 安装交互里“中间模型 agent”是否要沿用 reviewer 术语，还是单独对用户展示成更通俗的名字，例如 “optional mid-tier reviewer layer”？这会影响中英文文案统一方式。
