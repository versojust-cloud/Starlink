# Braching Chat 多Agent项目架构解析

## 📋 项目概览

**项目名**: 智绘·无限画布 (Braching Chat)
**核心架构**: MACRA (Multi-Agent Collaborative Reasoning Architecture)
**技术栈**:
- 后端：LangGraph + LangChain + OpenAI
- 前端：Next.js 14 + React 18 + ReactFlow
- 数据库：PostgreSQL + Supabase

---

## 🏗️ 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                      Frontend Layer                          │
│                  (apps/web - Next.js 14)                    │
├─────────────────────────────────────────────────────────────┤
│ ┌──────────────────────────────────────────────────────────┐│
│ │  Canvas UI (ReactFlow)                                   ││
│ │  - CC-BMC 九大维度节点展示                               ││
│ │  - Agent Avatar 节点（虚拟顾问）                         ││
│ │  - Insight/Conflict/DataSource 节点                     ││
│ └──────────────────────────────────────────────────────────┘│
│ ┌──────────────────────────────────────────────────────────┐│
│ │  State Management (Zustand)                              ││
│ │  - useComfyStore: 全局画布和Chat状态                    ││
│ │  - ChatMessages: 用户与AI的对话历史                      ││
│ └──────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
                             ↑
                    WebSocket/GraphQL
                             ↓
┌─────────────────────────────────────────────────────────────┐
│                      Backend Layer                           │
│               (packages/server - Node.js)                   │
├─────────────────────────────────────────────────────────────┤
│ ┌──────────────────────────────────────────────────────────┐│
│ │  GraphQL API (Apollo Server)                             ││
│ │  - startConversation(): 启动 LangGraph 流程              ││
│ │  - watchConversation(): WebSocket 订阅图更新             ││
│ └──────────────────────────────────────────────────────────┘│
│ ┌──────────────────────────────────────────────────────────┐│
│ │  BusinessLangGraphService (LangGraph 编排)               ││
│ │  ┌─────────────────────────────────────────────────────┐││
│ │  │ LangGraph State Machine                            │││
│ │  │ ┌──────────────────────────────────────────────┐   │││
│ │  │ │  START → routerAgent → [branching logic]   │   │││
│ │  │ │    ↓                                        │   │││
│ │  │ │  marketAgent      productAgent   financeAgent   │││
│ │  │ │    ↓                ↓              ↓            │││
│ │  │ │    └────→ orchestrator ←─────────┘             │││
│ │  │ │              ↓                                  │││
│ │  │ │           critic                               │││
│ │  │ │              ↓                                  │││
│ │  │ │            END                                  │││
│ │  │ └──────────────────────────────────────────────┘   │││
│ │  └─────────────────────────────────────────────────────┘││
│ ├──────────────────────────────────────────────────────────┤│
│ │ 6 Agent Nodes:                                          ││
│ │  1. Router Agent      - 意图分类                       ││
│ │  2. Market Agent      - 客户/渠道/关系分析              ││
│ │  3. Product Agent     - 价值主张/关键业务               ││
│ │  4. Finance Agent     - 收入/成本分析                   ││
│ │  5. Orchestrator      - 生成Agent Avatar + 边连接       ││
│ │  6. Critic (Adversarial) - 检测冲突矛盾                 ││
│ └──────────────────────────────────────────────────────────┘│
│ ┌──────────────────────────────────────────────────────────┐│
│ │  Data Models & Validators                                ││
│ │  - MacraNodeData: 节点数据结构 (Zod 验证)               ││
│ │  - IntentSchema: 意图分类 (strict JSON output)          ││
│ │  - CanvasGraph: 图结构                                   ││
│ └──────────────────────────────────────────────────────────┘│
│ ┌──────────────────────────────────────────────────────────┐│
│ │  Application Layer                                        ││
│ │  - conversation-store.ts: 保存对话历史                  ││
│ │  - conversation-runtime-repository.ts: 查询运行时数据   ││
│ │  - workspace-metadata-store.ts: 工作区元数据            ││
│ └──────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
                             ↑
                         SQL/ORM
                             ↓
