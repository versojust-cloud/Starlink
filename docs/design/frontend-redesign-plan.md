# Braching Chat 前端完整重设计方案

## 📌 执行摘要

**产品重定位**: 从"AI分析工具"→ "AI驱动的协作商业决策平台"

**目标用户**:
- 初创企业创始人（融资前准备）
- 企业战略部（商业模型评估）
- 管理咨询公司（可复用框架）
- MBA/创业教育机构（教学工具）

**商业模式**: SaaS 订阅制
- **免费版**: 3次/月生成，无分享无导出
- **专业版**: $29/月，无限生成 + 团队协作 + 导出
- **企业版**: 按需定价，API + SSO + 审计

**预期时间**: 5个月（3个阶段）
**投入**: 2-3名工程师 + 1名设计师

---

## 🎯 产品愿景

```
用户遇到商业问题
    ↓
30秒内生成完整分析（AI）
    ↓
30分钟内邀请团队讨论（协作）
    ↓
3天内做出决策（导出报告）
    ↓
可重复使用（模板库）
```

---

## 📊 功能矩阵（分阶段）

### 阶段 1: 基础个人工具 (8周)
*让单个用户能保存和复用自己的分析*

| 功能 | 优先级 | 工作量 | 商业价值 |
|------|--------|--------|---------|
| **核心分析不变** | P0 | - | 保持现状 |
| 节点编辑（双击修改标题/内容） | P0 | 2w | 用户掌控度 ⬆️ |
| 撤销/重做（Ctrl+Z） | P0 | 1w | 体验完整性 ⬆️ |
| Canvas 保存状态（自动存草稿） | P0 | 1w | 数据不丢 |
| 导出为 PDF | P1 | 2w | 基础付费理由 |
| 导出为 PPT（可编辑） | P1 | 3w | 高级付费理由 |
| 保存为分析快照 | P1 | 1w | 版本控制基础 |
| 创建为模板 | P1 | 2w | 知识复用 |
| 模板库浏览 | P1 | 2w | 知识获取 |

**UI变化**:
```
[顶部导航] 文件名 | 保存状态 | 分享 | 导出
[左侧边栏] Sidebar + 模板库tab
[Canvas中] 节点可编辑，右键菜单
[右侧面板] Chat + 节点编辑器 + 导出预览
```

**新增数据表**:
```sql
-- 快照版本
CREATE TABLE analysis_snapshots (
  id UUID PRIMARY KEY,
  workspace_id UUID,
  name TEXT,
  description TEXT,
  graph_state JSONB,  -- 完整的Canvas状态
  created_at TIMESTAMP,
  created_by UUID,
  is_template BOOLEAN DEFAULT false,
  tags TEXT[]
)

-- 编辑历史
CREATE TABLE canvas_edits (
  id UUID PRIMARY KEY,
  snapshot_id UUID,
  operation TEXT,  -- 'add_node', 'edit_node', 'delete_node', 'add_edge'
  before_state JSONB,
  after_state JSONB,
  edited_at TIMESTAMP,
  edited_by UUID
)
```

---

### 阶段 2: 团队协作 (10周)
*让团队可以共同编辑和讨论*

| 功能 | 优先级 | 工作量 | 商业价值 |
|------|--------|--------|---------|
| **权限系统** | P0 | 2w | 可分享 |
| 生成分享链接（只读） | P0 | 1w | 快速分享 |
| 邀请团队成员编辑 | P1 | 2w | 协作价值 |
| 节点评论 | P1 | 3w | 讨论记录 |
| 实时光标（谁在编辑） | P2 | 2w | 协作感受 |
| 变更日志（谁改了什么） | P1 | 2w | 审计跟踪 |
| @提及通知 | P2 | 1w | 协作提醒 |
| Workspace 管理 | P1 | 2w | 权限基础 |

**UI变化**:
```
[顶部] 分享按钮 | 协作者列表 + 实时光标
[左侧] Workspace 选择器 | 项目列表
[Canvas] 评论气泡 | 编辑冲突解决
[右侧] Chat + 评论线程 + 变更日志
```

