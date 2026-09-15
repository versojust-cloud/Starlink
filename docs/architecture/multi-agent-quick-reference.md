# Braching Chat 多Agent 系统 — 快速参考导航

## 🎯 快速查找

### "我要找 XXX"

| 需求 | 查看位置 | 关键文件 |
|------|--------|--------|
| **Agent 定义** | 6 种 Agent 角色详解 | `business-langgraph.ts` L32-40 |
| **CC-BMC 维度** | 九大维度定义 | `macra.ts` L6-17 |
| **工作流流程** | 执行流程详解 | `business-langgraph.ts` L317-340 |
| **前端 Canvas** | ReactFlow 画布 | `canvas.tsx` L228-550 |
| **全局状态** | 状态管理 | `comfy-store.ts` L194-310 |
| **类型系统** | 数据类型定义 | `macra.ts` L1-140 |
| **GraphQL API** | 后端接口 | `resolvers.ts` |
| **数据持久化** | 数据库模型 | `conversation-store.ts` |

---

## 🔍 按需求探索

### "我要理解整个流程"

1. **用户角度** → `执行流程详解` 中的 "用户交互流程"
2. **后端角度** → `LangGraph 状态机` 流程图
3. **前端角度** → `canvas.tsx` 的 `handleSeedGeneration()` 方法

### "我要添加新 Agent"

1. 定义新 Agent 类型在 `AGENT_TYPES` (macra.ts)
2. 在 `BusinessState` 中添加输出字段
3. 在 `business-langgraph.ts` 中：
   - 实现 `runXxxAgent()` 方法
   - 在 `createGraph()` 中 `.addNode('xxxAgent', ...)`
   - 在条件边中决定何时调用

### "我要修改工作流逻辑"

1. 查看 `createGraph()` 的边定义 (business-langgraph.ts L317-340)
2. 修改条件边的分支逻辑
3. 添加或删除 `.addNode()` 和 `.addEdge()` 调用

### "我要改变 Agent 的输出格式"

1. 修改 `MacraNodeDataSchema` (business-langgraph.ts L45-62)
2. 更新 `AGENT_TYPES` 中相关 Agent 的字段描述
3. 在 LLM prompt 中更新输出示例

### "我要调试前后端连接"

1. 查看 GraphQL mutation 定义 (resolvers.ts)
2. 前端调用：`useComfyStore.callLangGraph()`
3. 后端日志：所有 agent 都有 `logTrace()` 调用
4. WebSocket 订阅：`watchConversation()` 函数

---

## 📊 架构分层速查

### Layer 1: Frontend Components
```
canvas.tsx
├─ Header (顶部导航)
├─ Sidebar (左侧节点库 + 种子输入)
├─ Canvas Area (ReactFlow 画布)
│  └─ Node Components (11 种节点)
└─ Chat Panel (右侧对话面板)
```

### Layer 2: State Management
```
useComfyStore (Zustand)
├─ 图数据 (nodes, edges)
├─ 执行状态 (isProcessing)
├─ UI 状态 (detailPanel, tutorial)
└─ Chat 消息 (chatMessages)
```

### Layer 3: Backend Services
```
BusinessLangGraphService
├─ Router Agent → 意图分类
├─ [Parallel]
│  ├─ Market Agent → 客户/渠道/关系
│  ├─ Product Agent → 价值/业务
│  └─ Finance Agent → 收入/成本
├─ Orchestrator → 聚合 + Avatar + 边
└─ Critic → 冲突检测
```

### Layer 4: Data Layer
```
PostgreSQL
├─ conversations (对话历史)
├─ workspace_graphs (画布快照)
├─ agents (Agent 配置)
└─ artifacts (生成结果)
```

---

## 🔄 常见操作流程

### 流程 1: 用户输入种子 → 生成完整商业画布

```
用户输入 "新能源汽车市场分析"
    ↓
canvas.tsx: handleSeedGeneration()
    ↓
useComfyStore.callLangGraph(seed, 'seed')
    ↓
GraphQL: startConversation(workspaceId, question)
    ↓
BusinessLangGraphService.streamConversation()
    ├─ yield { type: 'init', graph }
    ├─ routerAgent → 识别为 'generate_bmc'
    ├─ [并行运行]
    │  ├─ marketAgent → 客户细分/渠道/关系卡片
    │  ├─ productAgent → 价值主张/关键业务卡片
    │  └─ financeAgent → 收入来源/成本结构卡片
    ├─ orchestrator → 创建 Avatar + 连接边
    ├─ critic → 检测冲突
    └─ yield { type: 'status', status: 'completed' }
    ↓
WebSocket 推送更新
    ↓
前端 canvas 实时渲染
    ↓
用户看到完整的商业模型
```

### 流程 2: 用户点击 Agent Avatar → 发起对话

```
用户点击 Agent Avatar 节点
    ↓
AgentAvatarNode.tsx 打开对话框
    ↓
用户输入问题，点击发送
    ↓
canvas.tsx: handleSendChat()
    ↓
useComfyStore.callLangGraph(userInput, 'general')
    ↓
后端重新执行 LangGraph（新问题）
    ↓
ChatMessages 更新
    ↓
右侧 Chat Panel 显示新对话
```

