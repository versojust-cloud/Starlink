# 前端架构 v2 — 灵活 · 可扩展 · 可复用

> **版本**：v2.0（2026-04-19）
> **范围**：仅前端（`apps/web/`），后端架构见 `docs/architecture-evidence-grounded-bmc.md`
> **基础**：保留现有 `src/features/comfy/` 组件拆分，引入 3 个 Registry + 1 个状态机，让工具/面板/节点都可插拔
> **目标**：毕业论文 demo 就绪的同时，任何新功能都能"注册而不重写"

---

## 0. 为什么需要 v2

现状（经过 Stage 1-3 后）：

```
apps/web/
├── app/(app)/workspace/[id]/
│   ├── canvas/page.tsx       (2492 行 ModuleCard 大厅 — 死代码)
│   ├── comfy/page.tsx        (1 行 re-export)
│   ├── knowledge/            (KB 管理独立页)
│   ├── translate/            (翻译独立页)
│   ├── deep-research/        (研究独立页)
│   ├── cultural-tools/       (文化工具独立页)
│   ├── seminar/              (研讨会独立页)
│   └── ... 8+ 页面
│
└── src/features/comfy/
    ├── components/
    │   ├── canvas.tsx            (ReactFlow 封装)
    │   ├── canvas-config.tsx     (★ Node Registry 已存在)
    │   ├── canvas-header.tsx     (view mode toggle)
    │   ├── canvas-sidebar.tsx    (seed/palette/critic 三合一混杂)
    │   ├── canvas-chat-panel.tsx (chat + agent panel 耦合)
    │   ├── comfy-canvas-page.tsx (主画布 + HITL 弹窗)
    │   ├── agent-runtime-panel.tsx
    │   ├── citation-badge.tsx / card-field-with-citations.tsx / evidence-drawer.tsx  (Stage 3)
    │   └── nodes/  (11 种节点已注册)
    └── store/comfy-store.ts   (23 state fields + 30+ actions)
```

**现状的 4 个硬痛点**：

| 痛点 | 症状 | 影响 |
|---|---|---|
| Tool 无注册 | translate/research/cultural-tools 各占独立路由，canvas 无法召唤 | 违反 PRD "canvas-based not page-switch-based" |
| Panel 无插拔 | Input / Thinking / Output 流程写死在一个 Sidebar 里 | FRONTEND_REDESIGN 的三阶段落不了地 |
| WorkflowStage 缺失 | `isOrchestratorProcessing` 只是布尔，无 idle/input/thinking/output/review 语义 | UI 无法按流程阶段切换布局 |
| Sidebar/ChatPanel 职责混杂 | CanvasSidebar 同时管 seed 输入 + palette + critic | 新加功能必然往里塞更多东西 |

---

## 1. 分层架构（5 层）

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 1: Route Shell                                       │
│    app/(app)/workspace/[id]/canvas/page.tsx  (一行 re-export)│
├─────────────────────────────────────────────────────────────┤
│  Layer 2: Workspace Shell                                   │
│    WorkspaceShell: Header + LeftRail + Main + RightRail     │
│      提供 "slot" 插槽给上层                                 │
├─────────────────────────────────────────────────────────────┤
│  Layer 3: Panel Registry (可插拔)                           │
│    InputPanel / ThinkingPanel / OutputPanel / ToolPanel ... │
│    每个 Panel 声明 slot + workflowStage 可见性              │
├─────────────────────────────────────────────────────────────┤
│  Layer 4: Canvas + Node Registry                            │
│    ReactFlow Surface + 11 种 Node 类型 (可扩展)             │
├─────────────────────────────────────────────────────────────┤
│  Layer 5: Store + Event Pipeline                            │
│    comfy-store (slice 拆分) + stream event → action 路由    │
└─────────────────────────────────────────────────────────────┘
         ↕  registry / store 边界，不直接跨层调用 GraphQL