**新增数据表**:
```sql
-- 权限
CREATE TABLE workspace_members (
  id UUID PRIMARY KEY,
  workspace_id UUID,
  user_id UUID,
  role ENUM('owner', 'editor', 'viewer'),
  invited_at TIMESTAMP,
  accepted_at TIMESTAMP
)

-- 分享链接
CREATE TABLE share_links (
  id UUID PRIMARY KEY,
  snapshot_id UUID,
  slug TEXT UNIQUE,
  permission ENUM('view', 'comment', 'edit'),
  expires_at TIMESTAMP,
  created_by UUID
)

-- 评论
CREATE TABLE canvas_comments (
  id UUID PRIMARY KEY,
  snapshot_id UUID,
  node_id TEXT,
  content TEXT,
  author_id UUID,
  created_at TIMESTAMP,
  resolved BOOLEAN DEFAULT false
)

-- 操作日志
CREATE TABLE audit_log (
  id UUID PRIMARY KEY,
  workspace_id UUID,
  user_id UUID,
  action TEXT,  -- 'create', 'edit', 'delete', 'share', 'invite'
  resource_type TEXT,  -- 'snapshot', 'node', 'comment'
  resource_id TEXT,
  metadata JSONB,
  timestamp TIMESTAMP
)
```

---

### 阶段 3: 高级功能 (12周)
*让企业客户能够集成和自动化*

| 功能 | 优先级 | 工作量 | 商业价值 |
|------|--------|--------|---------|
| **REST API** | P1 | 3w | 集成价值 |
| 数据绑定（实时更新） | P2 | 4w | 动态分析 |
| Webhook（事件推送） | P2 | 2w | 自动化 |
| 批量生成 API | P2 | 2w | 企业级 |
| 报告生成器 | P2 | 3w | 输出价值 |
| 仪表板（企业总览） | P2 | 3w | 决策支持 |
| SSO + SAML | P2 | 2w | 企业销售 |
| 审计日志导出 | P2 | 1w | 合规 |

**API示例**:
```
POST /api/v1/analyses/generate
  { question, template_id }
  → { analysis_id, graph, ... }

GET /api/v1/analyses/{id}
  → { analysis, collaborators, comments, ... }

POST /api/v1/analyses/{id}/export
  { format: 'pdf'|'ppt'|'json' }
  → { download_url, ... }

WebSocket /ws/analyses/{id}
  → 实时协作编辑同步
```

---

## 🏗️ 前端架构重设计

### 当前架构
```
canvas.tsx (单页面)
├── Canvas (ReactFlow)
├── Sidebar (种子输入 + 节点库)
├── ChatPanel (对话)
└── DetailDrawer (节点详情)
    + useComfyStore (全局状态)
```

