# 前端架构设计（Kuse 风格多维画布）

## 1. 目标与范围
- 支撑“多模态资料整合 + 可视化研究画布 + AI 助手 + 多人协作”核心体验。
- 首期覆盖网页端，兼容桌面浏览器与 >1440px 画布操作；后续保留 PWA/桌面容器扩展空间。
- 设计需支持在线协作、实时引用跳转、结构化输出及可插拔模板体系。

## 2. 技术栈与基础设施
- **框架**：Next.js（App Router）+ React Server Components；SSR/SSG 提升首屏加载，RSC 预拉数据。
- **状态管理**：
  - TanStack Query 管理服务端数据（REST/GraphQL）。
  - Zustand 管理本地 UI 状态（面板开关、筛选、临时草稿）。
  - Yjs + y-websocket 负责协作文档与画布同步。
- **画布渲染**：
  - React Flow 管理节点/连线模型（流程与拓扑逻辑）。
  - Konva（或 Pixi.js）负责自由拖拽层、贴图、批量渲染（通过自定义节点在 React Flow 中挂载）。
  - 自定义 Node Renderer 支持 Note/Doc/Task/Reference/Image/WebCard 等类型。
- **富文本与文档**：Tiptap（ProseMirror 内核）+ 自定义 Extension 对齐引用、评论、AI Assist。
- **UI 样式**：Tailwind CSS + Radix UI 原子组件；支持暗色主题 & 设计 Token。
- **通信协议**：WebSocket（yjs、Presence、AI 流式回复）、SSE（引用生成/任务进度）、HTTP/GraphQL（常规 CRUD）。
- **工具链**：pnpm + Turborepo（前后端 mono-repo）、ESLint/Prettier、Playwright、Storybook。

## 3. 应用结构（Next.js App Router）
```
app/
├── layout.tsx              // 顶层 Providers（Theme, QueryClient, Zustand, i18n）
├── (marketing)/            // 营销/登录落地页
├── (app)/dashboard/        // 工作台与项目列表
│   └── page.tsx
├── (app)/workspace/[id]/   // 画布核心页面
│   ├── layout.tsx          // WorkspaceShell（侧边栏、顶栏）
│   └── page.tsx            // Canvas + Panels + AI Assistant
├── (app)/workspace/[id]/documents/...
├── api/                    // Next.js Route Handlers（webhook、Edge functions）
└── middleware.ts           // 权限校验、地域路由
```
- **Providers**：QueryClientProvider、SessionProvider（Auth0/Clerk）、ThemeProvider、UI Toast Provider。
- **route groups**：公共页面与应用内 Shell 隔离，便于权限控制与 CSS 作用域。
- **代码拆分**：画布模块采用动态 import（`use client` 组件）减少首屏体积；调研助手/模板抽屉使用懒加载。

## 4. 状态层与数据流
- **Server State（TanStack Query）**
  - `useWorkspaceQuery`：workspace 元信息、权限、协作者列表。
  - `useDocumentsQuery`：文档/引用、任务状态；可配置分页与投影（轻量/详细）。
  - `useTemplatesQuery`：模板目录、推荐项。
  - QueryKey 以 org/workspace/project 组合，结合 `select` 优化。
  - Mutations 统一通过 `client/api` 封装（REST/GraphQL 调度器）。
- **Collaboration State（Yjs）**
  - 画布：`yDoc.getMap('canvas')` 存节点、边、布局；React Flow 节点通过 `useSyncExternalStore` 绑定。
  - 富文本：每个 Note/Doc node 挂载 `yDoc.getText(nodeId)`；Tiptap Yjs Extension 同步。
  - Presence：额外 `awareness` 通道存游标、选区、操作模式；Collab Service 扩散给其他参与者。
- **UI State（Zustand）**
  - 布局与面板：画布视角、缩放、抽屉显隐。
  - 当前选中节点、过滤条件、临时配置（例如 AI prompt 草稿）。
  - 状态“快照”用于回放/撤销，封装在 Canvas Store 中。
- **流式数据**
  - AI 助手：SSE/WS 订阅 `conversation/{threadId}`，TanStack Query `setQueryData` 增量合并。
  - 任务 & 解析：`/ingest/{documentId}/events` SSE 推送阶段进度。

## 5. 核心模块划分
### 5.1 Shell Layout
- 顶栏：workspace 切换、协作者、通知、搜索入口。
- 左侧栏：项目树/画布列表、模板库入口、上传入口。
- 右侧抽屉：引用、AI 输出、评论。
- 响应式策略：≥1440px 默认展开，1024-1440px 可折叠，≤1024px 切换 focus 模式。

