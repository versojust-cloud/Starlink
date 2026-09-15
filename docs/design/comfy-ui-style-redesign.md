# ComfyUI设计风格 × Braching Canvas
## 保持现有流程，升级视觉和交互体验

---

## 📐 整体布局

```
┌──────────────────────────────────────────────────────────────────┐
│ Header: 🎨 Braching Chat | Workspace: Demo | [?] Settings        │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────┐  ┌──────────────────────┐ ┌──────────┐ │
│  │  左侧面板           │  │   中间 Canvas        │ │ 右侧    │ │
│  │  INPUT & ACTIONS    │  │  (商业画布核心)      │ │ 面板    │ │
│  │                     │  │                      │ │         │ │
│  │ ┌─────────────────┐ │  │  ┌────────────────┐  │ │ ┌─────┐ │ │
│  │ │ 📝 分析问题      │ │  │  │ CC-BMC 九宫格 │  │ │ │ 🔄  │ │ │
│  │ ├─────────────────┤ │  │  │    Canvas      │  │ │ │     │ │ │
│  │ │ 输入框:        │ │  │  │                │  │ │ │Agent│ │ │
│  │ │ "分析新能源..." │ │  │  │   [节点展示]   │  │ │ │     │ │ │
│  │ │                 │ │  │  │                │  │ │ │进度 │ │ │
│  │ │ [深色输入框]   │ │  │  │ (自动布局)     │  │ │ │条   │ │ │
│  │ │                 │ │  │  │                │  │ │ │     │ │ │
│  │ │ [生成分析] ▶   │ │  │  └────────────────┘  │ │ │     │ │ │
│  │ │ (蓝色按钮)     │ │  │                      │ │ │     │ │ │
│  │ └─────────────────┘ │  │  Zoom & Controls  │ │ │ │     │ │ │
│  │                     │  │                      │ │ │ │     │ │ │
│  │ ┌─────────────────┐ │  │  [Mini Map]         │ │ │ │     │ │ │
│  │ │ 💾 快速操作     │ │  │                      │ │ │ │     │ │ │
│  │ ├─────────────────┤ │  │                      │ │ │ │     │ │ │
│  │ │ [清空] [保存]  │ │  │                      │ │ │ │     │ │ │
│  │ │ [导出] [分享]  │ │  │                      │ │ │ │     │ │ │
│  │ └─────────────────┘ │  │                      │ │ │ │     │ │ │
│  │                     │  │                      │ │ │ │     │ │ │
│  │ ┌─────────────────┐ │  │                      │ │ │ │     │ │ │
│  │ │ 📊 当前节点数   │ │  │                      │ │ │ │     │ │ │
│  │ ├─────────────────┤ │  │                      │ │ │ │     │ │ │
│  │ │ 9个节点生成    │ │  │                      │ │ │ │     │ │ │
│  │ │ 8条关系连接    │ │  │                      │ │ │ │     │ │ │
│  │ │ 3处冲突警告    │ │  │                      │ │ │ │     │ │ │
│  │ └─────────────────┘ │  │                      │ │ │     │ │ │
│  └─────────────────────┘  │                      │ │ └─────┘ │ │
│                           │                      │ │         │ │
│                           │                      │ └─────────┘ │
│                           └──────────────────────┘             │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## 🎨 色彩系统（ComfyUI深色专业）

```typescript
const Colors = {
  // 背景
  background: '#0f0f0f',      // 纯黑
  surface: '#1a1a1a',         // 深灰黑
  surfaceHover: '#252525',    // 浅灰黑

  // 边框和分割线
  border: '#404040',
  divider: '#2a2a2a',

  // 文本
  textPrimary: '#ffffff',
  textSecondary: '#b0b0b0',
  textTertiary: '#808080',

  // 主色调
  primary: '#4a90e2',         // 蓝色（输入/主操作）
  success: '#52c41a',         // 绿色（完成）
  warning: '#faad14',         // 黄色（警告）
  error: '#f5222d',           // 红色（错误）
  info: '#1890ff',            // 浅蓝（信息）

  // Agent颜色
  agent: {
    market: '#52c41a',        // 绿色
    product: '#1890ff',       // 蓝色
    finance: '#faad14',       // 黄色
    orchestrator: '#9254de',  // 紫色
    critic: '#f5222d',        // 红色
  }
}
```

---

## 🎯 左侧面板详设计

### INPUT面板
```
┌─────────────────────────────────┐
│ 📝 分析问题                      │
├─────────────────────────────────┤
│                                 │
│ 您要分析什么?                   │
│                                 │
│ ┌─────────────────────────────┐ │
│ │ 分析新能源汽车初创的...      │ │ ← 深色输入框
│ │ 商业模型                    │ │
│ └─────────────────────────────┘ │
│                                 │
│ [清除] [示例] [历史]           │ ← 小按钮
│                                 │
│ ┌─────────────────────────────┐ │
│ │     [生成分析] ▶             │ │ ← 主操作按钮
│ │    (蓝色，含动画)            │ │
│ └─────────────────────────────┘ │
│                                 │
│ 💡 提示: 越具体的问题会          │ ← 提示文本
│    产生更好的分析               │
│                                 │
└─────────────────────────────────┘