### 新架构
```
Layout (多页面)
├── routes/
│   ├── /dashboard          (我的分析列表)
│   ├── /analysis/[id]      (分析编辑页)
│   │   ├── EditorToolbar   (保存、导出、分享)
│   │   ├── EditorCanvas    (可编辑Canvas)
│   │   ├── EditorChat      (对话 + 节点编辑)
│   │   └── EditorComments  (评论线程)
│   ├── /share/[slug]       (分享预览页，只读)
│   ├── /templates          (模板库)
│   ├── /workspace/[id]     (团队管理)
│   └── /account            (账户设置)
│
├── components/
│   ├── editor/
│   │   ├── EditorCanvas.tsx
│   │   ├── Canvas/
│   │   │   ├── EditableNode.tsx (可编辑节点)
│   │   │   ├── NodeMenu.tsx (右键菜单)
│   │   │   └── HistoryManager.tsx (撤销/重做)
│   │   ├── Toolbar.tsx (导出、保存等)
│   │   ├── CommentThread.tsx
│   │   └── CollaboratorList.tsx
│   │
│   ├── shared/
│   │   ├── ShareDialog.tsx
│   │   ├── ExportDialog.tsx
│   │   ├── PermissionManager.tsx
│   │   └── AuditLog.tsx
│   │
│   └── templates/
│       ├── TemplateCard.tsx
│       └── TemplateBrowser.tsx
│
├── hooks/
│   ├── useAnalysis.ts (数据获取)
│   ├── useCanvasEdit.ts (编辑操作)
│   ├── useCollaboration.ts (协作同步)
│   ├── usePermissions.ts (权限检查)
│   └── useExport.ts (导出逻辑)
│
├── lib/
│   ├── api.ts (API调用)
│   ├── export/ (导出引擎)
│   │   ├── pdf-exporter.ts
│   │   ├── ppt-exporter.ts
│   │   └── json-exporter.ts
│   ├── collab/ (协作引擎)
│   │   ├── ot-engine.ts (OT同步)
│   │   └── conflict-resolver.ts
│   └── canvas-operations.ts (Canvas编辑操作)
│
└── store/
    ├── useAnalysisStore.ts (当前分析状态)
    ├── useAuthStore.ts (用户认证)
    └── useWorkspaceStore.ts (Workspace状态)
```

### 状态管理分层

```typescript
// 1. 用户认证 (Auth Store) - 全局
type AuthState = {
  user: User | null
  workspace: Workspace | null
  permissions: Permission[]
}

// 2. 当前分析 (Analysis Store) - 页面级
type AnalysisState = {
  id: string
  title: string
  graph: CanvasGraph
  collaborators: Collaborator[]
  members: WorkspaceMember[]
  isDirty: boolean
  isSaving: boolean
}

// 3. 编辑操作 (Edit Store) - 局部
type EditState = {
  selectedNodeId: string | null
  selectedEdgeId: string | null
  history: EditOperation[]
  historyIndex: number
  clipboard: CanvasNode | null
}

// 4. UI状态 (UI Store) - 局部
type UIState = {
  showExportDialog: boolean
  showShareDialog: boolean
  showComments: boolean
  activeTab: 'chat' | 'comments' | 'history'
}
```

---

## 🎨 UI/UX 设计系统

### 新增组件库

```typescript
// 编辑器工具栏
<EditorToolbar>
  <FileNameEditor value="商业模型分析" />
  <SaveStatus status="saved" timestamp="2分钟前" />
  <VersionDropdown />
  <Button icon="share">分享</Button>
  <Button icon="download">导出</Button>
  <CollaboratorAvatars />
</EditorToolbar>

// 可编辑节点
<EditableNode
  node={node}
  isSelected={true}
  onEdit={(newContent) => {}}
  onDelete={() => {}}
  canEdit={hasPermission}
/>

// 右键菜单
<NodeContextMenu>
  <MenuItem icon="edit">编辑</MenuItem>
  <MenuItem icon="duplicate">复制</MenuItem>
  <MenuItem icon="delete">删除</MenuItem>
  <MenuItem icon="comment">评论</MenuItem>
  <Divider />
  <MenuItem icon="copy-style">复制样式</MenuItem>
  <MenuItem icon="paste-style">粘贴样式</MenuItem>
</NodeContextMenu>

// 评论线程
<CommentThread
  nodeId="node-123"
  comments={[
    { author: "Alice", content: "这个有问题", resolved: false },
    { author: "Bob", content: "同意，需要修改", resolved: false }
  ]}
  onReply={(text) => {}}
  onResolve={() => {}}
/>

// 分享对话框
<ShareDialog>
  <Tabs>
    <Tab label="邀请">
      <MemberList />
      <InviteForm />
    </Tab>
    <Tab label="分享链接">
      <ShareLinkGenerator />
      <ShareLinkList />
    </Tab>
  </Tabs>
</ShareDialog>

// 导出对话框
<ExportDialog>
  <Tabs>
    <Tab label="PDF">
      <PDFOptions />
    </Tab>
    <Tab label="PPT">
      <PPTOptions />
    </Tab>
    <Tab label="JSON">
      <JSONOptions />
    </Tab>
  </Tabs>
  <Button type="primary">导出</Button>
</ExportDialog>
```