### 5.2 Canvas Workspace
- **CanvasViewport**：协调 React Flow 与 Konva 层；负责缩放/平移、网格背景、对齐线。
- **NodePalette**：节点创建、模板拖拽；支持搜索与快捷命令（⌘K）。
- **NodeRenderer**：按类型映射组件：
  - `NoteNode`（Tiptap）、
  - `DocumentNode`（摘要 + 引用按钮）、
  - `TaskNode`（状态、负责人、截止）、
  - `ReferenceNode`（引用卡片，与文档片段联动）、
  - `ImageNode`、`WebCardNode`。
- **EdgeRenderer**：直线/曲线连线、标签、引用标记；支持多选、批量操作。
- **GroupingLayer**：框选/分组、高亮链接；存储在 canvas state。
- **AI Canvas Tools**：
  - Summarize / Re-layout / Outline / Next actions；
  - 命令面板 + 快捷键触发；
  - 操作前派生 Yjs Transaction，结果写入对应节点。
- **Time Travel & Snapshots**：版本面板调用后端快照 API；前端加载差异并应用到临时文档。

### 5.3 Research Assistant Panel
- `ChatThread`（消息列表、结构化视图）；
- 消息气泡内可折叠引用、来源跳转；
- 工具区：Web 搜索开关、分析模板（要点表/卡片/清单）；
- 支持多线程，Tab 切换/关联到画布节点。

### 5.4 Document Hub
- 上传面板、文件队列进度；
- 预览页支持 PDF/媒体播放器/表格；
- 解析结果（章节、表格、时间轴）与引用联动；
- 支持批量操作、拖放到画布生成节点。

### 5.5 Template & Workflow
- 模板库（列表/分类/搜索）；
- 单模板预览 + 一键套用（生成预设节点布局）；
- Workflow 运行视图显示步骤进度、重试。

### 5.6 Collaboration & Feedback
- Presence Avatars、多人游标、锁定态；
- 评论侧栏：锚点绑定节点/文稿；@提及与任务；
- 变更历史：Time machine 视图，按节点/全局过滤；
- 通知中心：实时与批处理结合。

## 6. API 接口约束与集成
- **Gateway**：提供 REST/GraphQL；前端统一通过 `apiClient` 调度，内置 token 刷新、错误处理（401→logout / 429→提示 / 5xx→兜底）。
- **WebSocket**：
  - `/collab/ws`：yjs 文档同步、presence。
  - `/assistant/ws`：AI 对话流、工具执行状态。
- **SSE/长轮询**：上传解析进度、工作流任务。
- **Auth**：Auth0/Clerk → Next.js Middleware 验证 → Request context 注入组织信息；客户端 SessionProvider 提供 hooks。

## 7. 跨切关注点
- **性能**：节点虚拟化（React Flow renderer + IntersectionObserver）；Canvas 层批量渲染；懒加载富文本；使用 Web Workers 处理布局计算与本地嵌入预览。
- **可访问性**：ARIA 标签、键盘导航、缩放快捷键、对比度；提供屏幕阅读器模式（节点列表视图）。
- **国际化**：基于 next-intl，支持中英文；文案由 CMS/多语言文件管理。
- **错误处理**：全局 Error Boundary；模块级 toast/inline 提示；离线/网络抖动检测。
- **主题与设计 Token**：Tailwind + CSS Variables；组件支持暗色/高对比主题，画布背景自定义。
- **埋点与监控**：统一 `useTrackEvent` hook 封装 Segment；性能指标（TTI、FID、画布 FPS）写入 Observability。
- **测试策略**：
  - 单元：Vitest + React Testing Library；
  - 画布交互：Playwright（多用户模拟、连线、拖拽）；
  - 视觉回归：Storybook/Chromatic；
  - 协作：yjs 场景模拟（node operations, conflict resolution）。

## 8. 迭代建议
1. **MVP**：完成 Workspace Shell、基础 Canvas（节点/连线/分组）+ 文档上传/解析进度 + AI 问答面板；单用户先行，协作以轮询模拟。
2. **协作增强**：接入 yjs + presence、评论、时间线；优化性能（批量更新、Undo/Redo）。
3. **模板 & Workflow**：模板库、自动化任务运行；AI 工具条扩展（大纲、行动项）。
4. **企业特性**：权限矩阵界面、审计日志查看、导出/快照。

## 9. 关键界面与组件说明
### 9.1 Dashboard / Workspace 列表
- **布局**：左侧导航（组织、空间切换），主区为项目卡片 / 最近画布；顶部提供搜索与创建入口。
- **核心组件**
  - `WorkspaceList`：TanStack Query 获取 `/workspaces`，支持分页、筛选。
  - `ProjectCard`：显示协作者、最近更新时间、引用数量；悬停操作（进入/重命名/移动）。
  - `CreateWorkspaceModal`：步骤化创建（名称→权限→模板）。
