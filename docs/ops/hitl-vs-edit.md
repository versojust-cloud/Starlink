# HITL（人在回路）vs 普通编辑 — 概念 + 实现差别

整理：答辩问"HITL 不就是用户手动改吗？"时的一句话回答 + 代码指向。

---

## 一句话区别

| | 普通编辑 | HITL |
|---|---|---|
| **谁主动** | 用户主动点 | **系统主动暂停**等待人类决策 |
| **流程是否暂停** | 不暂停 | 整条 LangGraph **暂停在 interrupt 点**直到人类回复 |
| **决策是否影响后续** | 改完节点就完了，pipeline 不会再跑 | **决策注入回 supervisor 路由**，决定 round-2 走哪条分支 |
| **是否可跨进程** | 仅本机 React state | **跨进程通过 PG checkpointer 恢复**（A 触发，B 处理） |
| **关键代码** | `setNodes()` in store | `interrupt()` in LangGraph + `resumeConversation()` mutation |

---

## 实现细节（论文可引）

### 1. 系统主动暂停 — `interrupt()` 不是用户写的代码

`packages/server/src/services/business-langgraph.ts:578-589`：

```ts
// 如果有高严重度冲突且还有修正轮次，发送 interrupt 信号
const highSeverityConflicts = conflicts.filter((c) => c.severity === 'high')
if (highSeverityConflicts.length > 0) {
  const roundNum = (payload as { roundNumber?: number }).roundNumber
  if (roundNum !== undefined && roundNum < MAX_ROUNDS) {
    yield {
      type: 'interrupt',
      decision: `发现 ${highSeverityConflicts.length} 个高严重度冲突`,
      conflicts: highSeverityConflicts
    }
  }
}
```

- 系统**自己判断**冲突是否严重（critic 输出），自己决定是否暂停
- 暂停后 LangGraph state 通过 `PostgresSaver` 写到 `checkpoints` 表
- 用户没做任何操作，但流程停了

### 2. 人类决策的 grammar — 不是自由文本

`packages/server/src/application/hitl-resume.ts`：

```
[ACCEPTED]                          → 保留当前 BMC，停止 critic loop
[EDIT_PLAN]:<freeform body>         → 跑 round-2，全维度修订
[EDIT_PLAN][<bmc-domain>]:<body>    → 仅修订一个维度（如 "客户细分"）
[REJECTED]                          → 停止 loop，当前为最终态
```

不是"用户改了节点 → 系统继续"，而是"用户**回答一个具体问题**：你接受还是要修订；要修订的话改哪个维度"。

### 3. 决策注入 supervisor — `business-langgraph.ts:806`

```ts
const directive = this.consumeHitlResumeDirective(state.traceId)
if (directive && shouldHaltCriticLoop(directive)) {
  // [ACCEPTED] / [REJECTED] → END
  return { roundNumber: nextRound, conflicts: [], supervisorDirective: { activeAgents: [] } }
}
// [EDIT_PLAN]:auto → supervisor 决定 round-2 哪些 agent 跑
// [EDIT_PLAN][客户细分]:body → 只让 market-agent 跑，其他跳过
```

- 用户决策**改变路由**，不是改变节点内容
- supervisor 的 conditional edge 读取 directive 决定下一步
- 这是 blackboard 模式里 control-component 的典型行为

### 4. 跨进程恢复 — `resumeConversation` mutation

进程 A 触发 interrupt → 写 `hitl_approval_store` PG 表 → 进程 A 退出
用户在浏览器点 "接受" → graphql `resumeConversation(conversationId, "[ACCEPTED]")`
请求路由到进程 B → B 通过 `langgraph-checkpointer` 加载 LangGraph state + 读 directive → 从断点继续

`packages/server/src/scripts/smoke-hitl-pg-cross-instance.js` 验证这个端到端。

---

## 普通编辑做的事

用户点 BMC cell → 弹 drawer → 改 content → 保存 → 前端 store 更新 → 服务器持久化 canvas_graphs。

**注意**：pipeline **不会重跑**。这只是"用户对成品做后期修正"。HITL 是 pipeline 跑到一半时的"人类决策"。

代码：`apps/web/src/features/comfy/components/cc-bmc-detail-drawer.tsx` 的 onSave 路径。

---

## 论文怎么讲（§3.x HITL 章节模板）

> HITL（Human-in-the-Loop）在本系统中扮演**控制层人类决策点**的角色，区别于普通用户编辑。系统在 critic agent 检出 high-severity 跨维度冲突时，通过 LangGraph 的 `interrupt()` 主动暂停整个 BMC 生成流程，并将当前 LangGraph state 通过 `PostgresSaver` 持久化到 `checkpoints` 表。前端弹出 HITL Banner 并展示具体冲突详情；用户必须给出结构化决策（`[ACCEPTED]` / `[EDIT_PLAN][维度]:具体修订要求` / `[REJECTED]` 之一），决策通过 `resumeConversation` GraphQL mutation 写入 `hitl_approval_store` 表。下一轮 supervisor 节点读取该 directive，**决定 round-2 由哪些 agent 跑**：例如 `[EDIT_PLAN][客户细分]:增加农村市场假设` 会让 supervisor 只激活 market-agent 进行单维度修订。这种机制实现了三个普通编辑无法提供的能力：(1) 系统主动控制何时需要人类介入；(2) 决策语义化为 directive 影响后续路由；(3) 通过 PG checkpointer 支持跨进程恢复，使 HITL 在水平扩展的后端集群中仍然有效。验证脚本 `smoke-hitl-pg-cross-instance` 端到端覆盖该路径。

---

## 答辩可能的追问 + 应对

> Q: 用户决策是否一定要按 grammar 写？
> A: 前端 HITL Banner 提供按钮（接受 / 自动修订 / 编辑各维度）+ 文本框，自动拼装成 directive。用户感知层是按钮，系统层是 grammar。

> Q: 如果用户不回答呢？
> A: `HITL_APPROVAL_TIMEOUT_MS=10min` 后服务器自动降级（auto-revise）。Wizard graduation 走 headless 模式跳过等待。

> Q: 这和"自动 critic 重跑" 有什么区别？
> A: 自动 critic 是"系统自己迭代"（同一个 supervisor 决策）；HITL 是"系统暂停 + 人类决策 + supervisor 接受人类决策"。后者把 control 移交给人，前者是系统全自治。

> Q: 跨进程恢复为什么重要？
> A: 生产环境后端会水平扩展（多副本），无亲缘性路由的话用户的下一次请求可能落到不同实例。如果 HITL 状态只存内存，跨实例就丢了。我们用 PG 持久化保证任何实例都能恢复。