### 页面布局

```
┌─────────────────────────────────────────────────────┐
│  Logo  文件名     保存状态  [分享] [导出] ● ● ● ⚙️ │
├────────────────────────┬─────────────────────────────┤
│                        │                             │
│                        │  EditorToolbar              │
│                        │  ┌───────────────────────┐  │
│  Sidebar              │  │                       │  │
│  - 新建              │  │  Canvas Area           │  │
│  - 打开              │  │  (可编辑)              │  │
│  - 最近              │  │                       │  │
│  - 模板              │  └───────────────────────┘  │
│  - Workspace         │                             │
│                        │  评论气泡                  │
│                        │  ┌───────────────────────┐  │
│                        │  │ Chat / Comments /...  │  │
│                        │  │ 协作者列表            │  │
│                        │  └───────────────────────┘  │
└────────────────────────┴─────────────────────────────┘
```

---

## 🔄 关键交互流程

### 流程 1: 用户编辑节点
```
用户双击节点标题
  ↓
Inline Editor 打开
  ↓
用户修改文本 + 按Enter
  ↓
canvasEdits 记录操作
  ↓
图状态更新
  ↓
标记 isDirty = true
  ↓
3秒后自动保存到DB
  ↓
WebSocket 推送给其他协作者
  ↓
其他用户看到节点被修改（带颜色提示）
```

### 流程 2: 用户导出为PDF
```
用户点击导出 → PDF
  ↓
ExportDialog 打开，预览生成中...
  ↓
后端调用 puppeteer/html2pdf
  ↓
生成带有：
  - Canvas 截图
  - 节点详情表格
  - 冲突警告列表
  - 生成时间
  ↓
返回下载链接
  ↓
用户下载 PDF
```

### 流程 3: 用户邀请团队
```
用户点击分享 → 邀请
  ↓
ShareDialog 打开
  ↓
用户输入成员邮箱
  ↓
后端发邮件邀请（带魔法链接）
  ↓
被邀请者点击链接 → 自动加入Workspace
  ↓
邀请者看到成员列表更新
  ↓
新成员可以编辑/评论（根据权限）
```

---

## 🛠️ 技术选型和集成

### 新增库

```json
{
  "dependencies": {
    "react-hook-form": "^7.48.0",
    "zod": "^3.22.4",
    "@radix-ui/react-dialog": "^1.1.1",
    "@radix-ui/react-dropdown-menu": "^2.0.6",
    "@radix-ui/react-tabs": "^1.0.4",
    "@radix-ui/react-popover": "^1.0.7",
    "jspdf": "^2.5.1",
    "html2canvas": "^1.4.1",
    "pptxgen-js": "^3.12.0",
    "ot": "^1.0.0",
    "y-websocket": "^1.5.0",
    "yjs": "^13.6.8",
    "socket.io-client": "^4.7.2",
    "date-fns": "^2.30.0",
    "zustand": "^4.4.1",
    "swr": "^2.2.0"
  }
}
```

### 导出引擎