┌─────────────────────────────────────────────────────────────┐
│                    Database Layer                            │
│              (PostgreSQL via Supabase)                      │
├─────────────────────────────────────────────────────────────┤
│ Tables:                                                      │
│ - conversations: 对话历史                                   │
│ - workspace_graphs: 画布结构                                │
│ - agents: Agent 配置和状态                                  │
│ - artifacts: 生成结果存储                                   │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔄 执行流程详解

### 用户交互流程

```
1. 用户在前端输入问题
   └─→ canvas.tsx: handleSeedGeneration()
       └─→ comfy-store.ts: callLangGraph(prompt, 'seed')
           └─→ GraphQL: startConversation mutation
               └─→ Backend: conversationResolver.startConversation()

2. 后端启动 LangGraph 流程
   └─→ BusinessLangGraphService.streamConversation()
       ├─→ yield { type: 'init', graph: initialGraph }
       └─→ graph.stream() // 逐节点执行

3. LangGraph 节点执行序列

   Route Phase:
   └─→ routerAgent
       ├─→ 解析用户意图
       └─→ 决定分支路由

   Parallel Execution:
   ├─→ marketAgent (if generate_bmc)
   │   ├─ 分析客户细分
   │   ├─ 设计渠道通路
   │   └─ 维系客户关系
   │
   ├─→ productAgent (if generate_bmc)
   │   ├─ 定义价值主张
   │   └─ 规划关键业务
   │
   └─→ financeAgent (if generate_bmc)
       ├─ 分析收入来源
       └─ 评估成本结构

   Aggregation & Connection:
   └─→ orchestrator
       ├─→ 接收所有 Agent 输出
       ├─→ 生成虚拟顾问 Avatar 节点
       ├─→ 创建节点间连接（边）
       └─→ 返回完整的商业模型图

   Validation & Conflict Detection:
   └─→ critic
       ├─→ 检测逻辑冲突
       ├─→ 识别矛盾点
       └─→ 生成警告节点

4. 流式推送更新到前端
   └─→ yield { type: 'delta', delta: { nodes, edges } }
       └─→ WebSocket 推送
           └─→ useComfyStore 更新本地画布
               └─→ ReactFlow 重新渲染

5. 完成信号
   └─→ yield { type: 'status', status: 'completed' }
```

---

## 🤖 六大 Agent 角色解析

### 1. Router Agent （意图分类器）
**职责**：解析用户意图，决定工作流路由
**输入**：用户提问
**输出**：Intent 对象
```typescript
{
  intent: 'generate_bmc' | 'analyze' | 'detect_conflicts' | 'general',
  reasoning: string
}
```
**分支决策**：
- `generate_bmc` → 触发 Market/Product/Finance Agent（并行）
- `detect_conflicts` → 直接跳过到 Critic
- `general` → 跳过到 Orchestrator（生成通用回复）

**技术细节**：
- 使用 LLM 的 `withStructuredOutput()` 确保 JSON schema 严格性
- 错误回退：默认返回 'generate_bmc'

---

### 2. Market Agent （市场分析专家）
**职责**：CC-BMC 三维度分析
- 客户细分 (CUSTOMER_SEGMENTS)
- 渠道通路 (CHANNELS)
- 客户关系 (CUSTOMER_RELATIONSHIPS)

**输入**：用户问题 + 前置意图
**输出**：3 个 cc-bmc-card 节点数组
```typescript
interface MarketNode extends MacraNodeData {
  type: 'cc-bmc-card',
  domain: '客户细分' | '渠道通路' | '客户关系',
  metadata: {
    agent_signature: 'Market_Agent',
    confidence: 'high' | 'medium' | 'low',
    source: '数据来源',
    stage: 'execution'
  }
}
```

**LLM Prompt 特点**：
- 指定输出格式（JSON 数组）
- 包含示例和字段说明
- 要求 Markdown 内容格式
- 数据来源和置信度标注

---

### 3. Product Agent （产品策略专家）
**职责**：CC-BMC 两维度分析
- 价值主张 (VALUE_PROPOSITIONS)
- 关键业务 (KEY_ACTIVITIES)

