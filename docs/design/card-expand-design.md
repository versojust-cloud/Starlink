# 卡片展开/折叠交互设计
## 每个卡片都可以展开查看详情

---

## 📐 卡片展开设计

### 1. Agent进度卡片 - 展开/折叠

#### 折叠状态（默认）
```
┌──────────────────────────────┐
│ 🟢 Market Agent         ▼     │ ← 点击箭头展开
│ 分析客户维度...              │
│ ▓▓▓▓▓░░░░ 70%              │
│ 预计 15 秒完成               │
└──────────────────────────────┘
```

#### 展开状态
```
┌──────────────────────────────┐
│ 🟢 Market Agent         ▲     │ ← 箭头向上，表示已展开
├──────────────────────────────┤
│ 当前步骤:                    │
│ • 分析客户细分 ✅            │
│ • 识别渠道通路 ⏳ 进行中     │
│ • 评估客户关系 ⏸ 等待       │
│                              │
│ 进度详情:                    │
│ ▓▓▓▓▓░░░░ 70%               │
│ 完成: 7/10 步骤              │
│                              │
│ 分析内容预览:                │
│ ┌──────────────────────────┐ │
│ │ 识别的客户群:            │ │
│ │ • 中高端消费人群         │ │
│ │ • 环保意识强的用户       │ │
│ │ • 科技爱好者             │ │
│ │                          │ │
│ │ 主要渠道:                │ │
│ │ • 线上直卖 (官网)        │ │
│ │ • 授权经销商             │ │
│ │ • 体验店                 │ │
│ └──────────────────────────┘ │
│                              │
│ 实时日志:                    │
│ [15:32:45] 开始分析...      │
│ [15:32:46] 识别客户群...    │
│ [15:32:50] 分析渠道...      │
│ [15:33:01] 评估关系...      │
│                              │
│ [复制日志] [导出] [详细查看] │
└──────────────────────────────┘
```

### 2. 结果卡片 - 展开/折叠

#### 折叠状态
```
┌────────────────────────────────┐
│ 📍 Key Resources        ▼       │
├────────────────────────────────┤
│ • 技术团队 (20人)              │
│ • 融资 1000万 (A轮)            │
│ • 供应链关系                    │
│                                │
│ 来源: Market_Agent | 置信度: 高 │
└────────────────────────────────┘
```

#### 展开状态
```
┌────────────────────────────────┐
│ 📍 Key Resources        ▲       │
├────────────────────────────────┤
│ 完整内容:                      │
│                                │
│ 🔹 技术团队 (20人)             │
│    来源: 联合创始人 + 前字节员  │
│    细分:                       │
│    • 算法团队: 5人              │
│    • 硬件设计: 6人              │
│    • 生产制造: 4人              │
│    • 销售运营: 5人              │
│                                │
│ 🔹 融资资金 (1000万)           │
│    阶段: A轮融资                │
│    时间: 2024年Q1              │
│    来源: VC基金 + 天使投资      │
│    用途:                       │
│    • 产品研发: 40%              │
│    • 市场推广: 35%              │
│    • 运营管理: 25%              │
│                                │
│ 🔹 供应链关系                  │
│    电池供应: CATL供应          │
│    制造合作: 代工工厂           │
│    物流合作: 顺丰/中通          │
│    充电网络: 国家电网 + 私企    │
│                                │
│ 数据来源:                      │
│ 📊 来自 Market_Agent 分析       │
│ 🔗 关联节点: 3个                │
│ ✅ 置信度: 高 (0.92)           │
│ 📅 生成时间: 2024-04-01 15:33  │
│                                │
│ [查看原始文本] [复制] [编辑]   │
│ [关联冲突分析] [对标分析]      │
└────────────────────────────────┘
```

---

## 🎯 展开/折叠交互细节

