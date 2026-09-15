# Branching Chat Workspace

This repository hosts a runnable multi-service setup for the “Kuse” style branching research canvas.  
The codebase is now composed of:

- **apps/web/** – Next.js App Router app，渲染多面板画布 UI 并对接 GraphQL 服务。
- **packages/shared/** – 共享的 Zod Schema & TypeScript 类型，约束画布节点、会话事件等契约。
- **packages/server/** – Express + Apollo Server GraphQL 网关，整合 Dify 工作流、发布 Subscription 事件，为前端提供统一入口。
- **config/** – 环境变量读取工具（Supabase、Dify、第三方服务）。
- **docs/** – 文档分 6 类：`paper/`（论文 + 文献综述）/ `architecture/`（系统架构）/ `design/`（前端 / 视觉设计）/ `ops/`（运维 / migration / env）/ `research/`（调研 / 对比）/ `changelog/`（变更记录）。

Key features:

- 拖拽节点到 React Flow 画布并实时持久化
- GraphQL `workspaceGraph` 查询 + Subscription 流式行程，驱动画布逐步展开的交互体验
- Dify Workflow 将提问拆解为节点、维度、行动项等多种画布结构
- Playwright 端到端测试覆盖核心交互（拖拽、面板切换、错误重试）

Both services can be developed independently or through npm workspaces.

For contributor workflow and coding standards, see [`AGENTS.md`](AGENTS.md).

## Prerequisites

- Node.js 18+
- npm 8+ (supports workspaces)

## Install Dependencies

Install everything from the repo root (leveraging pnpm workspaces):

```
pnpm install
```

这会为 `apps/web` 以及 `packages/*` 安装依赖。

## Running the GraphQL Server

```
pnpm dev:server
```

服务器默认监听 `http://localhost:4000/graphql`，提供：

- `workspaceGraph(workspaceId)` – 获取工作空间当前画布
- `startConversation(workspaceId, question)` – 启动多维画布推理
- `conversationProgress` (subscription) – 推送画布增量 & 状态事件

## LangGraph + ComfyUI Backend (Optional)

To enable LangGraph-driven ComfyUI image generation and streaming canvas updates, set these environment variables (e.g. in `packages/server/.env`):

```
OPENAI_API_KEY=...
LANGGRAPH_MODEL=gpt-4o-mini
ENABLE_CULTURAL_SKILLS=true
ENABLE_SEMANTIC_PLAN=true
COMFYUI_BASE_URL=http://localhost:8188
COMFYUI_WORKFLOW_PATH=packages/server/workflows/comfy-template.json
COMFYUI_TIMEOUT_MS=120000
```

Start ComfyUI separately, then run `pnpm dev:server`. Replace `packages/server/workflows/comfy-template.json` with your exported workflow JSON if needed.

If you prefer a one-command dev setup (ComfyUI + GraphQL + Web), set `COMFYUI_DIR` and optionally `COMFYUI_CMD`, then run:

```
COMFYUI_DIR=/absolute/path/to/ComfyUI
COMFYUI_CMD="python main.py --listen 0.0.0.0"
pnpm dev:langgraph
```

If `COMFYUI_DIR` is not set, the script starts only GraphQL + Web.

## Running the Frontend

在另一个终端：

```
pnpm dev:web
```

The Next.js app runs on `http://localhost:3000`. It fetches canvas data from `http://localhost:4000/graphql` by default. If you need to point to a different API, create a `.env.local` inside `apps/web/` and set:

```
NEXT_PUBLIC_GRAPHQL_URL=<your-endpoint>
```

## End-to-End Tests

The frontend ships with Playwright tests that cover node creation, panel toggles, and error handling.

```
# Install Playwright browsers (once)
npx playwright install

# Run the suite (auto-starts the Next.js dev server)
pnpm test:e2e

# Run knowledge suite only
pnpm test:e2e:knowledge

# Run knowledge flow only
pnpm test:e2e:knowledge:flow

# Run knowledge recovery only
pnpm test:e2e:knowledge:recovery

# Headed/debug mode
npm run test:e2e:headed
```

## Repository Layout

```
.
├── apps/web/                      # Next.js canvas client
├── packages/
│   ├── server/                    # Express + Apollo GraphQL 网关
│   └── shared/                    # Zod schema / TS types
├── docs/                          # Design documents
├── package.json                   # Workspace scripts
└── README.md                      # Project overview
```

Refer to `docs/design/frontend-architecture.md` for a deeper dive into the frontend design.
# Starlink
