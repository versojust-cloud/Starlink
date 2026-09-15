# ComfyUI风格的Canvas AI工作流重设计

## 核心理念
将Braching Chat的多智能体分析过程**可视化为ComfyUI风格的节点工作流**，让用户清晰看到：
- 问题输入
- 6个Agent的处理流程
- 最终决策输出

## 设计灵感来自ComfyUI
```
ComfyUI特点：
✅ 黑色深色主题 (专业感)
✅ 节点式设计 (清晰的数据流)
✅ 左侧节点库 (快速添加)
✅ 节点间的连线 (展示依赖关系)
✅ 进度条和状态指示 (实时反馈)
✅ 自动布局选项 (整洁呈现)
```

## 新前端架构

### 页面布局
```
┌────────────────────────────────────────────────────────┐
│ Header: Logo | Workspace | Mode (Design/Analysis)     │
├─────────────┬──────────────────────────────────────────┤
│             │                                          │
│  左侧面板    │        中间: ComfyUI风格Canvas          │
│             │                                          │
│ [节点库]    │  ┌──────────────────────────────────┐   │
│             │  │ INPUT                            │   │
│ • 输入      │  │ └─ Question                      │   │
│ • Agent     │  │                                  │   │
│ • 输出      │  │    ↓↓↓ (连线)                   │   │
│             │  │                                  │   │
│ [快速操作]  │  │ ROUTER_AGENT                     │   │
│ • 清空      │  │ └─ Route Intent                  │   │
│ • 保存      │  │                                  │   │
│ • 导出      │  │ ┌─────┬────────┬─────────┐     │   │
│             │  │ ↓     ↓        ↓         ↓     │   │
│ [设置]      │  │MARKET PRODUCT  FINANCE  RISK    │   │
│ • 主题      │  ││      │         │        │      │   │
│ • 语言      │  │└─────┬────────┬────────┘       │   │
│             │  │      ↓        ↓                 │   │
│             │  │  ORCHESTRATOR                   │   │
│             │  │  └─ Merge + Connect             │   │
│             │  │      ↓                          │   │
│             │  │  OUTPUT_CANVAS                  │   │
│             │  │  └─ Visualization               │   │
│             │  │      ↓                          │   │
│             │  │  CRITIC_AGENT                   │   │
│             │  │  └─ Detect Conflicts            │   │
│             │  │                                  │   │
│             │  └──────────────────────────────────┘   │
│             │                                          │
│             │  [Zoom Controls] [Auto Layout]          │
│             │  [Generate] [Clear] [Export]            │
│             │                                          │
└─────────────┴──────────────────────────────────────────┘
```

## 节点类型设计

### 1. INPUT节点（问题输入）
```typescript
// 外观：蓝色 + 向下箭头
<ComfyInputNode>
  ┌──────────────────┐
  │ INPUT            │ ← 标签
  ├──────────────────┤
  │ Question:        │
  │ [输入框]         │
  │ "分析新能源..."  │
  │                  │
  │ Context:         │
  │ [可选文本区]     │
  ├──────────────────┤
  │ ↓ OUTPUT         │ ← 下方出口
  └──────────────────┘
```

### 2. AGENT节点（智能体处理）
```typescript
// 外观：绿色 + 进度条 + 实时输出
<ComfyAgentNode>
  ┌──────────────────────┐
  │ 🟢 MARKET_AGENT     │ ← 绿色 + 状态指示灯
  ├──────────────────────┤
  │ Input:               │
  │ ├─ Question    ───┐  │
  │ └─ ContextData ──┐  │
  │                  │  │
  │ Processing...    │  │
  │ ▓▓▓▓▓░░░░ 70%   │  │
  │ Analyzing...     │  │
  │                  │  │
  │ Output Nodes:    │  │
  │ ├─ Customer_Seg  │  │
  │ ├─ Channels      │  │
  │ └─ Relationships │  │
  ├──────────────────────┤
  │ ↓ Customer_Segments  │ ← 三个出口（三维度）
  │ ↓ Channels           │
  │ ↓ Relationships      │
  └──────────────────────┘
```

### 3. ROUTER节点（意图分类）
```typescript
// 外观：黄色 + 条件分支
<ComfyRouterNode>
  ┌──────────────────┐
  │ ⚡ ROUTER_AGENT │
  ├──────────────────┤
  │ Input:           │
  │ └─ Question  ──┐ │
  │                │ │
  │ Classifying...│ │
  │ ▓▓▓░░░░ 50% │ │
  │                │ │
  │ Intent:        │ │
  │ generate_bmc   │ │
  ├──────────────────┤
  │ ↓ [generate_bmc] │ ← 条件分支
  │ ↓ [analyze]      │
  │ ↓ [general]      │
  └──────────────────┘
```

