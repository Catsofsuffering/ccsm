# CCGS

<div align="center">

[![npm version](https://img.shields.io/npm/v/ccgs-workflow.svg)](https://www.npmjs.com/package/ccgs-workflow)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Primary Path](https://img.shields.io/badge/Primary%20Path-Codex%20Led-green.svg)]()

[English](./README.md) | [简体中文](./README.zh-CN.md)

</div>

CCGS is a Codex-led OpenSpec workflow package. Codex owns planning and acceptance, Claude Agent Teams execute bounded implementation, and the local monitor gives you a live view of board status, workflow topology, and runtime activity.

## What CCGS Is For

The maintained path in this fork is:

1. Codex creates or advances an OpenSpec change.
2. Codex prepares the execution handoff contract.
3. Claude Agent Teams implement the scoped work.
4. Codex reviews the result, runs verification, and decides archive readiness.

MCP, extra skills, and Gemini can still be used, but they are optional layers rather than the default workflow.

## Install

### Prerequisites

- Node.js 20+
- Codex for the primary orchestration flow
- Claude Code for execution and local monitor integration

### Run Without Global Install

```bash
npx ccgs-workflow
```

### Install Globally

```bash
npm install -g ccgs-workflow
ccgs
```

The canonical command is `ccgs`. The legacy `ccg` alias still exists for compatibility.

## Quick Start

### 1. Initialize the workflow

```bash
ccgs init
```

During setup, CCGS asks who orchestrates the workflow before model routing is selected. Codex is the recommended default. The installer also places Codex-native entry skills under `~/.codex/skills/`.

### 2. Start the monitor

```bash
ccgs monitor
```

To keep it running in the background:

```bash
ccgs monitor --detach
```

By default, the monitor serves at [http://127.0.0.1:4820](http://127.0.0.1:4820).

### 3. Work through the primary OpenSpec flow

```bash
/ccgs:spec-init
/ccgs:spec-research <request>
/ccgs:spec-plan
/ccgs:team-plan
/ccgs:team-exec
/ccgs:team-review
/ccgs:spec-review
openspec archive <change-id>
```

If you want the managed shortcut for Codex dispatch plus Claude execution plus Codex acceptance, use:

```bash
/ccgs:spec-impl
```

## CLI Surface

The currently maintained command surface is:

```bash
ccgs
ccgs init
ccgs monitor
ccgs monitor --detach
ccgs claude
ccgs config mcp
ccgs diagnose-mcp
ccgs fix-mcp
```

What these do:

- `ccgs`: open the interactive menu.
- `ccgs init`: install and configure the workflow.
- `ccgs monitor`: start the local Claude hook monitor.
- `ccgs claude`: launch Claude through the CCGS dispatcher for Codex handoff scenarios.
- `ccgs config mcp`: configure MCP tokens.
- `ccgs diagnose-mcp`: inspect MCP configuration problems.
- `ccgs fix-mcp`: apply the Windows MCP repair path.

## Monitor

The local monitor is the operational view for the Codex + Claude execution loop. It is designed to make OpenSpec progress and agent activity visible while work is running.

Main pages:

- `Board`: current changes, progress, and activity snapshots.
- `Sessions`: searchable session history with status, duration, agent count, and directory context.
- `Workflows`: live DAG view plus session output flow.
- `Analytics`: productivity and workflow telemetry.

### Board

![Board](./assets/readme/monitor-board.png)

### Sessions

![Sessions](./assets/readme/monitor-sessions.png)

### Workflows

![Workflows](./assets/readme/monitor-workflows.png)

### Analytics

![Analytics](./assets/readme/monitor-analytics.png)

## What Gets Installed

The current install path keeps compatibility with existing environments while shifting the primary workflow toward Codex:

- Claude-facing commands and runtime assets are still installed under `~/.claude/`.
- Codex-native workflow skills are installed under `~/.codex/skills/`.
- Runtime data is stored under `~/.claude/.ccgs/`.
- The maintained local monitor runtime lives under `~/.claude/.ccgs/claude-monitor`.

## Codex-Native Entry Skills

After installation, CCGS also installs:

- `ccgs-spec-init`
- `ccgs-spec-plan`
- `ccgs-spec-impl`

These let the primary workflow start directly from Codex while keeping Claude available as the execution layer.

## Repository Landmarks

```text
src/
|- cli.ts
|- cli-setup.ts
|- commands/
|- utils/
`- i18n/

templates/
|- commands/
|- prompts/
|- codex-skills/
`- skills/

openspec/
`- changes/

claude-monitor/
|- client/
|- server/
`- scripts/
```

## Architecture

```mermaid
graph TD
    User["User"] --> Codex["Codex-led workflow"]
    Codex --> OpenSpec["OpenSpec artifacts"]
    Codex --> Contract["Execution handoff contract"]
    Contract --> Claude["Claude Agent Teams"]
    Claude --> Packet["Execution return packet"]
    Packet --> Codex
    Codex --> Verify["Tests + review + acceptance"]
    Verify --> Archive["Archive"]
    Claude --> Monitor["Local monitor"]
    Codex -. optional .-> MCP["MCP"]
    Codex -. optional .-> Skills["Skills"]
    Codex -. optional .-> Gemini["Gemini"]
```

## Contributing

- Prefer OpenSpec-first changes over ad hoc edits.
- Keep compatibility surfaces labeled as compatibility until they are retired.
- Do not describe MCP, extra skills, or Gemini as mandatory for the default product path.
- Keep new docs aligned to the Codex-orchestrated, Claude-executed workflow.

Project workflow guidance lives in [AGENTS.md](./AGENTS.md).

## License

MIT