┌─────────────────────────────────────────────────────────────┐
│  Layer 6: Tool Registry + API Hooks                         │
│    Translate / DeepResearch / CulturalTools ... 注册为 Tool │
│    每个 Tool: descriptor + invoke + onResult                │
└─────────────────────────────────────────────────────────────┘
```

**依赖方向**（硬规则）：

```
Route → Shell → Panel → Store
                     → Registry
                     → Tool
                     → Canvas / Node

UI 层不直接调 GraphQL，必须通过 store action
Store 不渲染 JSX
Tool 通过 registry 注册，不直接 import 到 Panel
```

---

## 2. 三大 Registry

### 2.1 Node Registry（已存在，只需规范化）

**现状**：`canvas-config.tsx` 已经是 node type → Component 映射。

**规范化**：

```typescript
// src/features/comfy/registries/node-registry.ts
export type NodeDescriptor<TData = unknown> = {
  type: string
  label: string
  icon: string
  component: React.ComponentType<NodeProps<TData>>
  palette?: {
    gradient: string
    description: string
    category: 'bmc' | 'agent' | 'data' | 'insight' | 'misc'
  }
  defaultData: () => TData
}

export const nodeRegistry = new Map<string, NodeDescriptor>()

export function registerNode<T>(descriptor: NodeDescriptor<T>) {
  nodeRegistry.set(descriptor.type, descriptor as NodeDescriptor)
}

// 派生给 ReactFlow
export const reactFlowNodeTypes = () =>
  Object.fromEntries(
    [...nodeRegistry.values()].map((d) => [d.type, d.component])
  )
```

**扩展示例** — 加一个新的 "SWOT 卡片" 节点：

```typescript
// src/features/comfy/nodes/swot-card/index.ts
registerNode({
  type: 'swot-card',
  label: 'SWOT 卡片',
  icon: '🧭',
  component: SwotCardNode,
  palette: { gradient: 'from-violet-400 to-violet-500', category: 'bmc', description: 'SWOT 四象限' },
  defaultData: () => ({ dimension: 'STRENGTH', title: '', content: '' })
})
```

**收益**：添加新节点类型 = 1 个文件 + 1 次 register，零改动到 config / canvas / store。

### 2.2 Panel Registry（新增）

**目的**：FRONTEND_REDESIGN 的 Input / Thinking / Output / Decision 四阶段 Panel 可以作为可注册组件，根据 `workflowStage` 自动显示/隐藏。

```typescript
// src/features/comfy/registries/panel-registry.ts
export type PanelSlot = 'left-rail' | 'right-rail' | 'bottom-tray' | 'overlay'

export type PanelDescriptor = {
  id: string
  slot: PanelSlot
  order: number                                  // 同 slot 内排序
  component: React.ComponentType
  visibleWhen: (stage: WorkflowStage) => boolean // 按 workflow 状态决定是否显示
  defaultCollapsed?: boolean
}

export const panelRegistry = new Map<string, PanelDescriptor>()

export function registerPanel(descriptor: PanelDescriptor) {
  panelRegistry.set(descriptor.id, descriptor)
}

// WorkspaceShell 消费 registry
export function SlotRenderer({ slot }: { slot: PanelSlot }) {
  const stage = useComfyStore((s) => s.workflowStage)
  const panels = useMemo(
    () =>
      [...panelRegistry.values()]
        .filter((p) => p.slot === slot && p.visibleWhen(stage))
        .sort((a, b) => a.order - b.order),
    [stage]
  )
  return <>{panels.map((p) => <p.component key={p.id} />)}</>
}
```

**扩展示例** — 注册 InputPanel + ThinkingPanel：

```typescript
registerPanel({
  id: 'input-panel',
  slot: 'left-rail',
  order: 10,
  component: InputPanel,
  visibleWhen: (stage) => stage === 'idle' || stage === 'input'
})

registerPanel({
  id: 'thinking-panel',
  slot: 'left-rail',
  order: 10,
  component: ThinkingPanel,
  visibleWhen: (stage) => stage === 'thinking'
})

