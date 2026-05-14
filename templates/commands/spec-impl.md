---
description: 'Codex 调度 Claude 执行，并在通过验收后决定 archive'
---
<!-- CCG:SPEC:IMPL:START -->
**Core Philosophy**
- Codex 负责推进 change、分发执行、回收结果、测试验收、决定 archive。
- Claude 负责执行，不负责最终验收，不负责最终归档决策。
- `spec-impl` is an orchestration skill: execution workers must not run `spec-review`, edit active change `tasks.md`, mark OpenSpec tasks complete, archive, or decide acceptance readiness.
- `spec-impl` 的受维护默认派发动作是外部 `ccsm claude exec`。宿主原生 agent/subagent/delegation 不能静默替代这一步，除非明确记录为 compatibility fallback。
- 验收失败时，必须形成明确 rework packet 并打回执行层。

**Acceptance Topology（验收拓扑）**

验收拓扑与执行路由是不同层次的概念。拓扑角色：

- **决策owner（Decision owner）**：Codex 拥有 acceptance 和 archive 的最终决策权，从不委托给执行层。
- **可选验收reviewer（Optional reviewer）**：例如 opencode 可以作为验收视角的补充，提供分析供决策参考，但拍板权在编排侧。opencode 始终是增值项，不是主路径。
- **执行worker**：只负责在边界内实现并返回证据，不做 acceptance 判断，不跑 `spec-review`，不决定 archive。

Archive 是显式的高信任操作，由决策owner持有。执行路径（orchestrator → execution worker）和验收路径（decision owner、可选reviewer）是分开的。

**Guardrails**
- 不直接把外部模型输出当成最终实现。
- 不在验收通过前 archive。
- 当建议下一步时，始终使用 `/ccsm:*` 命令。
- `tasks.md` 必须持续保持 checkbox 格式。

**Steps**
1. 选择 change
   - 运行 `openspec list --json`。
   - 确认 change id。
   - 运行 `openspec status --change "<change_id>" --json`。

2. 进入实现前检查
   - 内部调用 `/opsx:apply` 进入实现上下文。
   - 若 state 为 `blocked` 或 tasks 不可解析，停止并提示重新运行 `/ccsm:spec-plan`。

3. 读取执行契约
   - 读取 `proposal.md`、`design.md`、`tasks.md`、`specs/**/*.md`。
   - 从 `design.md` 中提取 `Execution Handoff Contract`。
   - 明确：
     - allowed/protected surface
     - work packages
     - required verification
     - rework triggers
   - 在启动前把本次 bounded execution packet 写入 `~/.claude/ccsm/claude-dispatch-prompt.txt`；安装器会用 `~/.ccsm/prompts/claude/claude-dispatch-prompt.txt` 这份受管 scaffold 刷新该 bridge 文件。

4. 调度 Claude 执行
   - 如果还没有执行计划，先运行 `/ccsm:team-plan`，基于 handoff contract 生成 Claude Agent Teams 计划。
   - 然后运行 `/ccsm:team-exec` 让 Claude Agent Teams 干活。
   - 这里的“调度”必须落到外部 `ccsm claude exec` / `claude -p` 运行边界，而不是由宿主直接把实现任务改派给自己的原生 subagent。
   - Execution packet must explicitly tell Claude workers to return evidence only; task checkbox updates, `spec-review`, acceptance, and archive remain Codex-owned.
   - Claude 返回后，必须回收一份 return packet，至少包含：
     - changed files
     - tests run
     - unresolved issues
     - suggested accept/rework

5. Codex 进行验收
   - 基于 return packet、自身代码审查和本地验证做验收。
   - 运行 handoff contract 里要求的测试/检查。
   - 必要时运行 `/ccsm:spec-review` 作为独立验收门禁。
   - 当使用 `--status-driven` 结果时，执行完成取决于 monitor 的 `sessionStatus`；Return Packet 优先来自 monitor `outputs`，若其缺失或不完整，则回退到 `returnPacketPath` 指向的 CCSM 持久化文件，而非原始终端文本。

6. 失败时打回
   - 若出现任一情况，必须打回执行层：
     - 规格不满足
     - 测试失败
     - 变更越界
     - 缺少验证证据
   - 输出 `Rework Packet`，至少包含：
     - failed checks
     - violated constraints
     - files requiring rework
     - specific return conditions
   - 指示下一步：`/ccsm:team-exec` 或 `/ccsm:spec-impl`

7. 通过时归档
   - 仅当 Codex 验收通过时，才允许 archive。
   - 归档前确保 `tasks.md` 已全部完成。
   - 内部调用 `/opsx:archive` 完成归档。

**Output Shape**
成功时：

```md
## Acceptance Passed

- change: <change_id>
- verification: passed
- archive: approved
```

失败时：

```md
## Acceptance Failed

### Rework Packet
- failed check: ...
- violated constraint: ...
- file scope: ...
- required fix: ...

Next: /ccsm:team-exec
```

**Exit Criteria**
- [ ] Claude 执行结果已回流给 Codex
- [ ] Codex 已完成必需验证
- [ ] 失败时已形成 rework packet 并打回
- [ ] 通过时 change 已 archive
<!-- CCG:SPEC:IMPL:END -->
