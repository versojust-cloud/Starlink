# Starlink Codex

## 项目愿景与背景
- **Starlink** 是一个「对话即画布」的多服务协作平台，支持将复杂议题拆解为可视化的多维节点网络，并在 AI 参与下不断延展研究脉络。
- 整体设计沿袭 Branching Chat/Kuse 画布理念：一个问题会被自动拆解为分支、维度、行动计划与引用证据，帮助团队同步理解、规划与复盘。
- 仓库采用 pnpm workspaces 维护前后端一体化的工程体系，既可以联合开发，也能单独启动各个服务。

## 仓库结构概览
- `frontend/` – Next.js (App Router) 画布前端，含 React Flow 画布、AI 助手、文档抽屉等模块。
- `packages/server/` – Express + Apollo Server GraphQL 网关，负责汇总画布数据、触发 Dify 工作流并通过 Subscription 推送增量。
- `packages/shared/` – 共享的 Zod Schema 与 TypeScript 类型，统一节点/事件的契约。
- `config/` – 环境变量读取工具（Supabase、Dify、兼容旧外部服务）。
- `backend/` – 传统 REST/GraphQL 组合的知识库与 LangChain 服务，前端 `/api` 路由会转发到此服务。
- `docs/` – 架构设计文档（如 `frontend-architecture.md`）。
- `biz-canvas-agents/`、`dialogs/` – 辅助材料或实验性 Agent 配置（暂未纳入主流程）。
## 核心服务说明
- **Frontend (`frontend/`)**
  - 技术栈：Next.js App Router、React Flow、TanStack Query、Zustand、Tailwind。
  - 核心组件：`CanvasViewport`（画布节点渲染）、`AssistantPanel`、`DocumentDrawer`、`NodePalette`、`TimelineHistoryPanel`。
  - 数据来源：通过 GraphQL Client 拉取 `workspaceGraph`，并使用 SSE/WS 订阅增量；本地 `/api` 路由继续对接旧的 LangChain REST 服务（分析问题、时间线同步等）。
  - 状态管理：TanStack Query 管理服务端数据，Zustand (`store/canvas-store.ts`) 管理 UI 和任务状态。
  - 测试：Playwright 端到端测试位于 `frontend/tests`。

- **GraphQL Gateway (`packages/server/`)**
  - 技术栈：Express + Apollo Server + graphql-ws。
  - `src/index.ts` 启动 HTTP 与 WS 服务，挂载 `/graphql`。
  - Resolver 使用 `ConversationStore` 将对话上下文（workspace、question、user）与画布数据绑定，并通过 `DifyServerService` 调用 Dify Workflow 获取摘要，再按 Blueprint 生成节点与连线。
  - Subscription 通过 `graphql-subscriptions` 的 `PubSub` 推送 `conversationProgress` 事件（初始画布、增量更新、状态变更）。

- **Dify Workflow (`frontend/src`, `packages/server/src/services/dify-service.ts`)**
  - 统一的环境配置定义在 `frontend/src/config/dify.ts` 与 `config/keys.js`，可声明多个逻辑工作流 ID、基础 URL、API Key。
  - 前端：`DifyWorkflowService` 与 `/api/dify` Route Handler 封装 blocking/streaming 调用，`ContentGenerationToolbar` 等组件通过流事件实时更新 UI。
  - 服务端：`DifyServerService` 提供阻塞调用与摘要抽取，用于 GraphQL 画布生成或其它后端自动化任务。
  - `/api/analyze`、`/api/insights` 等旧接口已经迁移到 Dify 工作流，返回的节点/摘要结构保持兼容。

- **共享类型 (`packages/shared/`)**
  - 使用 Zod 定义 `CanvasNodeData`、`CanvasGraph`、`ConversationEvent` 等结构，前后端都通过该包保持类型一致。
  - 由其他包通过 workspace:* 依赖引用。

- **Legacy Knowledge Backend (`backend/`)**
  - Express REST + GraphQL 组合，提供 `/kb` 系列 CRUD、文件上传、LangChain 分析等能力。
  - 前端的 `/api/analyze`、`/api/timeline` 等 Route Handler 会透传请求至该服务的 `/ai/*` 端点。
  - 该服务仍保留“Knowledge Base”命名，后续可以视 Starlink 品牌重构命名与模块职责。

## 数据流与交互
1. 用户在 Starlink 前端创建或拖拽节点，前端通过 GraphQL Mutation（计划中）或本地模拟更新状态。
2. 针对新问题触发 `startConversation` Mutation，GraphQL Gateway 调用 Agent Runtime 生成画布，并将初始图与增量通过 Subscription 推送回前端。
3. 前端在 `/api/analyze` 端点提交更复杂的分析任务；Next.js Route Handler 会代理到 Legacy Backend 的 `/ai/analyze`，由 LangChainService 产生新的时间线/节点建议。
4. `packages/shared` 提供统一的 Schema，保证 Agent、Server 与 Frontend 的数据结构一致。