registerPanel({
  id: 'output-panel',
  slot: 'left-rail',
  order: 10,
  component: OutputPanel,
  visibleWhen: (stage) => stage === 'output' || stage === 'review'
})
```

**收益**：同一个 slot 可以装多个 Panel；阶段切换自动切换 Panel；加新 Panel 不改 WorkspaceShell。

### 2.3 Tool Registry（新增，最重要）

**目的**：Translate / Deep Research / Cultural Tools 等"工具"从独立路由变为 canvas 可召唤的能力。每个 Tool 有**统一契约**，Agent 和用户都能调用。

```typescript
// src/features/comfy/registries/tool-registry.ts
export type ToolInvocationMode =
  | 'inline-drawer'     // 打开右侧 drawer 交互
  | 'slash-command'     // 聊天输入框 /tool-name 触发
  | 'context-menu'      // 右键节点菜单
  | 'agent-auto'        // agent 自动调用

export type ToolDescriptor<TInput = unknown, TResult = unknown> = {
  id: string
  name: string
  icon: React.ComponentType | string
  category: 'research' | 'translation' | 'analysis' | 'utility'
  modes: ToolInvocationMode[]

  // 前端 UI（可选，用于 drawer 模式）
  DrawerComponent?: React.ComponentType<{ input?: TInput; onResult: (r: TResult) => void }>

  // 核心调用
  invoke: (input: TInput, ctx: ToolContext) => Promise<TResult>

  // 结果处理：把结果注入 canvas（例如生成节点）
  onResult?: (result: TResult, ctx: ToolContext) => void
}

export type ToolContext = {
  workspaceId: string
  conversationId: string | null
  selectedNodeIds: string[]
  store: ReturnType<typeof useComfyStore.getState>
  addNode: (node: Partial<CanvasNode>) => void
  appendChatMessage: (message: ChatMessage) => void
}

export const toolRegistry = new Map<string, ToolDescriptor>()

export function registerTool(t: ToolDescriptor) {
  toolRegistry.set(t.id, t)
}
```

**扩展示例** — 注册 Deep Research Tool：

```typescript
registerTool({
  id: 'deep-research',
  name: '深度研究',
  icon: Microscope,
  category: 'research',
  modes: ['slash-command', 'agent-auto'],
  invoke: async (input: { query: string }, ctx) => {
    const result = await callDeepResearchAPI(input.query)
    return result  // { report: string, citations: [] }
  },
  onResult: (result, ctx) => {
    // 把研究结果变成 canvas 上的 insight-note 节点
    ctx.addNode({
      type: 'insight-note',
      position: { x: 400, y: 300 },
      data: { title: 'Deep Research', content: result.report, meta: { citations: result.citations } }
    })
  }
})
```

**收益**：
- 加新工具 = 1 个文件 + 1 次 register
- Agent 通过 `toolRegistry.get('deep-research').invoke(...)` 自动调用
- 用户通过 slash command / 右键菜单 / drawer 任意方式触发
- 独立路由页可以废弃（也可以并存直到迁移完成）

---

## 3. WorkflowStage 状态机（核心）

### 3.1 状态定义

```typescript
export type WorkflowStage =
  | 'idle'          // 无会话
  | 'input'         // 用户正在输入问题 / 选 KB
  | 'thinking'      // 多智能体分析中
  | 'output'        // 分析完成，显示结果
  | 'review'        // HITL 冲突等待用户决策
  | 'revising'      // 用户决策后，revision 中
  | 'failed'        // 错误
  | 'cancelled'     // 用户取消
```

### 3.2 转换规则

```
idle      --[startAnalysis]-->     input
input     --[submit]-->            thinking
thinking  --[done.noConflict]-->   output
thinking  --[critic.conflict]-->   review
review    --[approveDecision]-->   revising
review    --[skip]-->              output
revising  --[done]-->              output
output    --[newQuestion]-->       input
*         --[error]-->             failed
*         --[cancel]-->            cancelled
failed    --[retry]-->             input
```

### 3.3 Store Integration

```typescript
// comfy-store.ts
interface WorkflowState {
  workflowStage: WorkflowStage
  workflowMeta: {
    roundNumber: number
    startedAt: string | null
    lastError: string | null
  }
  setWorkflowStage: (stage: WorkflowStage, reason?: string) => void
}