CSS样式:
{
  background: '#1a1a1a',
  border: '1px solid #404040',
  borderRadius: '8px',
  padding: '16px',
  boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
}

输入框:
{
  background: '#0f0f0f',
  border: '1px solid #404040',
  color: '#ffffff',
  borderRadius: '4px',
  padding: '12px',
  fontSize: '14px',
  fontFamily: 'monospace',

  '&:focus': {
    borderColor: '#4a90e2',
    boxShadow: '0 0 8px rgba(74, 144, 226, 0.3)'
  }
}

生成按钮:
{
  background: 'linear-gradient(135deg, #4a90e2 0%, #357abd 100%)',
  border: 'none',
  color: '#ffffff',
  borderRadius: '4px',
  padding: '12px 24px',
  fontSize: '16px',
  fontWeight: '600',
  cursor: 'pointer',
  transition: 'all 0.3s ease',

  '&:hover': {
    boxShadow: '0 0 20px rgba(74, 144, 226, 0.4)',
    transform: 'translateY(-2px)'
  },

  '&:active': {
    transform: 'translateY(0px)'
  }
}
```

---

## 🔄 右侧进度面板详设计

### Agent进度卡片
```
┌──────────────────────────────┐
│ 🔄 AI 分析中                 │ ← 标题
├──────────────────────────────┤
│                              │
│ ┌──────────────────────────┐ │
│ │ 🟢 Market Agent          │ │ ← 绿色指示灯
│ │ 分析客户维度...         │ │ ← 实时步骤
│ │ ▓▓▓▓▓░░░░ 70%           │ │ ← 进度条
│ │ 预计 15 秒完成           │ │ ← 剩余时间
│ └──────────────────────────┘ │
│                              │
│ ┌──────────────────────────┐ │
│ │ 🟢 Product Agent         │ │
│ │ 定义价值主张...         │ │
│ │ ▓▓▓░░░░░░ 50%           │ │
│ │ 预计 20 秒完成           │ │
│ └──────────────────────────┘ │
│                              │
│ ┌──────────────────────────┐ │
│ │ 🟠 Finance Agent         │ │ ← 灰色（等待中）
│ │ 等待 Market Agent...    │ │
│ │ ░░░░░░░░░░ 0%           │ │
│ │ 准备就绪                 │ │
│ └──────────────────────────┘ │
│                              │
│ ┌──────────────────────────┐ │
│ │ ⚪ Orchestrator          │ │
│ │ 等待所有Agent完成...    │ │
│ │ ░░░░░░░░░░ 0%           │ │
│ │                          │ │
│ └──────────────────────────┘ │
│                              │
│ ┌──────────────────────────┐ │
│ │ ⚠️  Critic Agent         │ │ ← 红色（等待）
│ │ 等待画布完成...         │ │
│ │ ░░░░░░░░░░ 0%           │ │
│ │                          │ │
│ └──────────────────────────┘ │
│                              │
│ ┌──────────────────────────┐ │
│ │ 预计总耗时: 45 秒        │ │
│ │ 已耗时: 23 秒           │ │
│ │ 剩余: 22 秒             │ │
│ └──────────────────────────┘ │
│                              │
└──────────────────────────────┘

