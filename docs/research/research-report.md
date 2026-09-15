# CC-BMC 卡片详情页面与 Dynamic Quiz 功能 - 架构调研报告

## 执行摘要

基于对现有代码库的详细分析，本报告提供了实现 CC-BMC 卡片详情页面和 Dynamic Quiz 功能所需的架构信息。整体结论是：**项目已有成熟的组件架构，可直接复用现有模式**。

---

## 1. CC-BMC 卡片节点组件分析

### 当前状态：完全实现 ✓

**文件位置：** `/Users/qianyingtao/code/Braching Chat/apps/web/src/features/comfy/components/nodes/cc-bmc-card-node.tsx`

**关键交互逻辑（第 50-363 行）：**

```typescript
export function CCBMCCardNode({ id, data }: NodeProps) {
  const { getMacraNode, updateMacraNode } = useComfyStore()
  const nodeData = getMacraNode(id) || (data as MacraNodeData)

  // 编辑状态管理
  const [isEditing, setIsEditing] = useState(false)
  const [editedContent, setEditedContent] = useState(nodeData?.content || '')
  const [editedLabel, setEditedLabel] = useState(nodeData?.label || '')
  const [showMetadata, setShowMetadata] = useState(false)      // 元数据显示
  const [showDomainSelector, setShowDomainSelector] = useState(false) // 维度选择
  const [isExpanded, setIsExpanded] = useState(false)          // 展开/折叠
}
```

**核心特性：**

| 特性 | 实现情况 | 代码行 |
|------|--------|--------|
| 点击编辑 | 已实现 | 166 |
| 内容编辑 | 已实现 | 245-251 |
| 维度切换（CC-BMC 9大维度） | 已实现 | 191-241 |
| 元数据展示 | 已实现 | 289-339 |
| 展开/折叠详情 | 已实现 | 260-284 |
| Agent 署名显示 | **已实现** | 291-305 |
| 置信度指示器 | 已实现 | 308-323 |
| Markdown 渲染 | 已实现 | 257 |

### Agent 署名位置分析

**好消息：Agent 署名已在卡片底部元数据区显示！**

```typescript
// 第 289-305 行
{showMetadata && nodeData?.metadata && (
  <div className="mt-4 pt-4 border-t border-white/10 space-y-3">
    {nodeData.metadata.agent_signature && (
      <div className="flex items-center gap-2 text-xs text-slate-400">
        <span className="font-semibold">创建者:</span>
        <span className="px-3 py-1.5 rounded-lg font-bold shadow-lg"
          style={{...}}>
          {nodeData.metadata.agent_signature}
        </span>
      </div>
    )}
    {/* 其他元数据... */}
  </div>
)}
```

**当前署名区域：**
- 位置：卡片底部，元数据展示区（需点击 Info 按钮展开）
- 样式：与置信度、来源等并排显示
- 可视性：需要点击 Info 图标才能看到，不够突显

**改进方向：**
1. 可选：移至卡片顶部标题区（更显眼）
2. 可选：添加小 Badge 显示创建者（始终可见）
3. 可选：底部区保留详细信息，顶部显示简化版

---

## 2. Comfy Store 状态管理分析

### 当前状态：高度完善 ✓

**文件位置：** `/Users/qianyingtao/code/Braching Chat/apps/web/src/features/comfy/store/comfy-store.ts`

**关键状态结构（第 120-177 行）：**

```typescript
interface MacraState {
  // 选中节点状态 - 需要扩展
  // 当前不存在「选中节点」的状态管理，需要添加

  // 节点数据存储 - 完全支持
  macraNodes: Map<string, MacraNodeData>    // 第 131行
  
  // 操作方法
  getMacraNode: (nodeId: string) => MacraNodeData | undefined
  updateMacraNode: (nodeId: string, data: Partial<MacraNodeData>) => void
  createMacraNode: (node: MacraNodeData) => void
  deleteMacraNode: (nodeId: string) => void
}
```

### 现有功能

| 功能 | 实现 | 代码位置 |
|------|-----|--------|
| 获取节点详情 | ✓ | 245-247 |
| 更新节点数据 | ✓ | 249-258 |
| 创建节点 | ✓ | 260-282 |
| 删除节点 | ✓ | 284-302 |
| GraphQL 订阅管理 | ✓ | 407-458 |
| Critic AI 调用 | ✓ | 468-564 |

