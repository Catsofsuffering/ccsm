# 配置说明

## 安装后目录

```text
~/.claude/
├── commands/ccgs/
├── agents/ccgs/
├── skills/ccgs/
├── rules/
├── settings.json
└── .ccgs/
    ├── config.toml
    ├── prompts/
    └── claude-monitor/

~/.codex/
└── skills/
    ├── ccgs-spec-init/
    ├── ccgs-spec-plan/
    └── ccgs-spec-impl/
```

## 关键文件

- `~/.claude/.ccgs/config.toml`：CCGS 配置
- `~/.claude/settings.json`：Claude 环境变量和 hooks
- `~/.claude/.ccgs/claude-monitor`：本地监控运行时

## 模型路由

仓库仍支持模型路由配置，但维护中的默认叙事是：

- Codex 编排
- Claude 执行
- Codex 审核与验收

当前默认只维护 Codex/Claude 的 prompts 和 host surface。

## 监控运行时

监控运行时和命令模板分开管理：

```bash
ccgs monitor install
ccgs monitor hooks
ccgs monitor start --detach
```

## 常见问题

**监控页打不开**

运行：

```bash
ccgs monitor start --detach
```

**hooks 丢了**

运行：

```bash
ccgs monitor hooks
```