**输入**：用户问题
**输出**：2 个 cc-bmc-card 节点数组
**特点**：与 Market Agent 并行执行，输出结构相同

---

### 4. Finance Agent （财务分析专家）
**职责**：CC-BMC 两维度分析
- 收入来源 (REVENUE_STREAMS)
- 成本结构 (COST_STRUCTURE)

**输入**：用户问题
**输出**：2 个 cc-bmc-card 节点数组
**特点**：与 Market/Product Agent 并行执行

---

### 5. Orchestrator （编排器）
**职责**：聚合所有 Agent 输出，建立节点关系

**输入状态**：
```typescript
{
  marketNodes: MacraNodeData[],
  productNodes: MacraNodeData[],
  financeNodes: MacraNodeData[],
  edges: CanvasEdge[]
}
```

**处理逻辑**：
1. **聚合节点**：合并所有来自上游 Agent 的节点
2. **生成虚拟顾问**：为每个主要 Agent 创建 Agent Avatar 节点
3. **建立连接**：
   - 根据语义相似度创建节点间边
   - 遵循 CC-BMC 逻辑（例：客户细分 → 渠道通路）
4. **输出**：完整的商业模型图（nodes + edges）

**关键输出**：
```typescript
{
  agentAvatars: [
    {
      type: 'agent-avatar',
      label: 'Market_Agent',
      agentType: 'Market_Agent',
      isInteractive: true // 可点击对话
    },
    // ... 其他 Agent Avatar
  ],
  edges: [
    { source: 'market-xxx', target: 'product-yyy', type: 'default' },
    // ... 其他边
  ]
}
```

---

### 6. Critic （对抗性评论者）
**职责**：检测和标记商业模型中的矛盾和冲突

**输入**：完整的 CanvasGraph（nodes + edges）
**分析维度**：
- 资源-目标冲突
- 合规-业务冲突
- 渠道-产品冲突
- 其他逻辑矛盾

**输出**：Conflict Alert 节点数组
```typescript
{
  type: 'conflict-alert',
  severity: 'high' | 'medium' | 'low',
  conflictType: '资源-目标冲突' | '合规-业务冲突' | ...,
  content: '冲突描述和建议',
  metadata: {
    agent_signature: 'Adversarial_Critic'
  }
}
```

**流程**：
1. 分析节点之间的逻辑关系
2. 识别潜在的矛盾
3. 评估风险等级
4. 生成警告节点插入画布

---

## 📊 数据流和转换

### MacraNodeData 结构

```typescript
interface MacraNodeData {
  // 基础字段
  id: string                    // 唯一标识 (nanoid)
  type: NodeType               // 节点类型
  label: string                // 显示标题
  content: string              // Markdown 内容

  // CC-BMC 特有
  domain?: CCBMCDomain         // 所属维度

  // 扩展内容
  summary?: string             // 摘要版本
  fullContent?: string         // 完整版本

  // 元数据
  metadata: {
    agent_signature?: AgentType // 创建 Agent
    confidence?: 'high' | 'medium' | 'low'
    source?: string             // 数据来源
    stage?: 'planning' | 'execution' | 'review' | 'decision'
    tags?: string[]
    semantic_status?: 'pending' | 'confirmed' | 'needs-clarification'
  }

  // 位置
  position?: { x: number; y: number }

  // Agent 特有字段
  agentType?: AgentType
  isInteractive?: boolean

  // 冲突警告特有
  severity?: 'high' | 'medium' | 'low'
  conflictType?: 'resource-goal' | 'compliance-business' | ...
}
```

### LangGraph State 结构

```typescript
const BusinessState = Annotation.Root({
  // 上下文
  traceId: string,
  workspaceId: string,
  userId: string,
  question: string,

  // 路由结果
  intent: Intent | null,

  // Agent 输出（parallel）
  marketNodes: MacraNodeData[],
  productNodes: MacraNodeData[],
  financeNodes: MacraNodeData[],

  // Orchestrator 输出
  agentAvatars: MacraNodeData[],
  edges: CanvasEdge[],

  // Critic 输出
  conflicts: MacraNodeData[]
})
```

---

## 🔌 前后端集成

### GraphQL 查询