### **缺失功能 - 需要添加**

**选中节点状态管理：**
```typescript
// 需要在 MacraState 中添加：
selectedNodeId: string | null
setSelectedNodeId: (nodeId: string | null) => void
```

**详情面板状态（推荐方案）：**
```typescript
interface DetailPanelState {
  isOpen: boolean
  nodeId: string | null
  activeTab?: 'overview' | 'quiz' | 'history'  // 支持多个标签页
}

// 在 store 中添加：
detailPanel: DetailPanelState
openDetailPanel: (nodeId: string) => void
closeDetailPanel: () => void
```

**建议实现：**
- 在 `comfy-store.ts` 的 `MacraState` 接口中添加上述状态
- 在 `create()` 初始化中设置初始值
- 添加对应的 setter 方法

---

## 3. 侧边栏/抽屉/面板组件复用分析

### 当前状态：有可复用模式 ✓

**已存在的相似组件：**

#### 3.1 DocumentDrawer（文档抽屉）
**文件：** `/Users/qianyingtao/code/Braching Chat/apps/web/src/features/workspace/components/document-drawer.tsx`

**特点：**
- 右侧固定抽屉布局（推荐用于详情面板）
- 响应式动画过渡
- 列表 + 详情区双面板设计

```typescript
export function DocumentDrawer({ open, onClose }: DocumentDrawerProps) {
  return (
    <div className="fixed inset-y-0 right-0 z-[600] flex w-[420px] 
                    flex-col border-l border-canvas-border bg-canvas-surface/95 
                    text-canvas-text shadow-xl backdrop-blur">
      {/* 顶部导航 */}
      <header className="flex items-center justify-between border-b">
        <h2 className="text-base font-semibold">文档解析</h2>
        <button onClick={onClose}>×</button>
      </header>

      {/* 主体 */}
      <div className="flex-1 overflow-y-auto">
        {/* 列表和详情 */}
      </div>
    </div>
  )
}
```

**可复用性：** ⭐⭐⭐⭐⭐ 高度适用

#### 3.2 AssistantPanel（助手面板）
**文件：** `/Users/qianyingtao/code/Braching Chat/apps/web/src/features/workspace/components/assistant-panel.tsx`

**特点：**
- 右侧固定面板
- 消息流式显示
- 输入框与发送按钮集成
- 支持异步操作反馈

**可复用性：** ⭐⭐⭐⭐ 中高度适用（适合 Quiz 消息流）

### 推荐架构

**使用 DocumentDrawer 的设计模式，创建：**

```typescript
// 新建: cc-bmc-detail-drawer.tsx
interface CCBMCDetailDrawerProps {
  open: boolean
  nodeId: string | null
  onClose: () => void
}

export function CCBMCDetailDrawer({ open, nodeId, onClose }: CCBMCDetailDrawerProps) {
  const { getMacraNode } = useComfyStore()
  const nodeData = getMacraNode(nodeId!) 

  return (
    <div className="fixed inset-y-0 right-0 z-[600] flex w-[500px] flex-col">
      <header>
        <h2>卡片详情</h2>
        <button onClick={onClose}>×</button>
      </header>

      <div className="flex-1 overflow-y-auto">
        {/* Tab 1: 详情 */}
        {/* Tab 2: Dynamic Quiz */}
        {/* Tab 3: 关联节点 */}
      </div>
    </div>
  )
}
```

---

## 4. Dynamic Quiz 相关实现分析

### 当前状态：无直接实现 ⚠️

**搜索结果：** 代码库中无现成的 `quiz`、`question`、`interactive` 相关交互式组件

### 可参考的交互模式

#### 4.1 AgentAvatarNode 中的对话交互
**文件：** `/Users/qianyingtao/code/Braching Chat/apps/web/src/features/comfy/components/nodes/agent-avatar-node.tsx`

**对话交互实现（第 129-159 行）：**

