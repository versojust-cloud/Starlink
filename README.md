# Starlink · 分支式商业画布工作台

> 基于多智能体协同的生成式商业画布系统。把一次商业分析拆成可追溯的画布节点,
> 每个 BMC 卡片字段都绑定 evidence 引用,支持反向追溯,而不是让大模型自由发挥。

## English Summary

Starlink (Branching Chat Workspace) is a multi-agent system that generates an
**Evidence-Grounded Business Model Canvas**. Rather than letting an LLM fill the canvas
freely, every card field is bound to a **cell-level citation** that traces back to its
source document. The research contribution sits in two places:

1. **Cell-level citation mechanism** — parsing `[[ref:docId#snippetId]]` markers and
   computing a grounding rate over the generated canvas.
2. **Citation-aware prompt engineering** — the Market / Product / Finance agents are
   prompted with an evidence index plus citation rules, so their output is citable by
   construction.

The codebase is a pnpm monorepo: a **Next.js 14** canvas client (React Flow), an
**Express + Apollo Server** GraphQL gateway, a **LangGraph**-driven agent layer
(Supervisor + Market / Product / Finance / Critic), and shared Zod schemas that pin down
the contract between them.

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | Next.js 14 (App Router) · React 18 · React Flow 11 |
| 网关 | Express · Apollo Server(GraphQL,含 Subscription) |
| 智能体 | LangGraph — Supervisor + Market / Product / Finance / Critic |
| 契约 | Zod schema(`packages/shared`),前后端共用 |
| 工作流 | Dify Workflow(问题拆解为画布节点 / 维度 / 行动项) |
| 存储 | PostgreSQL · Supabase |
| 可观测 | LangSmith / OpenTelemetry(均可选,默认关闭) |
| 测试 | Playwright 端到端测试 · 服务端单元测试 |

创新点的代码位置:Citation 解析在 `packages/server/src/services/citation/`,
推理侧接入在 `packages/server/src/services/business-langgraph.ts`,
数据契约在 `packages/shared/src/schemas/citation.ts`。

## 目录结构

```
.
├── apps/
│   └── web/                    # Next.js 画布客户端(App Router + React Flow)
│       ├── app/                # 路由;主画布在 app/(app)/workspace/[workspaceId]/canvas/
│       └── src/features/       # feature 化组织:comfy(画布) / knowledge / workspace / ...
│
├── packages/
│   ├── server/                 # GraphQL 网关 + LangGraph 多智能体
│   │   └── src/
│   │       ├── graphql/        # type-defs + resolvers
│   │       ├── application/    # 会话运行时 / 状态机 / store
│   │       ├── infrastructure/ # 配置校验、数据库连接池
│   │       └── services/       # citation ★ / business-langgraph / kb-task / llm-* / dify-*
│   ├── shared/                 # 前后端共享的 Zod schema 与 TS 类型
│   │   └── src/schemas/        # canvas / conversation / citation ★ / tool / flow
│   └── ui/                     # 共享 UI 组件与 hooks(@starlink/ui)
│
├── docs/                       # 见下方「文档索引」
├── scripts/                    # dev-langgraph.sh · postgres-init.sql
├── .github/workflows/          # web-knowledge-e2e.yml(PR 上跑知识库 E2E)
├── ARCHITECTURE.md             # 代码导航入口,论文章节 → 代码路径
└── package.json                # workspace 脚本
```

## 环境要求

- **Node.js 18+**(CI 使用 20)
- **pnpm 9+**(本项目使用 pnpm workspace,不要用 npm / yarn 安装)

## 快速开始

```bash
# 1. 安装依赖(在仓库根目录执行,会为 apps/web 与 packages/* 一起装)
pnpm install

# 2. 准备服务端环境变量
cp packages/server/.env.example packages/server/.env
#    然后按需填写,详见下方「环境变量」

# 3. 启动 GraphQL 服务(默认 http://localhost:4000/graphql)
pnpm dev:server

# 4. 另开一个终端,启动前端(默认 http://localhost:3000)
pnpm dev:web
```

前端默认从 `http://localhost:4000/graphql` 取数。要指向别的后端,在 `apps/web/`
下新建 `.env.local`:

```
NEXT_PUBLIC_GRAPHQL_URL=<your-endpoint>
```

### GraphQL 接口