```typescript
// lib/export/pdf-exporter.ts
export class PDFExporter {
  async export(analysis: Analysis, options: PDFOptions): Promise<Blob> {
    const doc = new jsPDF()

    // 1. Canvas 截图
    const canvasImage = await this.captureCanvas()
    doc.addImage(canvasImage, 'PNG', 10, 10, 190, 100)

    // 2. 节点详情表格
    const tableData = analysis.graph.nodes.map(n => [
      n.label,
      n.domain,
      n.content.substring(0, 50) + '...'
    ])
    doc.autoTable({
      head: [['标题', '维度', '内容摘要']],
      body: tableData,
      startY: 120
    })

    // 3. 冲突警告
    if (analysis.graph.conflicts.length > 0) {
      doc.addPage()
      doc.text('冲突警告', 10, 10)
      analysis.graph.conflicts.forEach((c, i) => {
        doc.text(`${i+1}. ${c.title}`, 10, 30 + i * 20)
      })
    }

    return doc.output('blob')
  }
}

// lib/export/ppt-exporter.ts
export class PPTExporter {
  async export(analysis: Analysis): Promise<Blob> {
    const pres = new PptxGenJS()

    // 幻灯片1: 封面
    const slide1 = pres.addSlide()
    slide1.addText(analysis.title, {
      x: 0.5, y: 2, w: 9, h: 1,
      fontSize: 44, bold: true
    })

    // 幻灯片2: Canvas
    const slide2 = pres.addSlide()
    const canvasImage = await this.captureCanvas()
    slide2.addImage({ path: canvasImage, x: 0, y: 0, w: 10, h: 7.5 })

    // 幻灯片3-N: 每个维度一页
    for (const domain of CC_BMC_DOMAINS) {
      const nodes = analysis.graph.nodes.filter(n => n.domain === domain)
      const slide = pres.addSlide()
      slide.addText(domain, { x: 0.5, y: 0.5, fontSize: 28, bold: true })
      nodes.forEach((n, i) => {
        slide.addText(`• ${n.label}`, { x: 1, y: 1.5 + i * 0.8 })
        slide.addText(n.content, {
          x: 1.5, y: 1.8 + i * 0.8,
          fontSize: 10,
          color: '666666'
        })
      })
    }

    return pres.writeFile('analysis')
  }
}
```

### 协作引擎 (OT vs CRDT)