### 展开动画
```typescript
// 使用Framer Motion或React Spring
const cardVariants = {
  collapsed: {
    height: 'auto',
    opacity: 1,
    transition: { duration: 0.3 }
  },
  expanded: {
    height: 'auto',
    opacity: 1,
    transition: { duration: 0.3 }
  }
}

const contentVariants = {
  collapsed: {
    opacity: 0,
    visibility: 'hidden',
    transition: { duration: 0.2 }
  },
  expanded: {
    opacity: 1,
    visibility: 'visible',
    transition: { duration: 0.3, delay: 0.1 }
  }
}

const arrowVariants = {
  collapsed: {
    rotate: 0,
    transition: { duration: 0.3 }
  },
  expanded: {
    rotate: 180,
    transition: { duration: 0.3 }
  }
}
```

### 展开按钮样式
```css
.card-expand-button {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: #b0b0b0;
  cursor: pointer;
  transition: color 0.2s;
  padding: 0;

  &:hover {
    color: #4a90e2;
  }

  svg {
    width: 16px;
    height: 16px;
    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }

  &.expanded svg {
    transform: rotate(180deg);
  }
}
```

---

## 📋 完整的卡片组件代码

### AgentProgressCard（可展开）
```typescript
import { useState } from 'react'
import { motion } from 'framer-motion'
import { ChevronDown, Copy, Download, Eye } from 'lucide-react'

interface AgentProgressCardProps {
  agent: {
    id: string
    name: string
    status: 'idle' | 'running' | 'completed' | 'error'
    progress: number
    currentStep: string
    steps: Array<{
      name: string
      status: 'completed' | 'running' | 'waiting'
    }>
    output?: any
    estimatedTime: number
    logs: Array<{ time: string; message: string }>
  }
}

export function AgentProgressCard({ agent }: AgentProgressCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  const statusColors = {
    idle: '#808080',
    running: '#52c41a',
    completed: '#52c41a',
    error: '#f5222d'
  }

  const statusLights = {
    idle: { icon: '⚪', pulse: false },
    running: { icon: '🟢', pulse: true },
    completed: { icon: '✅', pulse: false },
    error: { icon: '❌', pulse: false }
  }

  const cardVariants = {
    collapsed: { height: 'auto' },
    expanded: { height: 'auto' }
  }

  const contentVariants = {
    collapsed: {
      opacity: 0,
      visibility: 'hidden' as const,
      height: 0,
      marginTop: 0
    },
    expanded: {
      opacity: 1,
      visibility: 'visible' as const,
      height: 'auto',
      marginTop: 12,
      transition: { duration: 0.3, delay: 0.1 }
    }
  }

  return (
    <motion.div
      className={`agent-card agent-card-${agent.status}`}
      variants={cardVariants}
    >
      {/* 头部：折叠时显示 */}
      <div className="card-header">
        <div className="card-header-left">
          <span
            className={`status-light ${agent.status}`}
            style={{
              background: statusColors[agent.status],
              animation: statusLights[agent.status].pulse
                ? 'pulse 1.5s ease-in-out infinite'
                : 'none'
            }}
          />
          <span className="agent-name">{agent.name}</span>
        </div>

        <button
          className="card-expand-button"
          onClick={() => setIsExpanded(!isExpanded)}
          aria-label="展开卡片"
        >
          <ChevronDown size={16} />
        </button>
      </div>

      {/* 折叠时显示的简略信息 */}
      <div className="card-summary">
        <div className="step-text">{agent.currentStep}</div>

        <div className="progress-bar">
          <div
            className="progress-fill"
            style={{ width: `${agent.progress}%` }}
          />
        </div>

        <div className="meta-text">
          预计 {agent.estimatedTime} 秒完成
        </div>
      </div>

      {/* 展开时显示的详细信息 */}
      <motion.div
        className="card-expanded-content"
        initial="collapsed"
        animate={isExpanded ? 'expanded' : 'collapsed'}
        variants={contentVariants}
      >
        {/* 步骤清单 */}
        <div className="section">
          <h4 className="section-title">当前步骤</h4>
          <div className="steps-list">
            {agent.steps.map((step, idx) => (
              <div key={idx} className={`step-item step-${step.status}`}>
                <span className="step-icon">
                  {step.status === 'completed'
                    ? '✅'
                    : step.status === 'running'
                    ? '⏳'
                    : '⏸'}
                </span>
                <span className="step-name">{step.name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 进度详情 */}
        <div className="section">
          <h4 className="section-title">进度详情</h4>
          <div className="progress-detail">
            <div className="progress-bar-large">
              <div
                className="progress-fill"
                style={{ width: `${agent.progress}%` }}
              />
            </div>
            <div className="progress-text">
              完成: {Math.round((agent.progress / 100) * agent.steps.length)}/
              {agent.steps.length} 步骤
            </div>
          </div>
        </div>

        {/* 分析内容预览 */}
        {agent.output && (
          <div className="section">
            <h4 className="section-title">分析内容预览</h4>
            <div className="output-preview">
              {typeof agent.output === 'string' ? (
                <p>{agent.output.substring(0, 200)}...</p>
              ) : (
                <pre>{JSON.stringify(agent.output, null, 2)}</pre>
              )}
            </div>
          </div>
        )}

        {/* 实时日志 */}
        <div className="section">
          <h4 className="section-title">实时日志</h4>
          <div className="logs-container">
            {agent.logs.slice(-5).map((log, idx) => (
              <div key={idx} className="log-line">
                <span className="log-time">[{log.time}]</span>
                <span className="log-message">{log.message}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="card-actions">
          <button className="action-button" title="复制日志">
            <Copy size={14} />
            复制日志
          </button>
          <button className="action-button" title="下载详情">
            <Download size={14} />
            导出
          </button>
          <button className="action-button" title="查看详细日志">
            <Eye size={14} />
            详细日志
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}
```