### 4. ORCHESTRATOR节点（聚合）
```typescript
// 外观：紫色 + 多入口
<ComfyOrchestratorNode>
  ┌─────────────────────┐
  │ 🔷 ORCHESTRATOR    │
  ├─────────────────────┤
  │ Inputs:             │
  │ ├─ Market ───┐      │
  │ ├─ Product ──┐      │
  │ ├─ Finance ──┐      │
  │ └─ Risk ────┐       │
  │              │       │
  │ Merging...   │       │
  │ ▓▓▓▓▓▓░░░░ 80% │    │
  │              │       │
  │ Generated:   │       │
  │ • 20 nodes   │       │
  │ • 15 edges   │       │
  │ • 3 conflicts│       │
  ├─────────────────────┤
  │ ↓ Canvas_Graph      │
  │ ↓ Edges             │
  │ ↓ Metadata          │
  └─────────────────────┘
```

### 5. OUTPUT_CANVAS节点（画布输出）
```typescript
// 外观：金色 + 预览缩略图
<ComfyOutputCanvasNode>
  ┌────────────────────┐
  │ ✨ OUTPUT_CANVAS   │
  ├────────────────────┤
  │ Input:             │
  │ └─ Graph_Data  ──┐ │
  │                  │ │
  │ Rendering...     │ │
  │ ▓▓▓▓▓▓▓░░░░ 90%  │ │
  │                  │ │
  │ Preview:         │ │
  │ ┌──────────────┐ │ │
  │ │ [Canvas缩图] │ │ │ ← 实时预览
  │ │ 9个维度      │ │ │
  │ │ 20个节点     │ │ │
  │ └──────────────┘ │ │
  ├────────────────────┤
  │ ↓ Rendered_Canvas  │
  │ ↓ Node_Positions   │
  └────────────────────┘
```

### 6. CRITIC节点（冲突检测）
```typescript
// 外观：红色 + 警告标记
<ComfyCriticNode>
  ┌─────────────────────┐
  │ ⚠️  CRITIC_AGENT    │
  ├─────────────────────┤
  │ Input:              │
  │ └─ Canvas_Graph ──┐ │
  │                   │ │
  │ Analyzing...      │ │
  │ ▓▓▓░░░░░░░ 40%    │ │
  │                   │ │
  │ Detected:         │ │
  │ 🔴 3 High         │ │
  │ 🟡 2 Medium       │ │
  │ 🟢 1 Low          │ │
  ├─────────────────────┤
  │ ↓ Conflicts_List   │
  │ ↓ Warnings         │
  │ ↓ Suggestions      │
  └─────────────────────┘
```

## 色彩方案（ComfyUI风格）

```
背景: #1a1a1a (深黑)
节点背景: #2a2a2a

输入: 蓝色 #4a90e2
Agent: 绿色 #52c41a
Router: 黄色 #faad14
Orchestrator: 紫色 #9254de
输出: 金色 #ffc53d
Critic: 红色 #f5222d

进度条: 绿色到红色的渐变
```

## 交互增强

### 1. 节点悬停显示详情
```
悬停在Agent节点:
┌─────────────────────┐
│ Market Agent        │
│ 状态: 分析中         │
│ 进度: 70%           │
│ 预计: 15秒完成      │
│ 输出: 3个维度       │
│ 数据: 1.2MB         │
└─────────────────────┘
```

### 2. 节点点击查看详细日志
```
点击Market Agent:
┌──────────────────────────────┐
│ Market Agent 执行日志        │
├──────────────────────────────┤
│ [15:32:45] 开始分析...      │
│ [15:32:46] 识别客户群...    │
│ [15:32:48] 分析渠道...      │
│ [15:32:50] 评估关系...      │
│ [15:33:01] 完成 ✓           │
│ [15:33:02] 输出3个节点      │
└──────────────────────────────┘
```

### 3. 自动布局
```
右上角: [Auto Layout] 按钮
点击后:
- 所有节点按层级自动排列
- 连线不相交
- 符合从上到下的数据流
```

### 4. 实时动画
```
- 节点执行时有脉冲光晕
- 数据流动时有箭头动画
- 完成时有勾号动画
```

## 核心工作流示例

```
用户流程：

1. 点击Canvas，右侧出现节点库
   [节点库]
   • INPUT
   • ROUTER
   • MARKET_AGENT
   • PRODUCT_AGENT
   • FINANCE_AGENT
   • RISK_AGENT
   • ORCHESTRATOR
   • CRITIC
   • OUTPUT_CANVAS

2. 拖拽INPUT节点到Canvas，填入问题
   INPUT
   └─ Question: "分析新能源汽车初创融资..."

3. 拖拽ROUTER，连接到INPUT
   INPUT
   └─→ ROUTER

4. 拖拽三个Agent（MARKET, PRODUCT, FINANCE），连接到ROUTER
   ┌→ MARKET
   ├→ PRODUCT
   └→ FINANCE

5. 拖拽ORCHESTRATOR，连接到三个Agent
   ┌→ MARKET ──┐
   ├→ PRODUCT ─┼→ ORCHESTRATOR
   └→ FINANCE ─┘

6. 拖拽OUTPUT_CANVAS，连接到ORCHESTRATOR
   ORCHESTRATOR → OUTPUT_CANVAS

7. 拖拽CRITIC，连接到OUTPUT_CANVAS
   OUTPUT_CANVAS → CRITIC

8. 点击[生成]按钮
   系统执行工作流，每个节点依次运行并显示进度

9. 最终可以：
   - 点击OUTPUT_CANVAS看生成的商业画布
   - 点击CRITIC看冲突警告
   - 右键菜单导出/保存
```

