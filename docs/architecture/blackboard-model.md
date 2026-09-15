# 黑板模型（Blackboard Model）— 概念落地

整理：开题报告 §3.1 提到的"黑板模型思想"在本系统的具体实现。

---

## 一句话定位

经典黑板模型（Hayes-Roth, 1985 "A Blackboard Architecture for Control"; HEARSAY-II 系统）的三要素：
1. **Blackboard** — 共享知识库
2. **Knowledge sources** — 多个独立专家
3. **Control component** — 决定谁下一步上场

本系统通过 **LangGraph 的 `Annotation.Root` + `StateGraph`** 实现这三要素。

> ⚠️ 注意：LangGraph 文档里**没有** "blackboard" 这个 term — 它叫 `StateGraph`/`Annotation.Root`/`Reducers`。"黑板模型"是经典 AI 文献的术语，本工作把 LangGraph 的实现**作为**黑板模型的具体落地。

---

## 三要素映射

### 1. Blackboard ← `BusinessState`（共享状态空间）

`packages/server/src/services/business-langgraph/state.ts:127-200` 定义的 `BusinessState`：

```ts
export const BusinessState = Annotation.Root({
  // — context —
  traceId, workspaceId, userId, question, contextPrompt,
  // — control —
  intent, supervisorDirective, roundNumber,
  // — BMC cells (9 dim) —
  marketNodes, productNodes, financeNodes,
  // — synthesizer output —
  agentAvatars, edges,
  // — critic output —
  conflicts,
  // — debate B-loop —
  debateTurns, debateVerdict,
  // — RAG —
  knowledgeEvidence, citations,
  // — memory —
  userSkillPrompt, supervisorMemoryPrompt,
})
```

所有 12 个 agent 通过同一个 state 读写 — 没有点对点消息。

### 2. Knowledge sources ← 12 agents

每个 agent 是 `addNode` 注册的独立函数：

```ts
const builder = new StateGraph(BusinessState)
  .addNode('supervisor',         async (state) => this.runSupervisor(state))
  .addNode('marketAgent',        async (state) => this.runMarketAgent(state))
  .addNode('productAgent',       async (state) => this.runProductAgent(state))
  .addNode('financeAgent',       async (state) => this.runFinanceAgent(state))
  .addNode('synthesizer',        async (state) => this.runSynthesizer(state))
  .addNode('critic',             async (state) => this.runCritic(state))
  .addNode('generalResponder',   async (state) => this.runGeneralResponder(state))
  .addNode('deepResearchAgent',  async (state) => this.runDeepResearchAgent(state))
```

每个 agent 函数签名 `(state: BusinessState) → Partial<BusinessState>` — **读全局状态，返回部分更新**。LangGraph 的 reducer（默认 last-write-wins per slot）合并回 state。

### 3. Control component ← supervisor + conditional edges

```ts
.addEdge(START, 'supervisor')
.addConditionalEdges('supervisor', (state) => {
  // 根据 state.intent 决定下一步
  if (state.intent?.intent === 'detect_conflicts') return ['critic']
  if (state.intent?.intent === 'general')          return ['generalResponder']
  if (state.intent?.intent === 'deep_research')    return ['deepResearchAgent']
  // 否则按 supervisor directive 决定（HITL 决策注入这里）
  const directive = state.supervisorDirective
  if (directive && directive.activeAgents.length > 0) {
    return directive.activeAgents
  }
  return ['marketAgent', 'productAgent', 'financeAgent']  // 默认全跑
})
.addEdge('marketAgent',  'synthesizer')
.addEdge('productAgent', 'synthesizer')
.addEdge('financeAgent', 'synthesizer')
.addEdge('synthesizer',  'critic')
.addConditionalEdges('critic', (state) => {
  // 高严重度冲突 + 还有轮次 → 回 supervisor 修订
  if (hasHighSeverity && state.roundNumber < MAX_ROUNDS) return ['supervisor']
  return [END]
})
```