### ResultCard（可展开）
```typescript
import { useState } from 'react'
import { motion } from 'framer-motion'
import { ChevronDown, Copy, Edit2, Link2 } from 'lucide-react'

interface ResultCardProps {
  node: {
    id: string
    label: string
    domain: string
    content: string
    fullContent?: string
    metadata: {
      agent_signature: string
      confidence: 'high' | 'medium' | 'low'
      source: string
      generatedAt: string
    }
    relatedNodes?: number
  }
  onEdit?: (nodeId: string) => void
  onShowConflicts?: (nodeId: string) => void
}

export function ResultCard({ node, onEdit, onShowConflicts }: ResultCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  const confidenceColors = {
    high: '#52c41a',
    medium: '#faad14',
    low: '#f5222d'
  }

  const domainColors: Record<string, string> = {
    '客户细分': '#4a90e2',
    '渠道通路': '#1890ff',
    '客户关系': '#13c2c2',
    '价值主张': '#52c41a',
    '收入来源': '#faad14',
    '关键业务': '#eb2f96',
    '核心资源': '#722ed1',
    '重要合作': '#13a8a8',
    '成本结构': '#f5222d'
  }

  const contentVariants = {
    collapsed: {
      opacity: 0,
      visibility: 'hidden' as const,
      height: 0,
      marginTop: 0
    },
    expanded: {
      opacity: 1,
      visibility: 'visible' as const,
      height: 'auto',
      marginTop: 12,
      transition: { duration: 0.3, delay: 0.1 }
    }
  }

  return (
    <motion.div
      className="result-card"
      style={{
        borderLeftColor: domainColors[node.domain] || '#4a90e2'
      }}
    >
      {/* 卡片头部 */}
      <div className="card-header">
        <div className="card-header-left">
          <span className="domain-badge">{node.domain}</span>
          <h3 className="card-title">{node.label}</h3>
        </div>

        <button
          className="card-expand-button"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <ChevronDown size={16} />
        </button>
      </div>

      {/* 简略内容（折叠时） */}
      <div className="card-summary">
        <ul className="content-preview">
          {node.content.split('\n').slice(0, 3).map((line, idx) => (
            <li key={idx} className="preview-line">
              {line.replace(/^[-•]\s*/, '')}
            </li>
          ))}
        </ul>

        <div className="card-meta">
          <span className="meta-item">
            来源: <strong>{node.metadata.agent_signature}</strong>
          </span>
          <span className="meta-item">
            置信度:
            <span
              className="confidence-badge"
              style={{
                color: confidenceColors[node.metadata.confidence]
              }}
            >
              {node.metadata.confidence}
            </span>
          </span>
        </div>
      </div>

      {/* 展开的详细内容 */}
      <motion.div
        className="card-expanded-content"
        initial="collapsed"
        animate={isExpanded ? 'expanded' : 'collapsed'}
        variants={contentVariants}
      >
        {/* 完整内容 */}
        <div className="section">
          <h4 className="section-title">完整内容</h4>
          <div className="full-content">
            {(node.fullContent || node.content).split('\n').map((line, idx) => (
              <p key={idx} className="content-line">
                {line}
              </p>
            ))}
          </div>
        </div>

        {/* 数据来源和元数据 */}
        <div className="section">
          <h4 className="section-title">信息来源</h4>
          <div className="metadata-grid">
            <div className="meta-item-detail">
              <span className="meta-label">分析来源</span>
              <span className="meta-value">{node.metadata.agent_signature}</span>
            </div>

            <div className="meta-item-detail">
              <span className="meta-label">置信度</span>
              <div className="confidence-bar">
                <div
                  className="confidence-fill"
                  style={{
                    width: node.metadata.confidence === 'high'
                      ? '100%'
                      : node.metadata.confidence === 'medium'
                      ? '66%'
                      : '33%',
                    background: confidenceColors[node.metadata.confidence]
                  }}
                />
              </div>
              <span className="meta-value">
                {node.metadata.confidence}
              </span>
            </div>

            <div className="meta-item-detail">
              <span className="meta-label">数据源</span>
              <span className="meta-value">{node.metadata.source}</span>
            </div>

            <div className="meta-item-detail">
              <span className="meta-label">生成时间</span>
              <span className="meta-value">{node.metadata.generatedAt}</span>
            </div>

            {node.relatedNodes && (
              <div className="meta-item-detail">
                <span className="meta-label">关联节点</span>
                <span className="meta-value">{node.relatedNodes} 个</span>
              </div>
            )}
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="card-actions">
          <button
            className="action-button"
            onClick={() => navigator.clipboard.writeText(node.content)}
          >
            <Copy size={14} />
            复制内容
          </button>

          {onEdit && (
            <button
              className="action-button"
              onClick={() => onEdit(node.id)}
            >
              <Edit2 size={14} />
              编辑
            </button>
          )}

          {onShowConflicts && (
            <button
              className="action-button"
              onClick={() => onShowConflicts(node.id)}
            >
              <Link2 size={14} />
              关联冲突
            </button>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}
```