```graphql
mutation StartConversation($workspaceId: ID!, $question: String!) {
  startConversation(workspaceId: $workspaceId, question: $question) {
    metadata {
      id  # conversationId
    }
    graph {
      workspaceId
      nodes {
        id
        type
        position { x, y }
        data
      }
      edges {
        id
        source
        target
        label
      }
    }
  }
}
```

### WebSocket 订阅

```typescript
// 前端：watch 对话更新
const watcher = watchConversation({
  conversationId,
  onGraphAppended: (graph) => {
    // 初始化或完整更新
    applyGraph(graph)
  },
  onGraphDiff: (delta) => {
    // 增量更新
    applyDelta(delta)
  }
})
```

---

## 📈 性能优化点

### 1. **流式处理**
- 后端逐节点 yield 更新，前端实时渲染
- 避免等待全部完成后再显示

### 2. **并行执行**
- Market/Product/Finance Agent 同时运行（不顺序等待）
- 减少总执行时间

### 3. **增量更新**
- 使用 delta 而非完整图推送
- 减少网络传输和 UI 重渲染

### 4. **状态管理**
- Zustand store 集中管理画布和 Chat 状态
- 避免不必要的组件重渲染（已优化的 React.memo）

---

## 🎯 扩展点

### 添加新 Agent

1. 在 `AGENT_TYPES` 中定义新 Agent 类型
2. 在 `BusinessState` 中添加新的输出字段（例：`customNodes`）
3. 在 `createGraph()` 中添加 `.addNode('customAgent', ...)`
4. 实现 `async runCustomAgent(state)` 方法
5. 在条件边中决定何时触发

### 添加新节点类型

1. 在 `NodeType` 中扩展
2. 更新 `MacraNodeDataSchema` 验证
3. 在前端 `canvas.tsx` 的 `nodeTypes` 中注册新组件
4. 实现对应的节点 React 组件

### 修改工作流

编辑 `createGraph()` 中的边连接逻辑，改变节点执行顺序或条件

---

## 🐛 错误处理

### LLM 模型未配置
- 返回 fallback 提示节点
- 不中断整个流程

### JSON 解析失败
- 使用增强的 `extractAndParseJSON()` 函数
- 记录审计日志
- 返回空数组而非异常

### Agent 执行异常
- 每个 Agent 有 try-catch
- 记录到 auditLogger
- 返回默认值继续流程

---

## 📚 代码位置速查

| 功能 | 位置 |
|-----|------|
| LangGraph 核心 | `packages/server/src/services/business-langgraph.ts` |
| 前端 Canvas | `apps/web/src/features/comfy/components/canvas.tsx` |
| 全局 Store | `apps/web/src/features/comfy/store/comfy-store.ts` |
| 类型定义 | `apps/web/types/macra.ts` |
| GraphQL API | `packages/server/src/graphql/resolvers.ts` |
| 数据模型 | `packages/server/src/application/conversation-store.ts` |
| 节点组件 | `apps/web/src/features/comfy/components/nodes/` |

---

## 🚀 关键技术亮点

1. **LangGraph State Machine**：
   - 声明式工作流定义
   - 自动处理状态转移
   - 内置流式支持

2. **结构化 LLM 输出**：
   - Zod schema 验证
   - `withStructuredOutput()` 确保格式一致
   - 不需要复杂的 regex 解析

3. **增量 Graph 推送**：
   - 前端接收 init（初始化）和 delta（增量）
   - 支持暂停/恢复
   - 网络友好

4. **多维度并行分析**：
   - 6 个 Agent 各司其职
   - Market/Product/Finance 并行
   - Orchestrator 聚合，Critic 验证

---

## 📋 总结

这是一个**精心设计的多 Agent 编排系统**，核心特点：

✅ **清晰的职责分离**：每个 Agent 专注一个领域
✅ **灵活的工作流**：LangGraph 支持条件分支和并行
✅ **实时用户反馈**：流式更新而非一次性加载
✅ **严格的数据验证**：Zod + LLM 结构化输出
✅ **可扩展的架构**：易于添加新 Agent 和节点类型
✅ **完整的审计追踪**：每步都有日志记录