**Control component 三个任务**全部由 supervisor + edges 完成：
- 调度（schedule） — `addConditionalEdges('supervisor', ...)`
- 终止判断（halt criterion） — `addConditionalEdges('critic', ...)` 决定 round-N 是否继续
- HITL 决策注入 — supervisor 读 `consumeHitlResumeDirective(traceId)` 把人类决策吸收进 routing

---

## 为什么 blackboard ≠ pipeline

经典反例题：critic agent 需要**同时**看 market / product / finance 三方输出来检测跨维度冲突（如"客户细分写了下沉市场，但渠道写了高端线下店——客户与渠道矛盾"）。

- pipeline 模式：每步只能看上一步输出，critic 只能看 finance 的输出；market 和 product 的输出已经被覆盖或丢失。
- blackboard 模式：critic 读 `state.marketNodes + state.productNodes + state.financeNodes` 全局视图，跨域检测才成立。

同理 synthesizer 推导跨维度边、debate 看共享辩题、HITL 决策跨轮次保留 — 都依赖 blackboard 全局可读性。

---

## 持久化层

`langgraph-checkpointer.ts` 把 `BusinessState` 整体序列化到 PG `checkpoints` / `checkpoint_blobs` 表。每个节点执行后自动 checkpoint。

后果：
1. **HITL 中断恢复**：interrupt 后整个 blackboard 持久化，进程重启 / 切换到另一个进程 都能从断点恢复
2. **审计**：checkpoints 表保留每个节点执行后的 state 快照，可回放
3. **跨进程协作**：进程 A 触发 interrupt，进程 B 处理 resume — 通过 PG 共享 state

---

## 论文怎么写（§3.1 黑板模型章节）

> 系统的多智能体协作采用经典**黑板模型**（Blackboard Model, Hayes-Roth, 1985）思想。具体实现基于 LangGraph 的 `Annotation.Root` 状态注解和 `StateGraph` 状态图：所有智能体共享同一个 `BusinessState` 黑板（包含 BMC 9 维节点、合成器输出、critic 冲突、HITL 决策、RAG 证据、用户画像等 19 个槽位），任何一个智能体节点的执行都可以读取黑板完整状态并返回部分更新，由 LangGraph reducer 合并回主状态。supervisor 作为 control component 担任路由决策，通过条件边 (`addConditionalEdges`) 根据当前黑板内容（intent / round / directive / conflicts）决定下一步激活哪些 agent。这种黑板架构相比顺序 pipeline 的关键优势体现在两个场景：(1) critic agent 需要同时读取 market、product、finance 三方输出来检测跨维度冲突（如客户与渠道矛盾），pipeline 模式下这种跨域信息访问不成立；(2) HITL 中断恢复要求中断时整个状态快照可持久化、跨进程恢复，由 LangGraph 的 `langgraph-checkpointer` 序列化整个 `BusinessState` 到 PG `checkpoints` 表实现。验证脚本 `smoke-hitl-pg-cross-instance` 端到端覆盖跨进程恢复路径。

---

## 答辩追问 + 应对

> Q: LangGraph 的 StateGraph 不就是 blackboard 吗？这是 langgraph 的功能不是你的设计。
> A: LangGraph 提供了实现 mechanism；本工作的设计是**把 BMC 多智能体协作 mapping 成黑板**——决定哪 19 个槽位放进 state（BMC 节点 + 冲突 + 边 + memory + RAG 等）、谁是 control component（supervisor）、终止条件（critic 的 conditional edge）。这个 mapping 是设计工作，不是库自带。

> Q: 黑板模型和 multi-agent system 有什么区别？
> A: 黑板模型是 multi-agent system 的一种**协作架构**。和它对偶的是 contract-net protocol（agent 之间投标谈判）和 pipeline（线性传递）。黑板的特点是 **shared global state + opportunistic activation**——agent 不知道谁前一步做了啥，只读当前状态自己决定贡献。我们的 supervisor 模式是经典黑板的 control 变体（centralized control）。

> Q: critic 检测出来的冲突算不算"涌现"？
> A: 不能这么说。critic 是显式编程的（system prompt + structured output schema）。但**冲突的发现需要黑板全局视图**——这部分是 emergent of the architecture，不是 emergent of any single agent。