```typescript
export function AgentAvatarNode({ id, data }: NodeProps) {
  const [isChatOpen, setIsChatOpen] = useState(false)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [inputMessage, setInputMessage] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)

  const handleSendMessage = useCallback(async () => {
    if (!inputMessage.trim() || isProcessing) return

    const userMessage = inputMessage.trim()
    setInputMessage('')
    setIsProcessing(true)

    setChatMessages(prev => [...prev, { role: 'user', content: userMessage }])

    try {
      // API 调用逻辑（当前为 Mock）
      setTimeout(() => {
        const mockResponse = `作为 ${config.name}，我收到了你的问题...`
        setChatMessages(prev => [...prev, { role: 'agent', content: mockResponse }])
        setIsProcessing(false)
      }, 1000)
    } catch (error) {
      console.error('Agent 对话失败:', error)
      setIsProcessing(false)
    }
  }, [inputMessage, isProcessing, config.name])
}
```

**可复用的模式：**
- 消息队列状态管理（`chatMessages`）
- 加载状态（`isProcessing`）
- 异步消息处理
- UI 消息气泡样式

#### 4.2 AssistantPanel 的交互流程
**更完整的交互例子：**

```typescript
// 第 23-85 行的完整流程
const handleSubmit = async (event: React.FormEvent) => {
  event.preventDefault()
  if (!input.trim() || loading) return

  // 1. 添加用户消息
  setMessages((prev) => [...prev, userMessage])
  
  // 2. 显示加载状态
  setMessages((prev) => [...prev, {
    id: loadingMessageId,
    role: 'assistant',
    content: '正在分析中...',
    loading: true
  }])

  try {
    // 3. 调用异步 API
    await onAnalyze(currentInput)
    
    // 4. 更新消息内容
    setMessages((prev) => prev.map(msg =>
      msg.id === loadingMessageId ? {...msg, content: '已生成', loading: false} : msg
    ))
  } catch (error) {
    // 5. 错误处理
  } finally {
    setLoading(false)
  }
}
```

### Dynamic Quiz 架构建议

**基于现有模式，Dynamic Quiz 应包含：**

```typescript
interface QuizQuestion {
  id: string
  type: 'single-choice' | 'multiple-choice' | 'text' | 'rating'
  question: string
  options?: string[]
  answer?: string | string[]
  explanation?: string
  difficulty?: 'easy' | 'medium' | 'hard'
}

interface QuizSession {
  cardId: string
  questions: QuizQuestion[]
  currentQuestionIndex: number
  answers: Record<string, any>
  score?: number
  isComplete: boolean
}

// 在 cc-bmc-detail-drawer 中使用：
<Tab label="Dynamic Quiz">
  <QuizPanel 
    cardId={nodeId}
    onComplete={(answers) => handleQuizComplete(answers)}
  />
</Tab>
```

---

## 5. Agent Avatar 信息数据结构分析

### 当前状态：完整实现 ✓

**文件：** `/Users/qianyingtao/code/Braching Chat/apps/web/src/features/comfy/components/nodes/agent-avatar-node.tsx`

**Agent 配置数据结构（第 12-118 行）：**

```typescript
const AGENT_CONFIG: Record<AgentType, {
  gradient: string           // Tailwind 渐变色
  avatar: string            // Emoji 表示
  name: string              // Agent 名称
  description: string       // Agent 描述
  accentColor: string       // 强调色（十六进制）
}> = {
  [AGENT_TYPES.CUSTOMER_SEGMENTS]: {
    gradient: 'from-sky-400 to-sky-500',
    avatar: '🧭',
    name: '客户细分专家',
    description: '目标客户与画像分析',
    accentColor: '#38bdf8'
  },
  // ... 其他 14 种 Agent 类型
}
```

### MacraNodeData 中的 Agent 相关字段

**类型定义文件：** `/Users/qianyingtao/code/Braching Chat/apps/web/types/macra.ts`

```typescript
export interface MacraNodeData {
  id: string
  type: NodeType
  label: string
  content: string
  domain?: CCBMCDomain
  metadata: NodeMetadata              // 包含 agent_signature
  position?: { x: number; y: number }
  status?: 'idle' | 'processing' | 'done' | 'error'

  // Agent Avatar 特有字段
  agentType?: AgentType               // 第 76 行
  isInteractive?: boolean             // 是否可以点击对话
}

export interface NodeMetadata {
  source?: string
  confidence?: ConfidenceLevel
  agent_signature?: AgentType         // 创建此节点的 Agent
  created_at?: string
  updated_at?: string
  tags?: string[]
  cultural_context?: string
}
```