```typescript
// 选择 Yjs (CRDT) 而不是 OT，因为：
// 1. 离线优先（用户可离线编辑）
// 2. 冲突自动解决（无需服务器参与）
// 3. 更易于理解和维护

import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'

export class CollaborationManager {
  private ydoc: Y.Doc
  private provider: WebsocketProvider
  private ycanvas: Y.Map<any>

  constructor(analysisId: string) {
    this.ydoc = new Y.Doc()
    this.provider = new WebsocketProvider(
      `ws://localhost:1234`,
      `analysis-${analysisId}`,
      this.ydoc
    )
    this.ycanvas = this.ydoc.getMap('canvas')
  }

  // 任何编辑操作都自动同步
  editNode(nodeId: string, updates: Partial<CanvasNode>) {
    const node = this.ycanvas.get(nodeId) || {}
    this.ycanvas.set(nodeId, { ...node, ...updates })
    // Yjs 自动处理冲突，其他用户自动收到更新
  }

  // 监听其他用户的变更
  onRemoteChange(callback: (changes: Map<string, any>) => void) {
    this.ycanvas.observe(event => {
      const changes = new Map()
      event.changes.keys().forEach(key => {
        changes.set(key, this.ycanvas.get(key))
      })
      callback(changes)
    })
  }
}
```

---

## 📅 实现时间线

### 第1阶段: 基础个人工具 (8周)

**Week 1-2**: 架构和数据库
- [ ] 设计新的数据模型（快照、编辑、权限）
- [ ] 创建新的API端点
- [ ] 创建数据库表

**Week 3-4**: 节点编辑器
- [ ] 实现可编辑节点组件
- [ ] 实现撤销/重做功能
- [ ] 右键菜单和快捷键

**Week 5-6**: 保存和版本
- [ ] 自动保存草稿
- [ ] 快照管理UI
- [ ] 版本对比视图

**Week 7-8**: 导出
- [ ] PDF导出引擎
- [ ] PPT导出引擎
- [ ] 导出对话框UI
- [ ] 测试和优化

### 第2阶段: 团队协作 (10周)

**Week 1-2**: 权限系统
- [ ] 用户和Workspace管理
- [ ] 角色和权限检查
- [ ] API鉴权

**Week 3-4**: 分享和邀请
- [ ] 分享链接生成
- [ ] 邀请UI和邮件
- [ ] 成员管理页面

**Week 5-6**: 评论系统
- [ ] 评论数据模型
- [ ] 评论UI和线程
- [ ] 通知系统

**Week 7-8**: 实时协作
- [ ] Yjs集成
- [ ] WebSocket服务器
- [ ] 协作冲突解决

**Week 9-10**: 变更日志和优化
- [ ] 审计日志记录
- [ ] 变更日志UI
- [ ] 性能优化

### 第3阶段: 高级功能 (12周)

**Week 1-2**: REST API
- [ ] API设计和文档
- [ ] API端点实现
- [ ] API认证和限流

**Week 3-4**: Dashboard
- [ ] 分析列表页
- [ ] 搜索和过滤
- [ ] 快速操作菜单

**Week 5-6**: 模板系统
- [ ] 模板库后端
- [ ] 模板浏览UI
- [ ] 从模板创建分析

**Week 7-8**: 报告生成器
- [ ] 报告模板
- [ ] 自定义报告编辑器
- [ ] 报告导出

**Week 9-10**: 企业功能
- [ ] SSO/SAML
- [ ] Webhook支持
- [ ] 数据绑定API

**Week 11-12**: 仪表板和优化
- [ ] 企业仪表板
- [ ] 审计日志导出
- [ ] 性能优化和文档

---

## 💰 成本估算

| 资源 | 角色 | 月数 | 成本 |
|------|------|------|------|
| 工程师 | Full-stack (2人) | 5 | $60k |
| 工程师 | DevOps/Backend | 5 | $20k |
| 设计师 | UI/UX | 5 | $15k |
| **总成本** | | | **$95k** |

**预期收入** (保守估计):
- 100个付费用户 × $29/月 = $2,900/月 ($34.8k/年)
- 10个企业客户 × $5k/月 = $50k/月 ($600k/年)

**ROI**: 第10个月回本，12个月实现盈利

---

## ⚠️ 风险和假设

### 关键假设
1. ✅ 用户会为协作功能付费 (需要验证)
2. ✅ 中文用户愿意用英文API文档 (或需要中文版)
3. ✅ 实时协作对目标用户重要 (vs 异步评论)

### 风险及缓解

| 风险 | 影响 | 概率 | 缓解方案 |
|------|------|------|---------|
| 用户留存不足 | 收入预期落空 | 中 | 第1阶段后做用户研究 |
| 实时协作复杂 | 延期上线 | 中 | 第2阶段优先考虑简化方案 |
| 竞争产品出现 | 市场压力 | 高 | 差异化（AI分析能力 + 模板库） |
| 企业销售难 | 难以突破SMB | 中 | 投资合作伙伴和销售 |

---

## 🎯 成功指标

### 第1阶段指标
- 用户能够编辑和保存分析
- 导出成功率 > 95%
- 用户反馈评分 > 4/5

### 第2阶段指标
- 协作功能使用率 > 40%
- 多人编辑同步延迟 < 500ms
- 团队留存率 > 60%

### 第3阶段指标
- API调用量 > 1000次/天
- 付费转化率 > 5%
- NPS评分 > 50

---

## 📝 快速检查清单

- [ ] 确认目标用户和使用场景
- [ ] 获得团队和投资人支持
- [ ] 与销售/支持团队讨论可行性
- [ ] 定义MVP (哪些功能第1阶段必须有)
- [ ] 做原型验证核心交互
- [ ] 建立反馈渠道（用户测试组）
- [ ] 准备上线计划（营销、文档、支持）

---

## 📚 参考和借鉴

- **Figma**: 实时协作、版本历史、团队权限
- **Notion**: 块编辑、模板、可共享页面
- **Miro**: 无限Canvas、评论、导出
- **Tableau**: 数据绑定、报告、企业功能
- **Slack**: 权限系统、邀请流程、通知

---

## 🚀 下一步

1. **这周**: 团队对齐，确认产品定位
2. **第1周**: 原型设计，用户测试
3. **第2周**: 开始第1阶段实现

有问题吗？哪个部分需要深化？