### 流程 3: Critic 检测到冲突

```
orchestrator 生成完整图
    ↓
critic 分析图结构
    ↓
检测到矛盾关系（例：收入模式 ↔ 目标客户不匹配）
    ↓
生成 conflict-alert 节点
    ↓
前端显示红色警告节点 + 闪电连接边
    ↓
用户可点击警告查看冲突详情
```

---

## 🛠️ 开发技巧

### Debug LangGraph 流程

1. 添加日志：在各 Agent 方法中使用 `auditLogger`
2. 检查流式输出：在 `streamConversation()` 中的 `for await` 循环
3. 查看状态变化：在 `businessState` 转移时输出

### 修改 Agent Prompt

所有 Agent prompt 都在对应方法中，搜索：
- `routeIntent()` L359
- `runMarketAgent()` L431
- `runProductAgent()`
- `runFinanceAgent()`
- `orchestrate()`
- `runCritic()`

### 调试前端状态

```typescript
// 在浏览器控制台
const store = window.__store__ // 需要暴露
console.log(store.getState())
```

### 查看 API 日志

- GraphQL 日志：GraphQL server console
- LangGraph 日志：auditLogger 输出
- 前端日志：浏览器 DevTools

---

## 📋 术语表

| 术语 | 含义 | 示例 |
|------|------|------|
| **MacraNodeData** | 画布节点的完整数据结构 | `{ id, type, label, content, metadata }` |
| **CanvasGraph** | 完整的图结构 (nodes + edges) | `{ nodes: [...], edges: [...] }` |
| **GraphDelta** | 增量更新 | `{ nodes: [new1, new2], edges: [edge1] }` |
| **Intent** | 用户意图分类 | `{ intent: 'generate_bmc', reasoning: '...' }` |
| **Agent Avatar** | 虚拟顾问节点 | `type: 'agent-avatar'`, 可交互 |
| **CC-BMC** | 商业模型九维度 | 客户、价值、渠道等 |
| **Conflict Alert** | 冲突警告节点 | 标记矛盾和风险 |
| **Orchestrator** | 编排器 Agent | 聚合输出 + 生成关系 |
| **Critic** | 批评者 Agent | 检测和标记冲突 |

---

## 🚦 工作流决策树

```
用户输入问题
    ↓
Router Agent 分类意图
    ↓
    ├─ 意图 = 'generate_bmc'
    │   ├─ 运行 Market Agent (客户分析)
    │   ├─ 运行 Product Agent (产品分析)
    │   ├─ 运行 Finance Agent (财务分析)
    │   └─ 进入 Orchestrator
    │
    ├─ 意图 = 'detect_conflicts'
    │   └─ 直接跳到 Critic
    │
    └─ 意图 = 'general' 或 'analyze'
        └─ 直接进入 Orchestrator (生成通用回复)

Orchestrator 聚合所有输出
    ├─ 合并 nodes
    ├─ 创建 Agent Avatar
    ├─ 生成连接边
    └─ 进入 Critic

Critic 检测冲突
    ├─ 分析节点关系
    ├─ 发现矛盾
    └─ 生成 Alert 节点

流程完成，推送到前端
```

---

## 🔗 关键代码片段位置

### 启动 LangGraph

```typescript
// 文件: business-langgraph.ts
// 方法: streamConversation()
// 行: L132-315
```

### 创建图拓扑

```typescript
// 文件: business-langgraph.ts
// 方法: createGraph()
// 行: L317-340
// 关键: 定义了节点和边的完整拓扑
```

### 前端触发

```typescript
// 文件: canvas.tsx
// 方法: handleSeedGeneration()
// 行: L158-187
```

### 状态管理

```typescript
// 文件: comfy-store.ts
// 方法: callLangGraph()
// 行: L381-534
```

---

## 💡 最佳实践

1. **修改 Agent**：总是同时更新 prompt 和 schema
2. **添加字段**：确保在 MacraNodeDataSchema 中声明
3. **错误处理**：使用 try-catch，记录到 auditLogger
4. **性能**：利用并行执行（不要变为顺序）
5. **调试**：使用 traceId 追踪完整流程
6. **前端优化**：使用 React.memo 包裹节点组件（已完成）

---

## 📞 常见问题

**Q: 如何改变 Agent 执行顺序？**
A: 修改 `createGraph()` 中的 `.addEdge()` 调用

**Q: 为什么某个 Agent 没有执行？**
A: 检查条件边逻辑 (L326-335)

**Q: 如何添加新类型的冲突检测？**
A: 修改 `runCritic()` 的分析逻辑

**Q: 前端画布为什么没更新？**
A: 检查 `watchConversation()` 订阅和 `applyDelta()` 逻辑

**Q: 如何持久化 Agent 对话？**
A: 对话自动保存到 `conversation-store`（数据库）