---

## 🎨 展开卡片的CSS样式

```css
/* 卡片基础样式 */
.agent-card,
.result-card {
  background: #1a1a1a;
  border: 1px solid #404040;
  border-radius: 6px;
  padding: 12px;
  margin-bottom: 8px;
  transition: all 0.3s ease;

  &:hover {
    border-color: #4a90e2;
    background: #252525;
    box-shadow: 0 4px 16px rgba(74, 144, 226, 0.15);
  }

  &.expanded {
    box-shadow: 0 8px 24px rgba(74, 144, 226, 0.2);
  }
}

/* 卡片头部 */
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  cursor: pointer;
  user-select: none;
}

.card-header-left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;

  .status-light {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .agent-name {
    font-weight: 600;
    color: #ffffff;
    font-size: 14px;
  }
}

/* 展开按钮 */
.card-expand-button {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: #b0b0b0;
  cursor: pointer;
  padding: 0;
  transition: all 0.3s ease;

  &:hover {
    color: #4a90e2;
  }

  svg {
    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }
}

/* 展开的内容区域 */
.card-expanded-content {
  border-top: 1px solid #2a2a2a;
  padding-top: 12px;

  .section {
    margin-bottom: 12px;

    &:last-child {
      margin-bottom: 0;
    }
  }

  .section-title {
    font-size: 12px;
    font-weight: 600;
    color: #b0b0b0;
    margin-bottom: 8px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
}

/* 步骤列表 */
.steps-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.step-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  padding: 6px 8px;
  border-radius: 4px;
  background: #0f0f0f;
  color: #b0b0b0;

  &.step-completed {
    color: #52c41a;
    background: rgba(82, 196, 26, 0.1);
  }

  &.step-running {
    color: #4a90e2;
    background: rgba(74, 144, 226, 0.1);
  }

  .step-icon {
    font-size: 12px;
  }

  .step-name {
    flex: 1;
  }
}

/* 输出预览 */
.output-preview {
  background: #0f0f0f;
  border: 1px solid #2a2a2a;
  border-radius: 4px;
  padding: 8px;
  font-size: 12px;
  color: #b0b0b0;
  max-height: 150px;
  overflow-y: auto;
  font-family: monospace;

  pre {
    margin: 0;
    white-space: pre-wrap;
    word-break: break-all;
  }
}

/* 日志容器 */
.logs-container {
  background: #0f0f0f;
  border: 1px solid #2a2a2a;
  border-radius: 4px;
  padding: 8px;
  max-height: 120px;
  overflow-y: auto;
  font-family: monospace;
  font-size: 11px;
}

.log-line {
  display: flex;
  gap: 8px;
  margin-bottom: 4px;
  color: #808080;

  &:last-child {
    margin-bottom: 0;
  }

  .log-time {
    color: #404040;
    flex-shrink: 0;
  }

  .log-message {
    color: #b0b0b0;
    flex: 1;
  }
}

/* 卡片操作按钮 */
.card-actions {
  display: flex;
  gap: 6px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #2a2a2a;
}

.action-button {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 12px;
  background: #0f0f0f;
  border: 1px solid #404040;
  border-radius: 4px;
  color: #b0b0b0;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    border-color: #4a90e2;
    color: #4a90e2;
    background: rgba(74, 144, 226, 0.05);
  }

  svg {
    width: 14px;
    height: 14px;
  }
}

/* 结果卡片特定样式 */
.result-card {
  border-left-width: 3px;
  border-left-color: #4a90e2;
}

.domain-badge {
  display: inline-block;
  padding: 2px 8px;
  background: rgba(74, 144, 226, 0.1);
  border-radius: 3px;
  font-size: 11px;
  color: #4a90e2;
  font-weight: 600;
}

.card-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #ffffff;
}

.content-preview {
  list-style: none;
  padding: 0;
  margin: 0;

  .preview-line {
    font-size: 13px;
    color: #b0b0b0;
    margin-bottom: 4px;

    &:last-child {
      margin-bottom: 0;
    }
  }
}

/* 元数据网格 */
.metadata-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.meta-item-detail {
  display: flex;
  flex-direction: column;
  gap: 4px;

  .meta-label {
    font-size: 11px;
    color: #808080;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .meta-value {
    font-size: 13px;
    color: #ffffff;
    font-weight: 500;
  }

  .confidence-bar {
    height: 6px;
    background: #0f0f0f;
    border-radius: 3px;
    overflow: hidden;

    .confidence-fill {
      height: 100%;
      border-radius: 3px;
      transition: width 0.3s ease;
    }
  }
}

/* 完整内容显示 */
.full-content {
  background: #0f0f0f;
  border: 1px solid #2a2a2a;
  border-radius: 4px;
  padding: 12px;
  max-height: 300px;
  overflow-y: auto;

  .content-line {
    margin: 0 0 8px 0;
    font-size: 13px;
    color: #b0b0b0;
    line-height: 1.6;

    &:last-child {
      margin-bottom: 0;
    }
  }
}

/* 卡片元数据 */
.card-meta {
  display: flex;
  gap: 12px;
  font-size: 11px;
  color: #808080;
  margin-top: 8px;

  .meta-item {
    display: flex;
    align-items: center;
    gap: 4px;

    strong {
      color: #b0b0b0;
    }
  }

  .confidence-badge {
    font-weight: 600;
    padding: 0 4px;
  }
}
```