| 类型 | 名称 | 说明 |
|---|---|---|
| Query | `workspaceGraph(workspaceId)` | 获取工作空间当前画布 |
| Mutation | `startConversation(workspaceId, question)` | 启动多维画布推理 |
| Subscription | `conversationProgress` | 推送画布增量与状态事件 |

## 常用脚本

```bash
pnpm dev              # 等价于 dev:web
pnpm dev:web          # 只起前端
pnpm dev:server       # 只起 GraphQL 服务
pnpm dev:langgraph    # 同时起 GraphQL + Web(见下方说明)

pnpm build            # 构建前端
pnpm build:server     # 构建服务端
```

> `dev:langgraph` 会并行拉起 GraphQL 与前端。若额外设置了 `COMFYUI_DIR`,它还会
> 一并启动 ComfyUI —— 但 ComfyUI 链路**已废弃**(已被 Business LangGraph 替代),
> 无特殊需要不要设置该变量。

## 环境变量

**权威清单见 [`packages/server/.env.example`](packages/server/.env.example)**,文件内
每一项都有中文注释说明。开发时最常需要动的几类:

| 变量 | 说明 |
|---|---|
| `DATABASE_URL` | PostgreSQL 连接串 |
| `PORT` | 网关端口,默认 4000 |
| `INTERNAL_SERVICE_TOKEN` | `/internal/*` 路由的鉴权令牌,**不设则全部放行**,生产必填 |
| `LLM_BASE_URL` / `LLM_API_KEY` | 默认 LLM 提供方(示例配置指向 SiliconFlow) |
| `LANGGRAPH_MODEL` | 智能体使用的模型 |
| `ENABLE_AUTO_CRITIC` | 是否启用 Critic 自动检测,默认启用 |
| `AUTH_MODE` | 网关鉴权模式:`disabled`(默认)/ `jwt` |

几组值得注意的开关(默认均为关闭,开发按需打开):

- **Embedding** —— 不配置则回退到 `local-hash` 伪向量,检索质量约等于关键词匹配,
  此时 RAG 与 Citation 的评估数据没有意义。做相关实验前请配置真实 embedding endpoint。
- **LangSmith / OpenTelemetry** —— `LANGSMITH_TRACING` 与 `OTEL_ENABLED` 控制,
  保持 `false` 时无任何网络出站。
- **Orchestration 模式** —— `ORCHESTRATION_MODE` 可选 `legacy`(默认,当前 benchmark
  主路径)或 `registry`。做学术对比时建议显式设为 `legacy`。

## 测试

端到端测试基于 Playwright,覆盖节点创建、面板切换与错误处理。

```bash
# 首次需要安装浏览器
npx playwright install

pnpm test:e2e                        # 全量(会自动拉起 Next.js dev server)
pnpm test:e2e:headed                 # 有头模式,便于调试
pnpm test:e2e:knowledge              # 知识库套件
pnpm test:e2e:knowledge:flow         # 只跑 flow
pnpm test:e2e:knowledge:recovery     # 只跑 recovery
```

`.github/workflows/web-knowledge-e2e.yml` 会在 PR 上并行跑 flow 与 recovery 两个套件。

服务端单元测试与类型检查:

```bash
pnpm --filter @starlink/server test
pnpm --filter @starlink/web exec tsc --noEmit
pnpm --filter @starlink/server run lint
```

## 文档索引

| 目录 | 内容 |
|---|---|
| [`docs/architecture/`](docs/architecture/) | 系统架构(主设计文档 12 章 + 附录)、多智能体架构、黑板模型 |
| [`docs/paper/`](docs/paper/) | 论文正文:开题报告、详细提纲、各章节、文献综述 |
| [`docs/design/`](docs/design/) | 前端与视觉设计:画布框架、卡片展开、画布风格改版 |
| [`docs/ops/`](docs/ops/) | 运维与实施:环境变量、Dify 集成、新增 Agent 示例、实施计划 |
| [`docs/research/`](docs/research/) | 调研与对比:研究报告、项目综述、Agent 演进计划 |
| [`docs/changelog/`](docs/changelog/) | 变更记录 |
| [`docs/dify/`](docs/dify/) | Dify 工作流导出文件 |

**想快速上手代码,先看 [`ARCHITECTURE.md`](ARCHITECTURE.md)** —— 它是代码导航入口,
按论文章节列出了对应实现位置。贡献约定见 [`AGENTS.md`](AGENTS.md)。