Agent卡片 CSS:
{
  background: '#1a1a1a',
  border: '1px solid #404040',
  borderLeft: '3px solid #52c41a',  // 根据状态变化
  borderRadius: '6px',
  padding: '12px',
  marginBottom: '8px',

  '&.running': {
    borderLeftColor: '#52c41a',
    boxShadow: '0 0 12px rgba(82, 196, 26, 0.15)'
  },

  '&.waiting': {
    borderLeftColor: '#808080',
    opacity: 0.6
  },

  '&.completed': {
    borderLeftColor: '#52c41a',
    background: 'rgba(82, 196, 26, 0.05)'
  },

  '&.error': {
    borderLeftColor: '#f5222d',
    background: 'rgba(245, 34, 45, 0.05)'
  }
}

进度条 CSS:
{
  background: '#404040',
  borderRadius: '3px',
  height: '6px',
  overflow: 'hidden',
  marginTop: '8px',

  '& .progress': {
    background: 'linear-gradient(90deg, #52c41a 0%, #389e0d 100%)',
    height: '100%',
    transition: 'width 0.3s ease',
    boxShadow: '0 0 8px rgba(82, 196, 26, 0.4)'
  }
}

状态指示灯 CSS:
{
  display: 'inline-block',
  width: '8px',
  height: '8px',
  borderRadius: '50%',
  marginRight: '8px',

  '&.running': {
    background: '#52c41a',
    animation: 'pulse 1.5s ease-in-out infinite'
  }
}

@keyframes pulse {
  0%, 100% {
    opacity: 1,
    boxShadow: '0 0 0 0 rgba(82, 196, 26, 0.7)'
  }
  50% {
    opacity: 0.8
  }
  100% {
    opacity: 1,
    boxShadow: '0 0 0 10px rgba(82, 196, 26, 0)'
  }
}
```

### 统计卡片
```
┌──────────────────────────────┐
│ 📊 生成统计                  │
├──────────────────────────────┤
│                              │
│ 📦 节点数: 9                │ ← 数字加图标
│ 🔗 连接数: 8                │
│ ⚠️  冲突数: 3               │
│ ✅ 完成度: 85%              │
│                              │
│ 💾 自动保存中...             │ ← 状态信息
│                              │
└──────────────────────────────┘
```

---

## 🎯 中间Canvas面板

### 整体设计
```
┌────────────────────────────────────┐
│ 工具栏: [⊡] [◯] [+] [-] [↔] [⛃]   │ ← 缩放、布局
├────────────────────────────────────┤
│                                    │
│          CC-BMC 九宫格              │
│    (自动布局，深色背景)             │
│                                    │
│    ┌──────┬──────┬──────┐         │
│    │ Key  │Value │Customer        │
│    │Res   │Prop  │Seg  │         │
│    ├──────┼──────┼──────┤         │
│    │Part  │Act   │Channel         │
│    │ners  │ities │      │         │
│    ├──────┼──────┼──────┤         │
│    │Cost  │Revenue│Relation       │
│    │      │      │ships  │        │
│    └──────┴──────┴──────┘         │
│                                    │
│    (节点用ComfyUI风格卡片)         │
│                                    │
├────────────────────────────────────┤
│ [MiniMap] (左下角缩略图)            │
└────────────────────────────────────┘

Canvas背景:
{
  background: '#0f0f0f',
  backgroundImage: 'radial-gradient(circle, #2a2a2a 1px, transparent 1px)',
  backgroundSize: '20px 20px',
  border: '1px solid #404040',
  borderRadius: '8px',
}
```

### 节点卡片（ComfyUI风格）
```
现有的CC-BMCCardNode需要改为ComfyUI风格：