### 信息迁移方案

**从 Agent Avatar 到 CC-BMC 卡片的迁移：**

| Agent Avatar 字段 | CC-BMC 卡片字段 | 映射方式 |
|------------------|-----------------|---------|
| `agentType` | `metadata.agent_signature` | 直接赋值 |
| `name` | 卡片顶部显示 | 通过 AGENT_CONFIG 查表 |
| `description` | 工具提示或鼠标悬停 | 新增字段或使用 content |
| `avatar` | 元数据区展示 | Badge 显示 |
| `accentColor` | 卡片配色参考 | 可选的强调色调整 |

---

## 6. UI 组件库与基础设施分析

### 现有 UI 组件库

**位置：** `/Users/qianyingtao/code/Braching Chat/apps/web/src/shared/components/ui/`

**可用组件：**

```
├── card.tsx          # Card, CardHeader, CardContent 等
├── badge.tsx         # Badge（用于标签）
├── button.tsx        # Button 组件
├── select.tsx        # Select 下拉菜单
└── separator.tsx     # Separator 分隔线
```

**注意：** 没有现成的 `drawer.tsx` 或 `sheet.tsx`，但 DocumentDrawer 使用纯 HTML/Tailwind 实现

### 推荐的 UI 库增强

**需要创建的新组件：**

1. **Tabs 组件** - 用于详情面板的多标签切换
   ```typescript
   // 新建: shared/components/ui/tabs.tsx
   export { Tabs, TabsList, TabsTrigger, TabsContent }
   ```

2. **Dialog 或 Drawer** - 如果需要模态对话框
   ```typescript
   // 推荐：继续用 DocumentDrawer 的模式，或引入 radix-ui 的 Drawer
   ```

---

## 7. 项目架构模式总结

### 代码组织模式

**所有节点组件遵循统一模式：**

```
component-node.tsx
├── 配置常量 (Config)
├── 函数组件 ({ id, data }: NodeProps)
│  ├── Store hooks: getMacraNode, updateMacraNode
│  ├── Local state: 编辑、展开等
│  ├── 事件处理: handleSave, handleCancel
│  └── JSX 渲染: ReactFlow Handles + UI
└── Markdown 支持 (ReactMarkdown)
```

**关键模式：**
1. **状态分离**：Store 管理全局节点数据，组件管理 UI 状态（编辑、展开）
2. **Markdown 支持**：所有内容字段都使用 `<ReactMarkdown>`
3. **配置驱动**：配色方案通过 Config 对象管理（可扩展）
4. **Tailwind + 内联样式混合**：使用 Tailwind 类和动态 style 对象

---

## 8. 技术挑战与注意事项

### 挑战 1：详情面板的状态同步

**问题：** 画布上修改卡片内容时，详情面板需实时更新

**解决方案：**
```typescript
// 使用 useEffect 监听 store 变化
useEffect(() => {
  const nodeData = getMacraNode(nodeId)
  if (nodeData) {
    // 实时更新详情面板显示
  }
}, [nodeId, getMacraNode])
```

### 挑战 2：Performance（大量节点时的性能）

**建议：**
- 使用 `useMemo` 缓存 AGENT_CONFIG 查询
- 虚拟化长列表（如 Quiz 选项很多时）
- 延迟加载详情面板内容

### 挑战 3：Dynamic Quiz 的交互流程

**需要设计：**
- 问题来源（hardcoded vs. AI 生成 vs. API）
- 答案保存时机（即时 vs. 提交时）
- 得分计算逻辑
- 进度持久化

### 挑战 4：响应式设计

**DocumentDrawer 宽度固定 420px，可能在小屏幕不适应**

**改进建议：**
```typescript
const drawerWidth = useMediaQuery('(max-width: 1024px)') ? '100%' : '500px'
```

---

## 9. 实现难度评估

| 功能 | 难度 | 工作量 | 风险 |
|------|------|--------|------|
| 详情面板 UI 容器 | 🟢 简单 | 2-4h | 低 |
| Agent 署名显示优化 | 🟢 简单 | 1-2h | 低 |
| Store 状态扩展 | 🟢 简单 | 1-2h | 低 |
| Dynamic Quiz 基础框架 | 🟡 中等 | 6-8h | 中 |
| Dynamic Quiz AI 集成 | 🔴 复杂 | 8-12h | 高 |
| 完整响应式设计 | 🟡 中等 | 4-6h | 低 |

