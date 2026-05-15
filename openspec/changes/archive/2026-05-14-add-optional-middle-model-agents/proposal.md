## Why

当前 acceptance-topology 只把 `opencode` 建模为可选的中间模型 reviewer，无法表达同层的其他中间模型 agent。与此同时，安装流程一旦暴露中间模型层，也需要允许用户明确关闭这一层，保持默认主路径可运行但不过度启用可选 agent。

## What Changes

- 将 `PI` 纳入与 `opencode` 同类的中间模型 agent / reviewer 提供方，允许它以可选的中间层身份参与 acceptance-path。
- 为安装与配置增加一个显式开关，用于控制是否启用中间模型 agent 层。
- 在开关关闭时，默认工作流继续保持 Codex 决策、Claude 执行的主路径，不要求中间模型 agent 存在。
- 扩展 provider/model attribution、初始化提示、配置结构和文档表述，使 `PI` 与 `opencode` 都能被明确识别为“中间模型 agent”，而不是高信任 owner。

## Capabilities

### New Capabilities
- `middle-model-agent-routing`: 定义可选中间模型 agent 层的启用开关、支持的 provider 集合，以及其与 acceptance reviewer 拓扑的关系。

### Modified Capabilities
- `acceptance-topology-routing`: 将 acceptance reviewer 从仅支持 `opencode` 扩展为支持同类中间模型 agent（包括 `PI`），并要求可通过配置显式关闭该层。
- `optional-integrations`: 将中间模型 agent 层表述为可选增强，而不是默认安装必需项。
- `workflow-model-attribution`: 让 monitor / analytics 能识别 `PI` 这类中间模型 provider，并保持与 `opencode` 相同的不确定性处理策略。
- `ccgs-command-and-skill-surface`: 更新安装说明、命令帮助和生成指导，使用户能理解“启用/禁用中间模型 agent”与“是否配置 reviewer provider”是独立但相关的概念。
- `codex-workflow-orchestration`: 明确中间模型 agent 层即使启用，也只作为 Codex 决策前的可选增值层，不改变 Codex 的最终 acceptance / archive 边界。

## Impact

- `src/types/index.ts`、`src/utils/config.ts`、`src/commands/init.ts` 的模型枚举、ownership/config 结构与交互式安装提示。
- monitor attribution 与 analytics 相关代码，包括 `claude-monitor/server/**` 与 `claude-monitor/client/**` 的 provider 展示和角色聚合。
- `README.md`、`README.zh-CN.md`、模板命令/skills 文案中的中间模型 agent 叙事。
- 配置兼容性与测试：需要覆盖“启用中间模型 agent”与“安装时关闭中间模型 agent”的两条路径。