---

## 🎭 状态管理（Zustand）

```typescript
// store/useCardState.ts
import { create } from 'zustand'

interface CardState {
  expandedCards: Set<string>
  toggleCardExpand: (cardId: string) => void
  expandCard: (cardId: string) => void
  collapseCard: (cardId: string) => void
  collapseAll: () => void
  isCardExpanded: (cardId: string) => boolean
}

export const useCardState = create<CardState>((set, get) => ({
  expandedCards: new Set(),

  toggleCardExpand: (cardId: string) => {
    const { expandedCards } = get()
    const newSet = new Set(expandedCards)

    if (newSet.has(cardId)) {
      newSet.delete(cardId)
    } else {
      newSet.add(cardId)
    }

    set({ expandedCards: newSet })
  },

  expandCard: (cardId: string) => {
    const { expandedCards } = get()
    const newSet = new Set(expandedCards)
    newSet.add(cardId)
    set({ expandedCards: newSet })
  },

  collapseCard: (cardId: string) => {
    const { expandedCards } = get()
    const newSet = new Set(expandedCards)
    newSet.delete(cardId)
    set({ expandedCards: newSet })
  },

  collapseAll: () => {
    set({ expandedCards: new Set() })
  },

  isCardExpanded: (cardId: string) => {
    return get().expandedCards.has(cardId)
  }
}))
```

