# Architecture 导航

> **项目名**：Starlink / Braching Chat
> **论文题目**：基于多智能体协同的生成式商业画布系统的设计与实现
> **创新方向**：Evidence-Grounded BMC Generation with Cell-Level Citation

本文档是代码导航入口。深度架构设计见 [`docs/architecture/architecture-evidence-grounded-bmc.md`](docs/architecture/architecture-evidence-grounded-bmc.md)（12 章 + 2 附录），实施计划见 [`docs/ops/implementation-plan.md`](docs/ops/implementation-plan.md)。

---

## 创新点定位（1 分钟理解）

本系统的学术创新**集中在**两处：

### ① Cell-level Citation 机制（后端）

每张 BMC 卡片字段级绑定 evidence 引用，支持反向追溯。

```
packages/shared/src/schemas/citation.ts          # 数据契约
packages/server/src/services/citation/           # Parser 核心
  ├── citation-parser.ts        # parseCitations + computeGroundingRate
  ├── citation-parser.test.ts   # 19 个单元测试
  └── index.ts                  # 公开 API
```

### ② Citation-aware Prompt Engineering（推理）

让 Market/Product/Finance Agent 输出带 `[[ref:docId#snippetId]]` 标记。

```
packages/server/src/services/business-langgraph.ts
  - buildKnowledgePrompt           # 生成 evidence 索引 + citation 规则 + few-shot
  - applyCitationParsing           # 解析 LLM 输出 → CardCitation[]
  - runMarketAgent / runProductAgent / runFinanceAgent   # 接入点
```

---

## 代码导航：论文章节 → 代码路径

| 论文章节 | 实现位置 |
|---|---|
| §3.1 多智能体协同推理 | `packages/server/src/services/business-langgraph.ts`（Supervisor + Market/Product/Finance/Critic）|
| §3.2 LLM 推理与结构化生成 | 同上 + `normalizeDomainNodes` |
| §3.3 知识增强机制 | `packages/server/src/application/conversation-store.ts`（KB 检索注入）+ `services/business-langgraph.ts#buildKnowledgePrompt` |
| §3.4 可视化商业画布 | `apps/web/app/(app)/workspace/[workspaceId]/canvas/page.tsx` + `apps/web/src/features/comfy/` |
| §3.5 前后端闭环集成 | `packages/server/src/application/conversation-phase.ts`（状态机）+ `graphql/resolvers.ts` |
| §4 Evidence-Grounded BMC（创新核心）| `packages/server/src/services/citation/` + `packages/shared/src/schemas/citation.ts` |
| §5 系统实现 | 全部 `packages/*` + `apps/web/` |
| §6 实验评估（Stage 5）| `scripts/eval-baseline.ts`（待建）|

---

## Monorepo 结构

```
.
├── apps/
│   └── web/                          # Next.js 前端（UI 层 + ReactFlow 画布）
│       └── src/features/             # feature-based 组织
│           ├── comfy/                # BMC Canvas 画布核心
│           ├── canvas/               # Stage 3 待建：Citation UI
│           ├── knowledge/            # 知识库管理 + KbSelector
│           ├── macra/                # 另一条 conversation 链路
│           ├── workspace/            # 工作区
│           └── ...
│
├── packages/
│   ├── shared/                       # 前后端共享 zod schema
│   │   └── src/
│   │       ├── schemas/              # canvas, conversation, citation ★, tool, flow
│   │       ├── contracts/            # API 契约
│   │       └── ...
│   │
│   └── server/                       # GraphQL API + LangGraph 推理
│       └── src/
│           ├── application/          # 领域层（store / repository）
│           │   ├── conversation-*    # 会话运行时（7 个文件，Stage 1-4 核心）
│           │   └── ...
│           ├── graphql/              # Schema + Resolvers
│           └── services/
│               ├── citation/ ★        # 创新核心：cell-level citation parser
│               ├── business-langgraph.ts  # 多 Agent 协同（1700 行）
│               ├── kb-task-service.ts     # 知识库任务
│               └── llm-*, dify-*
│
├── backend/                          # 独立 REST 服务（Prisma + Express）
│   └── src/routes/kb.ts              # KB 导入 REST 端点
│
└── docs/
    ├── architecture-evidence-grounded-bmc.md   # 架构设计（12 章）
    ├── 开题报告-模板组织版.md
    ├── literature_review_full_draft.md
    └── ...
```

★ = Stage 2 新增 / 本次规整打包

---

## 关键模块快速跳转

| 想看什么 | 直接看这个文件 |
|---|---|
| 多智能体编排 | `packages/server/src/services/business-langgraph.ts` |
| Citation 解析算法 | `packages/server/src/services/citation/citation-parser.ts` |
| Citation 数据契约 | `packages/shared/src/schemas/citation.ts` |
| 会话状态机 | `packages/server/src/application/conversation-phase.ts` |
| 前端 KB 选择 | `apps/web/src/features/knowledge/components/kb-selector.tsx` |
| Canvas 主界面 | `apps/web/app/(app)/workspace/[workspaceId]/canvas/page.tsx` |
| GraphQL Schema | `packages/server/src/graphql/type-defs.ts` |
| Stream 事件路由 | `apps/web/src/shared/lib/conversation-sync-engine.ts` |

---

## 开发与测试

```bash
# 启动全栈 dev
pnpm dev

# 仅 server 单元测试
pnpm --filter @starlink/server test

# 类型检查
pnpm --filter @starlink/web exec tsc --noEmit
pnpm --filter @starlink/server run lint
```

---

## 相关文档

- **深度架构**：[`docs/architecture/architecture-evidence-grounded-bmc.md`](docs/architecture/architecture-evidence-grounded-bmc.md)
- **实施计划**：[`docs/ops/implementation-plan.md`](docs/ops/implementation-plan.md)
- **产品定位**：[`docs/architecture/final-product-shape-prd.md`](docs/architecture/final-product-shape-prd.md)
- **开题报告**：[`docs/paper/开题报告-模板组织版.md`](docs/paper/开题报告-模板组织版.md)
- **文献综述**：[`docs/paper/literature-review-full-draft.md`](docs/paper/literature-review-full-draft.md)
- **多智能体架构**：[`docs/architecture/multi-agent-architecture.md`](docs/architecture/multi-agent-architecture.md)
- **论文章节**：[`docs/paper/`](docs/paper/) (含 outline / chapter-1 / chapter-7 等)
- **变更日志**：[`docs/changelog/`](docs/changelog/)