## 本地开发与运行
- **前置条件**：Node.js 18+，pnpm 8+（推荐），可选 Bun。
- **安装依赖**：在仓库根目录执行 `pnpm install` 会为所有 workspace 安装依赖。
- **启动流程**：
  1. `pnpm dev:server` – 启动 GraphQL Gateway (`packages/server`)。
  2. `pnpm dev:frontend` – 启动 Next.js 前端，访问 `http://localhost:3000`。
  3. `pnpm --filter backend dev`（或进入 `backend/` 执行 `pnpm dev`）– 启动 Legacy REST/LangChain 服务，供 `/api` 代理调用（可选，如已完全迁移 Dify 可忽略）。
- **测试**：
  - 前端：`pnpm test:e2e` 运行 Playwright；`pnpm test:e2e:headed` 进入调试。
  - Agent/Server：目前主要依赖 TypeScript 校验（`pnpm --filter <pkg> lint`）；可按需新增 Vitest/Jest。
  - Backend：`pnpm --filter backend test`（Jest）。

## 环境变量
- `frontend/.env.local`
  - `NEXT_PUBLIC_GRAPHQL_URL`：GraphQL Gateway 入口（默认 `http://localhost:4000/graphql`）。
  - `BACKEND_API_BASE_URL`：Legacy Backend 根地址（默认 `http://localhost:4000`）。
- `packages/server`
  - `PORT`：GraphQL 服务端口（默认 4000）。
  - 需要时可通过 `NODE_OPTIONS=--inspect` 等变量辅助调试。
- `config/keys.js`
  - `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_KEY`：统一的 Supabase 凭据读取。
  - `DIFY_API_BASE_URL` / `DIFY_SERVER_API_KEY` / `DIFY_CONTENT_APP_ID` / `DIFY_CONTENT_API_KEY` / `DIFY_DEFAULT_WORKFLOW_ID`：Dify 工作流配置，前后端都会读取。
  - `GRAPHQL_GATEWAY_URL` / `BACKEND_API_BASE_URL` / `OPENAI_COMPAT_BASE_URL`：兼容旧服务的可选配置。
- `backend/.env`
  - `DATABASE_URL`：Prisma/PostgreSQL 连接串。
  - `UPLOAD_DIR`：上传目录。
  - `PORT`：REST/GraphQL 服务端口。
  - `DASHSCOPE_API_KEY`：通义千问（DashScope）API Key，调用分析 Agent 必填。
  - `TONGYI_MODEL` / `TONGYI_TEMPERATURE`：可选，定制模型与采样温度。

## GraphQL 能力速览（packages/server）
- `Query.workspaceGraph(workspaceId: ID!)` – 获取指定 workspace 的完整画布。
- `Mutation.startConversation(workspaceId: ID!, question: String!)` – 触发 AI 推理生成画布，返回初始元数据与图。
- `Subscription.conversationProgress` – 订阅画布增量事件，事件类型：
  - `graph/appended`：完整图的首次播报。
  - `graph/diff`：后续增量节点/连线。
  - `status`：会话状态更新（`running`/`completed`/`failed`）。

## Dify 画布生成流程
- `DifyServerService.generateSummary`：将提问发送至默认 Dify Workflow，获取结构化或文本摘要，缺省时返回占位提示。
- `buildGraphWithDify`（`conversation-store.ts` 内部函数）：
  - 初始化根节点（记录提问人、摘要、指导语）。
  - 基于 Blueprint 生成 3 个分支问题节点（澄清目标 / 拆分维度 / 识别资源）。
  - 为每个分支补充分析维度节点（价值主张、执行路径、验证计划）。
  - 继续生成对应的行动计划节点，形成三级层次。
  - 每个新增节点与连线都会推送至 `deltas`，供 Subscription 动画播放。
- `/api/analyze` Route 复用相同 Blueprint，并在前端通过 `CanvasViewport.generateAnalysis` 更新 React Flow 画布。

## Starlink 品牌化注意事项
- 当前 npm 包名仍使用 `@starlink/*`，后续如需全面更名，可在各 `package.json` 与 import 路径中替换。
- 文档、日志输出、环境变量等也仍引用旧名称（如服务器启动日志），建议在迭代中逐步调整为 Starlink。
- 若要统一命名，请从 `package.json`、`.env`、GraphQL endpoint 日志、README/CODEX 等文档着手。

## 后续演进建议
- **GraphQL Mutation 覆盖**：目前画布更新主要由 Agent 推送，尚缺乏手动增删节点的 Mutation，可结合 `conversationStore` 扩展。
- **真实知识库接入**：实现 `KnowledgeBaseClient`，连接 `backend/` 的知识库或外部检索服务，替换 Mock。
- **多租户/鉴权**：Context 默认 `userId=anonymous`，需要接入实际认证系统并在 Subscription 中校验权限。
- **前端数据统一**：理顺 `/api` 代理与 GraphQL 双轨逻辑，逐步将 LangChain 调用迁移至 GraphQL Gateway，降低耦合。

---