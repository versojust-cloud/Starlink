# GraphQL Gateway

Express + Apollo GraphQL gateway for workspace/canvas/conversation.

## Prerequisites

- Node.js 18+
- PostgreSQL database

## Setup

```bash
pnpm install
pnpm --filter @starlink/server dev
```

## Scripts

| Script | Description |
| --- | --- |
| `pnpm --filter @starlink/server dev` | Start gateway |
| `pnpm --filter @starlink/server build` | Compile TypeScript |
| `pnpm --filter @starlink/server start` | Run compiled server |
| `pnpm --filter @starlink/server lint` | Type check |
| `pnpm --filter @starlink/server smoke:langsmith` | 验证 LangSmith tracing 配置（见下方 Observability） |
| `pnpm --filter @starlink/server validate:agents` | Phase 2 · 校验所有 agent.yaml |
| `pnpm --filter @starlink/server benchmark:run` | Phase 3 · 跑 benchmark harness |

## Environment Variables

Create `.env`:

```
DATABASE_URL="postgresql://user:password@localhost:5432/kb_dev?schema=public"
PORT=4000
INTERNAL_SERVICE_TOKEN="change-me"
KB_TASK_SERVICE_URL="http://localhost:4001"
```

## API Summary

- `POST /graphql` — queries/mutations
- `WS /graphql` — subscription stream
- `POST /internal/task-events` — internal KB task event ingestion (token protected)
- `POST /kb/:kbId/import/file` — proxy multipart file upload to task service

The gateway keeps task status projections in memory and exposes:
- `kbTaskStatus(workspaceId: ID!, kbId: ID!)`
- `knowledgeBases(workspaceId: ID!)`
- `createKnowledgeBase(workspaceId: ID!)`
- `publishKnowledgeBase(workspaceId: ID!, kbId: ID!)`
- `addKnowledgeSeed(workspaceId: ID!, kbId: ID!, text: String!)`
- `importKnowledgeUrl(workspaceId: ID!, kbId: ID!, url: String!)`

## Observability（可选 · Day-1）

本地 LangSmith tracing 默认**关闭**，开启是可选的，只用于开发者侧调试 LangGraph 执行链路。
LangGraph v1.x 启用后自动生成 trace，不需要改任何业务代码。

### 开启步骤

1. **拿 key**：登录 <https://smith.langchain.com> → Settings → API Keys → 创建个人 key（`lsv2_pt_...`）
2. **设置环境变量**：在 `packages/server/.env` 里
   ```
   LANGSMITH_TRACING=true
   LANGSMITH_API_KEY=lsv2_pt_...
   LANGSMITH_PROJECT=starlink-bmc-dev
   ```
3. **验证**：`pnpm --filter @starlink/server smoke:langsmith`
   脚本跑通后，打开 LangSmith → 项目 `starlink-bmc-dev` → Threads 标签，
   查找形如 `smoke-test-<timestamp>` 的 thread（~5s 内到达）
4. **关闭**：设 `LANGSMITH_TRACING=false` 或清空 `LANGSMITH_API_KEY`，重启服务

### 配额与采样

- LangSmith Free tier = 5,000 trace/月。~4 人开发团队按 ~30 BMC 运行/天 × 6 span ≈ 16k/月，**约 2 周打爆**
- 若打算长期用 cloud：在 `.env` 里设 `LANGSMITH_SAMPLING_RATE=0.3`，或升 Developer plan（$39/seat/mo）
- 更稳的路径：见下方"生产部署"

### 中文产品生产部署注意

LangSmith Cloud **仅有 US / EU region**，无 China / HK / APAC。
生产环境（特别是中国市场）请走 Phase-2 的 **Langfuse 自托管**路径：
- MIT 协议，docker-compose 起 5 容器（web/worker/postgres/clickhouse/redis + minio）
- 功能基本对等 LangSmith，可通过 `TRACE_BACKEND=langfuse` 切换
- 详见 `docs/observability-phase2.md`（待补）

### 安全提示

- **切勿提交**任何真实 `LANGSMITH_API_KEY` 到 git。`.env` 已在 `.gitignore` 里
- **切勿**在 `apps/web` 里以 `NEXT_PUBLIC_LANGSMITH_*` 前缀暴露 key（Next.js 会把它打进浏览器包）
- CI / 单元测试强制 `LANGSMITH_TRACING=false`（Workflow 已护栏），不要手动覆盖