// 转换时自动 log + emit event
setWorkflowStage: (stage, reason) => {
  const prev = get().workflowStage
  if (!canTransition(prev, stage)) {
    console.warn(`[workflow] illegal transition ${prev} → ${stage}`)
    return
  }
  set({ workflowStage: stage })
  // 广播给任何订阅者（比如埋点、分析）
}
```

**收益**：UI 不再依赖 `isOrchestratorProcessing` 的 true/false 二值，可以基于 `workflowStage` 做**精细的 UI 切换**（比如 thinking 时显示 Agent 进度条，review 时显示 HITL 弹窗）。

---

## 4. Store Slice 拆分指南

现状：`comfy-store.ts` 单 store 23 个 state + 30+ actions，已经快失控。

### 4.1 Slice 划分（Zustand combined store 模式）

```typescript
// src/features/comfy/store/index.ts
import { create } from 'zustand'

export const useComfyStore = create<
  CanvasSlice & ConversationSlice & CitationSlice & ChatSlice & WorkflowSlice
>()((...args) => ({
  ...createCanvasSlice(...args),        // nodes/edges/viewport
  ...createConversationSlice(...args),  // currentConversationId/evidence/approveDecision
  ...createCitationSlice(...args),      // citations/evidenceDrawer
  ...createChatSlice(...args),          // chatInput/chatMessages
  ...createWorkflowSlice(...args)       // workflowStage/workflowMeta
}))
```

### 4.2 Slice 责任表

| Slice | 管理什么 | 不管什么 |
|---|---|---|
| CanvasSlice | nodes, edges, macraNodes, onNodesChange, onEdgesChange | 业务逻辑、会话状态 |
| ConversationSlice | currentConversationId, knowledgeEvidence, pendingInterrupt, callLangGraph, approveDecision | UI 状态、画布节点 |
| CitationSlice | citations, evidenceDrawer | 其他 drawer |
| ChatSlice | chatInput, chatMessages, appendChatMessage | 会话生命周期 |
| WorkflowSlice | workflowStage, workflowMeta | 具体业务状态 |

**收益**：
- 每个 Slice 独立可测
- 新加功能不必改 god-object
- selector 粒度细，重渲染少

---

## 5. Event Pipeline（Stream → Store）

现状：`comfy-store.callLangGraph` 里手动注册 watcher 回调，30+ 行内嵌逻辑。

### 5.1 抽象为 Event Router

```typescript
// src/features/comfy/runtime/event-router.ts
type EventHandler<E = unknown> = (event: E, store: ComfyStoreApi) => void

const registry = new Map<string, EventHandler>()

export function registerEventHandler<E>(type: string, handler: EventHandler<E>) {
  registry.set(type, handler as EventHandler)
}

export function routeEvent(event: { type: string; payload?: unknown }, store: ComfyStoreApi) {
  registry.get(event.type)?.(event, store)
}
```

### 5.2 注册处理器（按 stream event type）

```typescript
// src/features/comfy/runtime/handlers.ts
registerEventHandler('graph/appended', (e, store) => {
  store.applyGraph(e.payload as WorkspaceGraphResponse)
})

registerEventHandler('graph/diff', (e, store) => {
  store.applyDelta(e.payload as GraphDelta)
})

registerEventHandler('evidence/updated', (e, store) => {
  store.setKnowledgeEvidence(e.payload as KnowledgeEvidence[])
})

registerEventHandler('card/cited', (e, store) => {
  const data = e.payload as { cardId: string; citation: CardCitation }
  store.setCardCitation(data.cardId, data.citation)
})