- **交互**
  - 过滤器与视图切换（卡片/表格）；状态保持在 querystring。
  - 支持拖拽项目到空间（调用后端 move API）。

### 9.2 Workspace Shell
- **`WorkspaceLayout`**（Server Component）：加载 workspace、权限、成员；渲染 `<Suspense>` 包裹 `WorkspaceClient`。
- **`WorkspaceClient`**（Client Component）：
  - 顶栏：`WorkspaceBreadcrumb`、`PresenceBar`、`CommandBarTrigger`。
  - 边栏：`ProjectTree`（React Virtuoso 虚拟滚动），`UploadButton`、`TemplateButton`。
  - 内容区：`CanvasContainer`。
- **交互**：Command Palette（⌘K）调用：创建节点、跳转文档、触发 AI 工具；侧栏可折叠并记忆用户偏好。

### 9.3 Canvas Container
- **结构**
  - `CanvasViewport`（挂载 React Flow + Konva overlay）。
  - `CanvasToolbar`（缩放、对齐、自动布局、快照）。
  - `SelectionPanel`（多选节点属性编辑）。
  - `Minimap`（可选，展示布局概览）。
- **节点组件**
  - `NoteNode`: Tiptap 编辑器 + AI 建议面板；支持 Markdown 粘贴、@ 引用。
  - `DocumentNode`: 展示摘要、引用数量；点击进入文档详情抽屉。
  - `TaskNode`: 状态切换、负责人选择（Combobox）、自动提醒。
  - `ReferenceNode`: 只读引用卡片，点击后高亮对应文档片段。
  - `ImageNode`/`WebCardNode`: 缩略图渲染、元数据展示。
- **交互流**
  - 拖拽节点 → 触发 `onNodesChange` → 写入 Yjs Map → 广播。
  - 连线创建/删除 → 自定义 Edge Handler → 更新后台关系数据（debounce 提交）。
  - AI 操作 → 传输选中节点 ID 列表 → 后端输出 -> SSE 回写 → 更新节点内容。
  - 快照 → 调用 `/canvas/{id}/snapshots` → 结果存至 Query 缓存。

### 9.4 Document Drawer
- **`DocumentPreviewDrawer`**：右侧滑出，展示解析结构（章节/表格/时间轴）。
- **子组件**
  - `DocumentHeader`：状态标签、重新解析、下载。
  - `ChunkTimeline`：基于 `doc_chunks` 时间/页码；可拖入画布。
  - `CitationList`：按节点引用分组，支持跳转。
- **交互**：拖放 chunk 到画布生成 `ReferenceNode`；批量选择 chunk -> 生成 Note；重新解析触发后台任务。

### 9.5 Research Assistant Panel
- **`AssistantPanel`**：包含顶部工具栏（线程切换、新建、设置）与 `ThreadView`。
- **`ThreadView`**
  - `MessageItem`：区分 user/assistant/tool；结构化输出组件（要点表/清单/卡片）调用对应渲染器。
  - `CitationBadge`：点击高亮画布节点或打开来源文档。
  - `StreamingIndicator`：显示实时回答状态。
- **输入区**
  - Prompt Editor 支持 Markdown、变量插入（从选中节点/模板）。
  - 工具按钮：Web Search、结构化输出模板、动作快捷键。

### 9.6 Templates & Workflows
- **`TemplateGallery`**：模态/独立页面；分类标签 + 推荐 + 搜索。
- **`TemplatePreview`**：展示示意图、步骤、所需数据；支持“应用到当前画布”与“创建新项目”。
- **`WorkflowRunner`**：显示执行 DAG（步骤卡片 + 状态）；用户可手动跳过/重试；完成后生成节点或文档。

### 9.7 Collaboration & Comments
- **`CommentSidebar`**：按节点或时间线排序，支持 Filter（未解决/已解决）。
- **`CommentThread`**：支持 Markdown、附件、@；引用行锚点定位画布。
- **Presence**：`PresenceBar` 显示在线成员；游标颜色与用户对应；锁定同一个节点时提示冲突解决机制。
- **历史回放**：`VersionTimeline` 组件列出快照及差异摘要；支持恢复/另存为。

### 9.8 可用性增强
- 键盘交互：快捷键层映射（如 `⌘/` 查看列表）；箭头移动节点、Shift 连线。
- 辅助功能：高亮当前焦点节点、缩放指示器、网格吸附开关。
- 教程与引导：首次进入加载 `OnboardingTour`，使用 Joyride/Shepherd 等库。

> 本设计文档用于指导前端团队重构与扩展，后续迭代需同步 UI/UX 设计稿与后端 API 合约，确保联调与协同一致。
