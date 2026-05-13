---
description: 'Codex 最终验收 OpenSpec change，失败打回，成功 archive'
---
<!-- CCG:SPEC:REVIEW:START -->
**Core Philosophy**
- `spec-review` 是最终验收门禁。
- Codex 对 change 是否满足 spec 负责最终判断。
- 通过前不 archive，失败时必须打回执行层。

**Acceptance Topology（验收拓扑）**

验收拓扑与执行路由是不同层次的概念。拓扑角色：

- **决策owner（Decision owner）**：Codex 拥有 acceptance 和 archive 的最终决策权，从不委托给执行层。
- **可选验收reviewer（Optional reviewer）**：例如 opencode 可以作为验收视角的补充，提供分析供决策参考，但拍板权在编排侧。opencode 始终是增值项，不是主路径。
- **执行worker**：只负责在边界内实现并返回证据，不做 acceptance 判断，不跑 `spec-review`，不决定 archive。

Archive 是显式的高信任操作，由决策owner持有。执行路径（orchestrator → execution worker）和验收路径（decision owner、可选reviewer）是分开的。

**Guardrails**
- Codex 审查是 mandatory。
- Claude 可作为补充视角，但不是硬前提。
- 审查必须对照 spec、design、tasks 和执行回传证据。

**Steps**
1. 选择 change
   - 运行 `openspec list --json`。
   - 选择待验收的 change。
   - 运行 `openspec status --change "<change_id>" --json`。

2. 收集验收材料
   - 读取 `proposal.md`、`design.md`、`tasks.md`、`specs/**/*.md`。
   - 读取最近的 `Execution Return Packet` / `Rework Packet`。
   - 查看 `git diff` 与本地验证结果。

3. Codex 验收
   - 检查：
     - tasks 是否完成
     - 规格约束是否满足
     - required verification 是否具备证据
     - 是否存在越界修改
   - 必要时运行独立测试/检查。

4. 做出判定
   - 若失败：
     - 输出 `Acceptance Failed`
     - 生成新的 rework packet
     - 指示回到 `/ccsm:team-exec` 或 `/ccsm:spec-impl`
   - 若通过：
     - 输出 `Acceptance Passed`
     - 允许 archive

5. 归档
   - 仅在通过时内部调用 `/opsx:archive`。
   - 归档后报告 archived change id。

**Result Format**
失败：

```md
## Acceptance Failed

### Reasons
- ...

### Rework Packet
- ...

Next: /ccsm:team-exec
```

通过：

```md
## Acceptance Passed

- change: <change_id>
- archive: completed
```

**Exit Criteria**
- [ ] Codex 已完成最终验收
- [ ] 失败时已打回执行层
- [ ] 通过时已 archive
<!-- CCG:SPEC:REVIEW:END -->