registerEventHandler('seminar.decision.requested', (e, store) => {
  store.setWorkflowStage('review')
  store.setPendingInterrupt(e.payload)
})
```

### 5.3 CallLangGraph 瘦身

```typescript
callLangGraph: async (question, mode, kbId) => {
  const store = get()
  store.setWorkflowStage('thinking')
  store.clearCitations()
  const { conversationId } = await startConversationMutation({ question, kbId })
  store.setCurrentConversationId(conversationId)

  const watcher = watchConversation({
    workspaceId: store.workspaceId,
    conversationId,
    onEvent: (event) => routeEvent(event, useComfyStore.getState())
  })
  await watcher.done
  store.setWorkflowStage('output')
}
```

**收益**：新增 stream event 类型 = 1 个 `registerEventHandler`，不改 store 主流程。

---

## 6. WorkspaceShell 布局（重新定义）

### 6.1 结构

```tsx
<WorkspaceShell>
  <HeaderSlot>
    <WorkflowStageIndicator />    {/* 全局进度条 */}
    <ViewModeToggle />            {/* freeform / bmc-grid */}
    <ToolsMenu />                 {/* ToolRegistry drop-down */}
  </HeaderSlot>

  <LeftRailSlot>
    <SlotRenderer slot="left-rail" />   {/* Input/Thinking/Output 按 stage 切换 */}
  </LeftRailSlot>

  <MainSlot>
    <CanvasFlow />                 {/* 或 BmcGrid，根据 viewMode */}
  </MainSlot>

  <RightRailSlot>
    <SlotRenderer slot="right-rail" />  {/* AgentActivityPanel / EvidenceDrawer 等 */}
  </RightRailSlot>

  <BottomTraySlot>
    <ChatInput />
  </BottomTraySlot>

  <OverlaySlot>
    <SlotRenderer slot="overlay" />     {/* HITLDialog / ToolDrawer / 弹窗类 */}
  </OverlaySlot>