## UI组件改进

### 左侧面板（节点库 + 快速操作）
```typescript
// 节点库：拖拽添加节点
<NodeLibrary>
  <Section title="输入">
    <NodeType name="INPUT" />
  </Section>

  <Section title="路由">
    <NodeType name="ROUTER" />
  </Section>

  <Section title="分析Agent">
    <NodeType name="MARKET_AGENT" />
    <NodeType name="PRODUCT_AGENT" />
    <NodeType name="FINANCE_AGENT" />
    <NodeType name="RISK_AGENT" />
  </Section>

  <Section title="聚合">
    <NodeType name="ORCHESTRATOR" />
    <NodeType name="CRITIC" />
  </Section>

  <Section title="输出">
    <NodeType name="OUTPUT_CANVAS" />
  </Section>
</NodeLibrary>

// 快速操作
<QuickActions>
  <Button icon="trash">清空工作流</Button>
  <Button icon="save">保存工作流</Button>
  <Button icon="download">导出</Button>
  <Divider />
  <Button icon="play" type="primary" size="large">执行工作流</Button>
</QuickActions>
```

### 中间Canvas（ComfyUI风格）
```typescript
<ComfyCanvas>
  <Background pattern="grid" color="#1a1a1a" />

  // 节点
  <Node
    id="input-1"
    type="input"
    title="INPUT"
    position={{ x: 100, y: 100 }}
    status="completed"
    progress={100}
  />

  // 连线
  <Connection
    from="input-1"
    to="router-1"
    animated={true}
  />

  // 控制
  <Controls>
    <ZoomControl />
    <FitView />
  </Controls>

  <MiniMap />
</ComfyCanvas>
```

## 数据模型

### Workflow Schema
```typescript
interface ComfyWorkflow {
  id: string
  name: string
  nodes: ComfyNode[]
  connections: ComfyConnection[]
  metadata: {
    created: timestamp
    modified: timestamp
    author: string
    description: string
  }
}

interface ComfyNode {
  id: string
  type: 'input' | 'router' | 'agent' | 'orchestrator' | 'critic' | 'output'
  title: string
  position: { x: number; y: number }
  config: Record<string, any>
  status: 'idle' | 'running' | 'completed' | 'error'
  progress: number // 0-100
  output?: any
  error?: string
}

interface ComfyConnection {
  id: string
  from: string // nodeId
  to: string   // nodeId
  fromOutput: string
  toInput: string
}
```

## 执行流程

```typescript
class ComfyWorkflowExecutor {
  async execute(workflow: ComfyWorkflow) {
    // 1. 拓扑排序，确保依赖顺序
    const sortedNodes = topologicalSort(workflow.nodes)

    // 2. 逐个执行节点
    for (const node of sortedNodes) {
      node.status = 'running'
      node.progress = 0

      try {
        // 执行节点处理逻辑
        const result = await executeNode(node)

        // 更新节点状态
        node.status = 'completed'
        node.output = result
        node.progress = 100

        // 实时推送UI更新
        broadcastNodeUpdate(node)

      } catch (error) {
        node.status = 'error'
        node.error = error.message
        broadcastNodeUpdate(node)
      }
    }
  }
}
```

## 学术价值展现

在答辩时，这个设计能清晰展示：

1. **多智能体协同** ✅
   - 用户能看到6个Agent节点
   - 能看到它们的执行顺序
   - 能看到数据从输入流向输出

2. **LangGraph工作流** ✅
   - 整个系统就是一个可视化的DAG（有向无环图）
   - 每个节点代表一个LangGraph node
   - 连线代表节点间的数据流动

3. **实时处理过程** ✅
   - 看得到每个Agent的进度条
   - 看得到实时日志
   - 看得到中间输出

4. **最终决策输出** ✅
   - OUTPUT_CANVAS节点显示生成的商业画布
   - CRITIC节点显示检测到的冲突
   - 完整的"问题→分析→决策"流程

## 优势对比

| 方面 | 原设计 | ComfyUI风格 |
|------|--------|-----------|
| 清晰度 | 节点乱堆 | 清晰的工作流 |
| 可理解性 | 用户迷茫 | 用户一眼看懂 |
| 学术价值 | 隐含 | 显式展现 |
| 可扩展性 | 固定6Agent | 可动态组合 |
| 教学性 | 黑盒 | 透明可视 |

---

这就是完整的ComfyUI风格Canvas AI工作流设计。

**下一步**：我开始实现吗？哪些部分优先级最高？
