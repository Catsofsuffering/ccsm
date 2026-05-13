## Why

CCSM 现在已经把“编排”和“执行”分开了，但“验收”仍然基本绑定在 orchestrator 上，导致工作流还停留在二层结构：高智能编排器 + 低成本执行器。随着产品目标明确转向“在保证效果前提下尽可能节省成本”，系统需要支持第三层质量过滤，让中等成本模型先承担预验收或验收辅助工作，再把最终高信任判断回流给编排端。

这次 change 的机会不是单纯接入一个新模型，而是把验收路径正式建模为可配置拓扑。现在做这件事很合适，因为仓库已经具备 `ownership.acceptance` 配置入口、状态驱动执行结果、monitor 的模型归因基础，以及把执行器视为可替换宿主的产品方向。

## What Changes

- 引入“可配置的验收拓扑”概念，正式区分 orchestrator、execution host、acceptance owner，以及未来可扩展的 acceptance reviewer。
- 允许 `opencode` 作为新的可选验收路径成员进入系统，但第一版仅承担预验收或验收辅助角色，不直接接管最终 archive 决策。
- 明确第一版的保守默认值：最终 acceptance 仍由 orchestrator 兜底，独立 acceptance owner 作为拓扑能力建模和配置保留，而不是默认对所有用户开放。
- 扩展配置、安装摘要、命令文案和工作流说明，让用户能够理解谁负责编排、谁负责执行、谁负责验收辅助。
- 扩展 monitor 的模型归因和分析面，新增“成本/返工效率”观察能力，用来验证三层模型分工是否真的降低了成本并改善返工质量。
- 为后续把 `acceptanceReviewer` 与 `acceptanceDecisionOwner` 彻底拆开预留类型与规格空间，但第一版不让低信任路径直接放行 archive-ready。

## Capabilities

### New Capabilities

- `acceptance-topology-routing`: 定义可配置的验收拓扑、角色边界、默认值、支持的验收路径成员，以及 acceptance reviewer 与 acceptance owner 的关系。

### Modified Capabilities

- `codex-workflow-orchestration`: 编排器继续拥有 change 推进与最终兜底责任，但验收路径需要支持可配置的预验收/验收辅助层。
- `optional-integrations`: `opencode` 作为可选增强集成进入默认产品故事，但不能重定义主路径的编排所有权。
- `workflow-model-attribution`: monitor 需要识别并展示 `opencode` 等新增模型标签，为成本和返工分析提供基础。
- `execution-progress-monitoring`: monitor 需要新增成本/返工效率观察面，并让验收相关阶段的模型参与可被追踪。
- `ccgs-command-and-skill-surface`: 命令、技能和生成文案需要从“Codex 固定验收”调整为“配置化验收拓扑 + 编排端最终兜底”的叙事。

## Impact

- `src/types/index.ts`、`src/utils/config.ts`、`src/commands/init.ts` 等 ownership / routing / setup 配置路径。
- `templates/codex-skills/spec-review/`、`templates/codex-skills/spec-impl/` 与相关 slash-command 文案。
- monitor 的模型归因、分析页、工作流会话展示与可能的成本/返工指标聚合逻辑。
- 安装摘要、README、README.zh-CN、AGENTS 以及任何描述“谁负责 acceptance”的帮助文案。
- 后续可能受影响的实现面包括配置兼容迁移、类型扩展、可选 provider 注册，以及验收路径的测试基线。