**总计预估：** 22-34 小时（不含 API 设计）

---

## 10. 推荐实现步骤

### 第一阶段：基础框架（2-3 天）
1. 在 Store 中添加 `selectedNodeId` 和 `detailPanelState`
2. 创建 `cc-bmc-detail-drawer.tsx` 组件
3. 在 canvas 上添加"查看详情"按钮（或双击打开）
4. 优化 Agent 署名显示位置

### 第二阶段：详情面板功能（2-3 天）
1. 实现详情面板的多标签页结构
2. 添加"概览"标签（显示完整卡片内容）
3. 添加"关联节点"标签（显示连接的其他节点）
4. 实现实时更新（当画布修改时，面板实时反映）

### 第三阶段：Dynamic Quiz（3-4 天）
1. 定义 Quiz 数据结构和 API 契约
2. 创建 `quiz-panel.tsx` 组件
3. 实现基础交互流程（问题展示、选项、答案记录）
4. 集成得分计算和进度保存

### 第四阶段：AI 生成与优化（2-3 天）
1. 对接 AI 服务生成 Quiz 问题
2. 根据用户答案生成反馈
3. 响应式设计优化
4. 测试和性能优化

---

## 11. 关键代码片段参考

### 相关文件清单

```
必读文件：
1. /apps/web/types/macra.ts              - 数据结构定义
2. /apps/web/src/features/comfy/store/comfy-store.ts
3. /apps/web/src/features/comfy/components/nodes/cc-bmc-card-node.tsx
4. /apps/web/src/features/comfy/components/nodes/agent-avatar-node.tsx

参考文件（学习模式）：
5. /apps/web/src/features/workspace/components/document-drawer.tsx
6. /apps/web/src/features/workspace/components/assistant-panel.tsx
7. /apps/web/src/features/comfy/components/nodes/insight-note-node.tsx
8. /apps/web/src/features/comfy/components/nodes/data-source-node.tsx
```

### 导入模板

```typescript
'use client'

import { useState, useCallback, useEffect } from 'react'
import { useComfyStore } from '../store'
import { type MacraNodeData } from '@/types/macra'
import { Card, CardHeader, CardContent } from '@/shared/components/ui/card'
import { Badge } from '@/shared/components/ui/badge'
import ReactMarkdown from 'react-markdown'

// 你的组件代码...
```

---

## 结论与建议

### 优势
✅ 项目已有完整的组件系统和状态管理框架
✅ Drawer 模式已验证可行
✅ 数据结构完备，支持 Agent 信息存储
✅ 高度可配置和可扩展的架构

### 风险和缺陷
⚠️ Store 中需要添加「选中节点」状态
⚠️ Dynamic Quiz 没有现成实现，需要从零设计
⚠️ 当前没有 Drawer 相关 UI 组件库，依赖手写 CSS
⚠️ Quiz 的 AI 生成能力需要后端支持

### 建议
1. **快速启动**：直接使用 DocumentDrawer 的结构创建详情面板
2. **分阶段实现**：先做基础 UI，再做 Quiz，最后做 AI 集成
3. **充分测试**：确保 Store 状态同步不出现数据不一致
4. **参考已有模式**：所有新组件都遵循现有的组件模式
5. **提前设计 Quiz API**：与后端协商清楚 Quiz 数据来源和答案保存接口

---

## 附录：快速参考

### 常用类型导入
```typescript
import type { MacraNodeData, CCBMCDomain, AgentType } from '@/types/macra'
```

### 常用 Hook
```typescript
const { getMacraNode, updateMacraNode, createMacraNode } = useComfyStore()
```

### 常用配置模式
```typescript
const CONFIG = {
  CUSTOMER_SEGMENTS: { gradient: 'from-amber-400 to-amber-500', icon: '👥' },
  // ... 其他配置
} as const
```

### 样式模板（Glassmorphism）
```tsx
<div style={{
  background: 'rgba(255, 255, 255, 0.03)',
  backdropFilter: 'blur(16px)',
  border: '1px solid rgba(255, 255, 255, 0.1)',
  boxShadow: '0 10px 30px -10px ...'
}}>
```