</WorkspaceShell>
```

### 6.2 现有组件映射

| 当前组件 | v2 定位 |
|---|---|
| `CanvasHeader` | HeaderSlot 的 ViewModeToggle + 扩展 WorkflowStageIndicator |
| `CanvasSidebar` | 拆分：seed 输入 → InputPanel (registered)；palette → ToolsMenu；critic → OutputPanel |
| `CanvasChatPanel` | 拆分：chat → ChatInput (BottomTray)；AgentRuntimePanel → ThinkingPanel (registered, right-rail) |
| `CanvasFlow` | MainSlot 直接渲染 |
| `comfy-canvas-page.tsx` HITL 弹窗 | 抽出为 HITLDialog 组件，registerPanel(slot='overlay') |
| `EvidenceDrawer` | registerPanel(slot='overlay') |
| `CCBMCDetailDrawer` | registerPanel(slot='overlay') |

---

## 7. 扩展指南（新增功能怎么做）

### 7.1 加一个新 Agent（例如 ESG Agent）

```typescript
// 1. 后端: business-langgraph 加 runEsgAgent
// 2. 前端: src/features/comfy/registries/agent-registry.ts 加 descriptor
registerAgent({
  id: 'esg',
  name: 'ESG Agent',
  color: 'emerald',
  dimensions: ['ENVIRONMENTAL', 'SOCIAL', 'GOVERNANCE']
})
// 3. ThinkingPanel 自动展示此 Agent 进度（读 agentRegistry）
```

### 7.2 加一个新 Tool（例如 PDF Export）

```typescript
registerTool({
  id: 'pdf-export',
  name: '导出 PDF',
  icon: FileDown,
  category: 'utility',
  modes: ['slash-command'],
  invoke: async (input, ctx) => {
    const pdf = await generatePDF(ctx.store.nodes, ctx.store.edges)
    return { url: pdf }
  },
  onResult: (r, ctx) => window.open(r.url)
})
// 自动出现在 ToolsMenu，用户可 /pdf-export 触发
```

### 7.3 加一个新 Panel（例如 ExplainabilityPanel）

```typescript
registerPanel({
  id: 'explainability',
  slot: 'right-rail',
  order: 20,
  component: ExplainabilityPanel,
  visibleWhen: (stage) => stage === 'output' || stage === 'review'
})
```

### 7.4 加一个新 Node 类型

见 §2.1 示例。

### 7.5 加一个新 Stream Event 类型

```typescript
// 后端先加 event emit
// 前端: src/features/comfy/runtime/handlers.ts 加
registerEventHandler('my-new-event', (e, store) => {
  // 处理
})
```

---

## 8. 从现状到 v2 的 Delta

按影响度排序：

| # | 动作 | 工作量 | 风险 |
|---|---|---|---|
| 1 | 把 `comfyNodeTypes` 改为 `nodeRegistry` + `reactFlowNodeTypes()` | 0.5 d | 低 |
| 2 | 新建 `panelRegistry` + `SlotRenderer` + `WorkspaceShell` 重写（从 comfy-canvas-page） | 1.5 d | 中 |
| 3 | 拆 `CanvasSidebar` 为 InputPanel / ToolsMenu / (critic 合入 OutputPanel) | 1 d | 中 |
| 4 | 拆 `CanvasChatPanel` 为 ChatInput + ThinkingPanel（现 AgentRuntimePanel） | 0.5 d | 低 |
| 5 | 新建 `WorkflowStage` 状态机 + 状态转换守卫 | 0.5 d | 低 |
| 6 | `callLangGraph` 改为 Event Router 模式 | 0.8 d | 中 |
| 7 | Store slice 拆分（5 个 slice） | 1 d | 中 |
| 8 | `toolRegistry` + 迁移第一个 Tool（Deep Research）作为试点 | 1.5 d | 中 |
| 9 | 废弃 `canvas/page.tsx` (ModuleCard 大厅) + 其他独立工具路由 | 0.3 d | 低（有 git 历史） |

**合计 7-8 天**，可拆成 3-4 批：

| 批次 | 内容 | 交付 |
|---|---|---|
| Batch 1 | Node/Panel Registry + WorkspaceShell + WorkflowStage | 可视化基础 |
| Batch 2 | Sidebar/ChatPanel 拆分 + 废弃装饰大厅 | UX 清晰化 |
| Batch 3 | Event Router + Store slice | 内部健康 |
| Batch 4 | Tool Registry + 第一个 Tool 迁移 | 可扩展性验证 |

---

## 9. 3 个硬性规则（审 code 红线）

**规则 1：UI 不直接 GraphQL**

```
❌ 组件里写 gql.query(...)
✅ 组件调 useComfyStore(state => state.fetchConversation)
```

**规则 2：Registry 不被业务 import**

```
❌ InputPanel.tsx 里 import { DeepResearchTool }
✅ InputPanel 通过 toolRegistry.values() 读
```

**规则 3：新增事件类型必须先注册 handler**

```
❌ 后端 publish 新 event, 前端直接在 callLangGraph 里 if/else
✅ 后端 publish 新 event, 前端 registerEventHandler(...)
```

---

## 10. 与论文 §5 "系统实现" 的映射

| 论文章节 | v2 前端抽象 |
|---|---|
| 5.1 前端总体架构 | 本文档 §1 5 层 |
| 5.2 多视图切换 | §6 WorkspaceShell + ViewModeToggle + BmcGrid/CanvasFlow 切换 |
| 5.3 知识库接入 | §2.3 Tool Registry 的 'kb-retrieval' tool + citation slice |
| 5.4 多智能体可视化 | §2.2 ThinkingPanel (right-rail) + agentRegistry |
| 5.5 HITL 交互 | §3 WorkflowStage + HITLDialog overlay |
| 5.6 扩展性设计 | §2 + §7 三 Registry + 扩展指南 |

**评委提问防御**：

> Q: "你的前端如何保证可扩展？"
> A: §2 三 Registry（Node / Panel / Tool）+ §5 Event Router，任何新功能都是"注册"而非"修改"。

> Q: "新加一个分析维度怎么做？"
> A: §7.1 registerAgent + §7.4 registerNode，两个文件加起来 < 50 行。

> Q: "你这和一般 Plugin 系统有什么区别？"
> A: 3 个 Registry 各自边界清晰（Node 是数据容器，Panel 是 UI 插槽，Tool 是能力）—Plugin 系统通常混在一起。我们的 Registry 和论文章节直接对应。

---

## 附录 A：Registry 实现模板（最小可用）

```typescript
// src/features/comfy/registries/base-registry.ts
export function createRegistry<T extends { id: string }>() {
  const map = new Map<string, T>()
  return {
    register(item: T) { map.set(item.id, item) },
    unregister(id: string) { map.delete(id) },
    get(id: string) { return map.get(id) },
    all() { return [...map.values()] },
    filter(pred: (t: T) => boolean) { return this.all().filter(pred) }
  }
}

