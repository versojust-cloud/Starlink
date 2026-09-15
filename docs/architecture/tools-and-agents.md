# Tools & Agents Inventory

实时清单：当前 backend 加载了哪些 tool 和 agent，每个干啥。

> 启动时 audit 日志：`[tool-loader] Loaded 38 tools` + `agents.loader.completed count=12`

---

## 38 个 Tool（按类别）

### data-source（7 个 · 全 real）

| Tool | 说明 | 谁在用 |
|---|---|---|
| `web-search` | 多 provider 联邦搜索（Tavily / Brave / SerpAPI），带缓存 | market / product / finance / critic / deep-research / general-responder |
| `knowledge-base` | 工作区 KB 文档语义检索（pgvector） | 12 个 agent 全部 |
| `memory-search` | 跨会话洞察 + 历史决策检索 | 11 个 agent |
| `url-fetch` | 给定 URL + CSS selector 抓取网页内容 | market / product / finance / critic / deep-research |
| `api-connector` | 通用 HTTP 客户端（自定义 header / body） | utility，不绑 agent |
| `database-query` | PostgreSQL 查询 | utility |
| `file-reader` | 读本地文件（文本 / 二进制） | utility |

### llm-agent（6 个 · 子 ReAct 包装）

| Tool | 说明 | 谁在用 |
|---|---|---|
| `market-agent` | 市场 ReAct 子图（CS / CR / CH） | market-agent 内部 |
| `product-agent` | 产品 ReAct 子图（VP / KR / KA / KP） | product-agent 内部 |
| `finance-agent` | 财务 ReAct 子图（RS / CS） | finance-agent 内部 |
| `critic-agent` | BMC 维度间冲突检测 | critic-agent 内部 |
| `general-chat` | 通用 LLM 对话包装（自定义 system prompt） | general-responder |
| `summarizer` | 文本压缩工具 | utility |

### analysis（4 个）

| Tool | 说明 |
|---|---|
| `sentiment_analysis` | 情感打分 + 标签 |
| `risk-assessment` | 商业模式风险按类别评估 |
| `keyword-extract` | 文本关键词抽取 |
| `competitive-compare` | 竞品多维矩阵分析 |

### control-flow（5 个 · 流程编排）

| Tool | 说明 |
|---|---|
| `loop` | 列表迭代到指定 tool |
| `parallel` | 并行执行下游节点 |
| `router` | 按条件分发数据 |
| `aggregator` | 多输入合并（按策略） |
| `human-review` | HITL 人工审批门 |

### dimension-actions（16 个 · 9 个 BMC 维度的细分动作）

| 维度 | Tools |
|---|---|
| customer-segments | `cluster_personas` · `estimate_market_size` · `rank_by_accessibility` |
| channels | `propose_acquisition_channels` |
| customer-relationships | `classify_relationship_type` |
| value-propositions | `extract_jtbd` · `map_pain_to_gain` · `differentiation_score` |
| key-resources | `classify_resources` |
| key-activities | `identify_critical_activities` |
| key-partnerships | `propose_partner_categories` |
| revenue-streams | `propose_pricing_models` · `simulate_revenue` · `sensitivity_analysis` |
| cost-structure | `breakdown_cost_categories` |

### output（1 个）

| Tool | 说明 |
|---|---|
| `bmc_renderer` | BMC cards → CanvasGraph nodes（pipeline 末段） |

**全部 38 个工具均接真服务、真 LLM 或真数据源 — 0 stub / 0 fake**。
Loader：`packages/server/src/tool-registry/loader.ts`

---

## 12 个 Agent

每个都有真实的 `graph.ts`（ReAct 或 structured subgraph），不是占位。

| id | 角色 | model | temperature | 关键 tool | callability |
|---|---|---|---|---|---|
| `market-agent` | generator | deepseek-chat | 0.3 | web-search · KB · memory · 5× dim-action | standalone |
| `product-agent` | generator | deepseek-chat | 0.3 | + 6× dim-action | standalone |
| `finance-agent` | generator | deepseek-chat | 0.3 | + 4× dim-action | standalone |
| `critic-agent` | advisor | deepseek-chat | 0.2 | structured 冲突检测 | needs-bmc |
| `synthesizer` | generator | deepseek-chat | 0.2 | KB · memory | needs-bmc |
| `general-responder` | generator | deepseek-v4-pro thinking | 0.2 | web-search · KB | standalone |
| `deep-research` | generator | deepseek-v4-pro thinking | 0.3 | web-search · KB | standalone |
| `report-writer` | generator | deepseek-chat | 0.2 | KB · memory | needs-bmc |
| `market-opponent` | advisor | deepseek-v4-pro | 0.5 | + url-fetch | debate-side |
| `product-opponent` | advisor | deepseek-v4-pro | 0.5 | + url-fetch | debate-side |
| `finance-opponent` | advisor | deepseek-v4-pro | 0.5 | + url-fetch | debate-side |
| `moderator` | meta | deepseek-v4-pro | 0.2 | (none) | debate-judge |

**Frontend ↔ Backend 对齐**：
- `apps/web/src/features/comfy/registries/agent-registry.ts` 的 AgentId union 列了 12 个，注释已修为 12（之前误写 11）
- 4 类 callability：standalone（5 个）/ needs-bmc（3 个）/ debate-side（3 个）/ debate-judge（1 个）

**Knowledge Base 绑定**：
- 表 `kb_agent_bindings(workspace_id, kb_id, agent_id, auto_search)` 唯一约束 `(ws, kb, agent)`
- agent.yaml 里 `knowledge_bases: []` 都为空 — 全部由用户在 runtime 通过 `bindKbToAgent` mutation 绑定

---

## @-mention 唤起方式

在 chat dock 输入 `@<agent-id> 你的问题` 任何 agent 都能直接调用。例如：

```
@market-agent 帮我拆解客户细分
@deep-research 给收入来源找业内数据
@report-writer 基于当前画布生成完整商业报告
@critic-agent 重新审一下当前 BMC
```

`needs-bmc` 类的 agent 在画布无 BMC 时会礼貌拒绝。`debate-side` 和 `debate-judge` 在 standalone 调用时返回 "请先给具体声明"。

---

## 修改 / 新增 agent 的流程

1. 在 `packages/server/src/agents/<new-id>/agent.yaml` 写新 profile
2. 同目录写 `graph.ts`（ReAct 或 structured subgraph）
3. `packages/server/src/agents/index.ts` 自动 scan，无需注册
4. 前端 `apps/web/src/features/comfy/registries/agent-registry.ts` 的 `AgentId` union + `AGENT_LIST` 加一行
5. 跑 `pnpm --filter @starlink/server validate:agents` 验证 profile + tool 解析
6. 跑 `node packages/server/dist/scripts/smoke-citation-pipeline.js` 等 smoke 验证 e2e

修 tool 的流程类似但更轻量 —— `packages/server/src/tools/<category>/<tool-id>.ts` 加文件，`tool-registry/loader.ts` 自动 scan。
