# 环境变量 / 配置文件总目录

整理所有 env 配置位置 — 改任何一个都先回到这里看一眼。

## TL;DR

| 你想做什么 | 改这个文件 |
|---|---|
| **后端日常开发** | `packages/server/.env`（已 git-ignored，从 `.env.example` 起步） |
| **看后端有哪些 env 可以配** | `packages/server/.env.example` ← **canonical reference**（含全部 90+ 项） |
| **切换到本地 PG (Postgres.app:5431)** | `cp packages/server/.env.pg-local packages/server/.env` |
| **切换到 Supabase** | `cp packages/server/.env.supabase packages/server/.env` |
| **前端日常开发** | `apps/web/.env.local`（按 Next.js 约定，从 `.env.local.example` 起步） |

## 文件清单

```
.
├── ENV.md                                          ← 你正在读这里
├── packages/server/
│   ├── .env                  ← 后端 active env（实际加载的）
│   ├── .env.example          ← canonical reference: 全部 env 的解释 + 默认值
│   ├── .env.pg-local         ← 切换 profile: 本地 Postgres.app:5431
│   └── .env.supabase         ← 切换 profile: Supabase 后端
└── apps/web/
    └── .env.local.example    ← 前端 env 模板（NEXT_PUBLIC_GRAPHQL_URL 等）
```

> 历史的 `backend/` legacy 目录已在 P9 cleanup 中删除（新代码全在 packages/server）。

## 启动顺序（从 0 到能跑）

1. `cp packages/server/.env.example packages/server/.env`
2. 编辑 `packages/server/.env`：填 `LLM_API_KEY`（必填）+ 调整 `DATABASE_URL`（默认走 5431 / kb_dev）
3. `cp apps/web/.env.local.example apps/web/.env.local`
4. `pnpm install && pnpm --filter @starlink/server build`
5. 后端：`cd packages/server && node --env-file=.env dist/index.js`
6. 前端：`pnpm --filter @starlink/web dev`

## 后端 env 分组（详见 `packages/server/.env.example`）

| 分组 | 关键变量 | 必填？ |
|---|---|---|
| **Postgres** | `DATABASE_URL` / `PG_*` 连接池 | ✅ |
| **Auth** | `AUTH_MODE`（dev = `disabled`） / `AUTH_JWT_SECRET` | dev 可空 |
| **Internal token** | `INTERNAL_SERVICE_TOKEN` | dev 可空，生产必填 |
| **LLM** | `LLM_API_KEY` / `LLM_BASE_URL` / `LANGGRAPH_MODEL` | ✅ |
| **Embedding (RAG)** | `EMBEDDING_PROVIDER` / `EMBEDDING_API_KEY` / `EMBEDDING_MODEL` | dev 可走 `local-hash` 兜底 |
| **HITL / Debate** | `HITL_ENABLED` / `DEBATE_ENABLED` | dev 都开 |
| **BMC pipeline** | `BMC_MAX_ROUNDS=3` / `BMC_STAGE_TIMEOUT_MS=90000` / `WIZARD_PREFILL_MODEL=deepseek-v4-flash` | 默认即可 |
| **LangGraph checkpointer** | `LANGGRAPH_CHECKPOINTER_ENABLED=true` | dev 都开 |
| **CORS** | `CORS_ORIGINS=http://localhost:3210,http://localhost:3000` | ✅ |
| **Memory / User-skill** ⚠ | `MEMORY_WRITE_ENABLED=true` / `MEMORY_READ_ENABLED=true` / `USER_SKILL_ENCRYPTION_KEY` | **必填**（dev 默认关闭，全部 personalization 静默失效） |
| **Reaper** | `REAPER_*` 心跳超时清理 | 默认即可 |
| **Observability** | `LANGSMITH_*` / `OTEL_*` | 可选 |
| **Web search tools** | `BRAVE_API_KEY` / `SERPAPI_KEY` / `TAVILY_API_KEY` | 可选 |

## 前端 env（apps/web/.env.local）

```env
NEXT_PUBLIC_GRAPHQL_URL=http://localhost:4000/graphql
NEXT_PUBLIC_DEFAULT_USER_ID=lead-alex   # 开发时模拟登录用户
```

仅 `NEXT_PUBLIC_*` 前缀的 env 会暴露给浏览器，其它仅 SSR 可见。

## 特别注意

- **`.env`** 全部 `.gitignore`，密钥不会泄漏。**`.env.example`** 才是会被 commit 的模板。
- **当我新增一个 env 变量时**：必须同时更新 `.env.example` + 这份 `ENV.md`，否则下次切机器就找不到该填啥。