// 使用：
export const nodeRegistry = createRegistry<NodeDescriptor>()
export const panelRegistry = createRegistry<PanelDescriptor>()
export const toolRegistry = createRegistry<ToolDescriptor>()
export const agentRegistry = createRegistry<AgentDescriptor>()
```

## 附录 B：现有组件去向清单

| 现有文件 | 保留 / 重构 / 废弃 | 去向 |
|---|---|---|
| `canvas/page.tsx` (2492) | **废弃** | 改为 1 行 re-export |
| `comfy-canvas-page.tsx` (374) | **重构** | 拆成 WorkspaceShell + 注册各 Panel |
| `canvas.tsx` (93 ReactFlow 封装) | **保留** | MainSlot 直接渲染 |
| `canvas-config.tsx` (72) | **重构** | 迁移到 nodeRegistry |
| `canvas-header.tsx` (72) | **保留** | HeaderSlot |
| `canvas-sidebar.tsx` (137) | **拆分** | seed → InputPanel; palette → ToolsMenu; critic → OutputPanel |
| `canvas-chat-panel.tsx` (103) | **拆分** | chat → ChatInput; agent panel → ThinkingPanel |
| `canvas-regions.tsx` (283) | **保留** | CanvasFlow 内部 |
| `agent-runtime-panel.tsx` (419) | **保留 + 改名** | 成为 ThinkingPanel (registered) |
| `citation-badge.tsx` | **保留** | 不动 |
| `card-field-with-citations.tsx` | **保留** | 不动 |
| `evidence-drawer.tsx` | **保留 + 注册** | registerPanel slot='overlay' |
| `cc-bmc-detail-drawer.tsx` (291) | **保留 + 注册** | registerPanel slot='overlay' |
| `canvas-tutorial-dialog.tsx` (92) | **保留** | 首次访问引导 |
| `quiz-panel.tsx` (296) | **评估** | 如果是 thesis 无关演示，考虑删或延后 |
| `nodes/*.tsx` (11 个) | **保留** | 通过 nodeRegistry 注册 |

---

## 11. 不做的事（明确列出）

- ❌ 不引入新的 UI 库（保留 Radix + Tailwind）
- ❌ 不换状态管理（保留 Zustand，只做 slice 拆分）
- ❌ 不抽象"主题系统"（当前 Tailwind 足够）
- ❌ 不做国际化（只有中文，本毕业论文范围）
- ❌ 不做测试基础设施（只跑现有 tsc 类型检查）
- ❌ 不重新设计 ReactFlow 渲染（已够用）

---

## 下一步

- 本文档定稿后，按 §8 的 Batch 1-4 顺序实施
- Batch 1 是 3 个 Registry + Shell 基础，完成后 §2.2/2.3 的扩展示例就能跑起来
- 每个 Batch 独立 commit
- 建议在 Stage 4 (HITL 闭环) 之前完成 Batch 1-2，Batch 3-4 可以和 Stage 4 并行