┌─────────────────────────────┐
│ 📍 Key Resources            │ ← 标题 + 图标
├─────────────────────────────┤
│                             │
│ • 技术团队 (20人)           │ ← 主要内容
│ • 融资 1000万 (A轮)         │
│ • 供应链关系                 │
│                             │
├─────────────────────────────┤
│ 来源: Market_Agent | 📊     │ ← 元数据
│ 置信度: 高                   │
└─────────────────────────────┘

深色卡片CSS:
{
  background: '#1a1a1a',
  border: '1px solid #404040',
  borderRadius: '6px',
  padding: '12px',
  boxShadow: '0 4px 12px rgba(0,0,0,0.3)',

  '&:hover': {
    borderColor: '#4a90e2',
    boxShadow: '0 4px 16px rgba(74, 144, 226, 0.2)',
    background: '#252525'
  },

  '&.selected': {
    borderColor: '#4a90e2',
    background: 'rgba(74, 144, 226, 0.1)',
    boxShadow: '0 0 12px rgba(74, 144, 226, 0.3)'
  }
}

标题颜色根据维度:
- 客户维度: #4a90e2 (蓝)
- 价值维度: #52c41a (绿)
- 支撑维度: #faad14 (黄)
```

---

## 🎬 动画和过渡

### 1. 节点生成动画
```javascript
// 当节点从AI生成出来时
const NodeAppearAnimation = {
  initial: {
    opacity: 0,
    scale: 0.8,
    y: -20
  },
  animate: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: {
      duration: 0.4,
      ease: 'easeOut'
    }
  }
}

// 连线也有动画
const EdgeAnimation = {
  initial: {
    pathLength: 0,
    opacity: 0
  },
  animate: {
    pathLength: 1,
    opacity: 1,
    transition: {
      duration: 0.6,
      delay: 0.2
    }
  }
}
```

### 2. Agent进度动画
```css
/* 进度条的流动效果 */
@keyframes progress-flow {
  0% {
    backgroundPosition: 0% 50%;
  }
  50% {
    backgroundPosition: 100% 50%;
  }
  100% {
    backgroundPosition: 0% 50%;
  }
}

.progress-bar {
  background: linear-gradient(
    90deg,
    #52c41a 0%,
    #85ce61 50%,
    #52c41a 100%
  );
  backgroundSize: '200% 100%';
  animation: progress-flow 1.5s ease-in-out infinite;
  opacity: 0.8;
}

/* 状态指示灯的脉冲 */
@keyframes status-pulse {
  0%, 100% {
    boxShadow: 0 0 0 0 rgba(82, 196, 26, 0.7);
  }
  50% {
    boxShadow: 0 0 0 10px rgba(82, 196, 26, 0);
  }
}