---

## 📝 使用示例

```typescript
// 在右侧进度面板中
import { useCardState } from '@/store/useCardState'
import { AgentProgressCard } from '@/components/AgentProgressCard'

export function ComfyAgentProgress() {
  const { agents } = useComfyStore()
  const { expandedCards, toggleCardExpand } = useCardState()

  return (
    <div className="comfy-panel comfy-progress-panel">
      <div className="panel-header">
        <h3>AI 分析中</h3>
        <button
          onClick={() => useCardState.setState({ expandedCards: new Set() })}
          className="text-xs text-gray-500 hover:text-gray-300"
        >
          全部折叠
        </button>
      </div>

      <div className="panel-body">
        {agents.map((agent) => (
          <AgentProgressCard
            key={agent.id}
            agent={agent}
            isExpanded={expandedCards.has(agent.id)}
            onToggleExpand={() => toggleCardExpand(agent.id)}
          />
        ))}
      </div>
    </div>
  )
}

// 在Canvas中显示结果卡片
export function CanvasResultCards() {
  const { nodes } = useComfyStore()
  const { expandedCards, toggleCardExpand } = useCardState()

  return (
    <div className="result-cards-container">
      {nodes.map((node) => (
        <ResultCard
          key={node.id}
          node={node}
          isExpanded={expandedCards.has(node.id)}
          onToggleExpand={() => toggleCardExpand(node.id)}
        />
      ))}
    </div>
  )
}
```

---

## ✨ 用户体验流程

```
1. 用户看到折叠的卡片（简洁视图）
   ↓
2. 点击卡片的展开按钮（▼图标）
   ↓
3. 卡片平滑展开，显示详细信息
   - 完整内容
   - 分析步骤
   - 元数据
   - 日志等
   ↓
4. 可以操作卡片内的按钮
   - 复制内容
   - 编辑
   - 查看关联冲突
   ↓
5. 再次点击可折叠卡片
```

---

这就是完整的卡片展开/折叠交互设计。

**现在可以开始实现了吗？**

优先级：
1. Agent进度卡片展开（右侧面板）
2. 结果卡片展开（Canvas上的节点）
3. 动画优化
4. 响应式调整