.status-light {
  animation: status-pulse 2s infinite;
}
```

### 3. 分析完成的动画
```javascript
// 当整个分析完成时
const CompletionAnimation = {
  scale: [1, 1.05, 1],
  boxShadow: [
    '0 0 0 0px rgba(82, 196, 26, 0)',
    '0 0 0 20px rgba(82, 196, 26, 0)',
    '0 0 0 0px rgba(82, 196, 26, 0)'
  ],
  transition: {
    duration: 0.6,
    times: [0, 0.5, 1]
  }
}
```

---

## 🔧 核心React组件

### 1. ComfyInputPanel
```typescript
export function ComfyInputPanel() {
  const [question, setQuestion] = useState('')
  const { startAnalysis, isProcessing } = useComfyStore()

  return (
    <div className="comfy-panel comfy-input-panel">
      <div className="panel-header">
        <PencilIcon />
        <h3>分析问题</h3>
      </div>

      <div className="panel-body">
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="您要分析什么?"
          className="comfy-textarea"
        />

        <div className="button-group">
          <button
            onClick={() => startAnalysis(question)}
            disabled={!question.trim() || isProcessing}
            className="comfy-button comfy-button-primary"
          >
            <PlayIcon />
            生成分析
          </button>
        </div>
      </div>
    </div>
  )
}
```

### 2. ComfyAgentProgress
```typescript
export function ComfyAgentProgress() {
  const { agents } = useComfyStore()

  return (
    <div className="comfy-panel comfy-progress-panel">
      <div className="panel-header">
        <SpinnerIcon />
        <h3>AI 分析中</h3>
      </div>

      <div className="panel-body">
        {agents.map((agent) => (
          <div key={agent.id} className={`agent-card agent-${agent.status}`}>
            <div className="agent-header">
              <span className="status-light" />
              <span className="agent-name">{agent.name}</span>
            </div>

            <div className="agent-step">
              {agent.currentStep}
            </div>

            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{ width: `${agent.progress}%` }}
              />
            </div>

            <div className="agent-meta">
              预计 {agent.estimatedTime} 秒完成
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

### 3. ComfyCanvas
```typescript
export function ComfyCanvas() {
  const { nodes, edges } = useComfyStore()

  return (
    <div className="comfy-canvas-container">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={comfyNodeTypes}
        fitView
      >
        <Background
          color="#2a2a2a"
          gap={20}
          variant="dots"
        />

        <Controls />
        <MiniMap />
      </ReactFlow>
    </div>
  )
}
```

---

## 📏 CSS变量（全局）

```css
:root {
  --comfy-bg-primary: #0f0f0f;
  --comfy-bg-surface: #1a1a1a;
  --comfy-bg-hover: #252525;

  --comfy-border: #404040;
  --comfy-text-primary: #ffffff;
  --comfy-text-secondary: #b0b0b0;

  --comfy-color-primary: #4a90e2;
  --comfy-color-success: #52c41a;
  --comfy-color-warning: #faad14;
  --comfy-color-error: #f5222d;

  --comfy-radius: 6px;
  --comfy-transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);

  --comfy-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  --comfy-shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.4);
}
```

---

## 🎨 样式表结构

```
styles/
├── comfy-theme.css          // 全局颜色和主题
├── comfy-layout.css         // 布局系统
├── comfy-panels.css         // 面板样式
├── comfy-cards.css          // 卡片样式
├── comfy-buttons.css        // 按钮样式
├── comfy-progress.css       // 进度条和动画
└── comfy-canvas.css         // Canvas相关
```

---

## 📊 最终对比

### 改前（现在）
```
canvas.tsx (大杂烩)
├── ChatPanel (在右侧)
├── Canvas (中间)
├── DetailDrawer (浮窗)
└── 混乱的状态管理
```

**问题**:
- 看不清Agent在干什么
- 进度无法实时显示
- UI不够专业
- 交互反馈不足

### 改后（ComfyUI风格）
```
ComfyPage
├── 左侧: ComfyInputPanel + 快速操作
├── 中间: ComfyCanvas (深色背景，网格)
└── 右侧: ComfyAgentProgress + 统计
```

**优势**:
- ✅ 6个Agent进度一目了然
- ✅ 实时动画反馈
- ✅ 专业深色设计
- ✅ 清晰的信息层级
- ✅ 学术答辩时显得高大上

---

## 🚀 实现路线图

### Week 1: 基础框架
- [ ] 重组页面布局（左中右三列）
- [ ] 创建ComfyPanel组件（深色卡片）
- [ ] 创建进度条和Agent卡片

### Week 2: Canvas优化
- [ ] 更新CC-BMCCardNode（ComfyUI风格）
- [ ] 实现九宫格自动布局
- [ ] 添加Mini Map

### Week 3: 动画和交互
- [ ] 节点生成动画
- [ ] 进度条流动动画
- [ ] 完成状态反馈

### Week 4: 打磨
- [ ] 性能优化
- [ ] 响应式设计
- [ ] 文档和案例

---

这就是完整的ComfyUI设计风格集成方案。

**问题**：
1. 这个方向对吗？
2. 要我现在开始实现吗？
3. 优先级怎么安排？
