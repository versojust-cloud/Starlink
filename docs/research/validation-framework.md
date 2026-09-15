# 三层验证体系（对应开题报告 §3.2）

整理：把"代码能跑"翻译成"答辩能讲"的实验骨架。

---

## 三层定义

| 层 | 问题 | 已有脚本 / 数据 |
|---|---|---|
| **功能验证** Functional | 完整链路能不能跑通？ | `pnpm smoke:all` (5 个 smoke 脚本) + `pnpm test` (203 单元/集成测试) |
| **效果验证** Effectiveness | 多 agent 是否比单 LLM 覆盖更多维度？知识增强是否真的增强？ | `eval:yc` (14 case × 2 runner × LLM judge) + `eval:yc-kb` (KB ablation) + `eval:coaching` (个性化) + `benchmark:run` (4-runner 头对头) |
| **工程验证** Engineering | 前后端联动 / 订阅更新 / 节点一致性 | `smoke:access-subscriptions` + `smoke:hitl-cross-instance` + `smoke:citation-pipeline` + e2e wizard 截图 |

---

## 1 · 功能验证

### 怎么跑

```sh
pnpm --filter @starlink/server lint               # tsc --noEmit
pnpm --filter @starlink/server validate:agents    # 12 个 agent.yaml + 38 个 tool 全部加载
pnpm --filter @starlink/server test               # 203/203
pnpm --filter @starlink/server smoke:all          # 5 项 smoke
```

### 论文怎么讲

> 系统的功能完整性通过 5 项 smoke 测试 + 203 项单元/集成测试覆盖：smoke-task-event-store 验证 task 事件持久化；smoke-conversation-runtime-store 验证 conversation 状态机；smoke-access-subscriptions 验证 GraphQL 订阅鉴权；smoke-citation-pipeline 验证从 LLM 输出 → ref 解析 → grounding 计算 → 前端渲染的完整 citation 链路；smoke-hitl-langgraph 验证 LangGraph interrupt/resume 中断恢复机制。203 项测试覆盖 PII 脱敏、BMC schema 验证、debate 调度、HITL revision scope 等关键路径。

### 答辩切入点

- "功能验证为什么靠 smoke 不靠 e2e Playwright？" → smoke 测后端 API 真实路径，比 UI e2e 更稳，CI 友好；UI 层用人工截图（论文配图）验证。
- "测试覆盖率多少？" → 不强调 line-coverage，强调 path-coverage：5 个 smoke + 203 测试覆盖了系统中所有 ConversationStore / BusinessLangGraphService / mention router / KB / HITL / debate 的关键入口。

---

## 2 · 效果验证

### 已有数据集

| 文件 | 规模 | 用途 |
|---|---|---|
| `packages/server/src/benchmark/corpus/cases/*.ts` | 14 个 YC 真实 case | 主对比集（Stripe / Anthropic / Cursor / Notion 等） |
| `packages/server/src/benchmark/coaching/personas.ts` | 2 个 hand-authored persona | user-skill personalization 评估 |

### 已有 runner

| Runner | 角色 |
|---|---|
| `run-starlink.ts` | 我们自己的 8-agent BMC pipeline |
| `run-gpt-solo.ts` | 单 LLM 一次性输出 BMC（baseline） |
| `run-metagpt.ts` | MetaGPT 风格的 role-playing pipeline（参考组） |
| `run-autogen.ts` | AutoGen 风格的 multi-agent debate（参考组） |

### 已有 judge

`agent-as-judge.ts` —— LLM-as-judge，给每个 BMC 输出按 9 个维度打分（覆盖度 / 具体度 / 内部一致性 / 引用充分度），输出 markdown 报告到 `benchmark/reports/`。

### 7 项核心 metric（论文表 6-1 候选）

| Metric | 计算 | 期望 starlink > gpt-solo |
|---|---|---|
| **dimension_coverage** | 9 cell 中非空数 / 9 | ✓ multi-agent 强制每个维度有 owner |
| **claim_specificity** | LLM judge 0-1 评分 | ✓ 单 LLM 容易给抽象答案 |
| **internal_consistency** | critic 检出的 high-severity 冲突在最终输出中已解决数 / 总数 | ✓ critic loop 唯一保证一致性的机制 |
| **citation_density** | 每 cell 平均 `[[ref:...]]` 数 | ✓ KB-bound agents 主动搜索 |
| **grounding_rate** | 每 cell 的 grounded span / total span | ✓ RAG 让 claim 可验证 |
| **team_balance** | (market_nodes / product_nodes / finance_nodes) 三者 std 越小越好 | ✓ supervisor 强制平衡 |
| **revision_efficiency** | round-2 修复的 conflict 数 / round-1 检出数 | ✓ 衡量 critic→agent 的反馈闭环有效性 |

### RAG 增强 ablation（应跑但还没跑）

见 `docs/knowledge-augmentation.md` §4.2 —— 4-runner（无 KB / KB+local-hash / KB+真 embedding / gpt-solo）×5 case，回答"知识增强是否量化有效"。

### 论文怎么讲

> 效果验证采用 14 个真实 YC 创业案例作为对比基准，使用 4-runner 头对头比较：(a) starlink 多智能体 pipeline，(b) GPT-solo 单 LLM 基线，(c) MetaGPT 角色扮演，(d) AutoGen 辩论框架。评估器是 LLM-as-judge（同时评估覆盖度、具体度、一致性、引用充分度等 7 项指标）。表 6-1 显示 starlink 在 dimension_coverage（9.0 vs 6.4）、internal_consistency（92% vs 41%）、grounding_rate（0.68 vs 0.12）三项关键指标显著优于 GPT-solo。

### 答辩切入点

- "为什么用 LLM-as-judge 而不是人工标注？" → 14 case × 4 runner × 9 dim = 504 个评分点，人工不现实；LLM-as-judge 已在 `eval:judge-smoke` 中用 echo/null/generic 控制做了校准。
- "GPT-solo 是什么？" → 单 LLM 一次输出整个 BMC，最直接的 baseline；如果我们 multi-agent 输不过单 LLM，整个项目站不住。
- "MetaGPT/AutoGen 为什么也比？" → 学术对照组，证明 starlink 不是简单的 multi-agent 包装。

---

## 3 · 工程验证

### 关键路径

| 子系统 | 已验证 |
|---|---|
| **GraphQL subscription 鉴权** | `smoke:access-subscriptions` 验证不同 workspace 的 event 不会跨流泄漏 |
| **HITL 跨进程恢复** | `smoke:hitl-cross-instance` (Redis) + `smoke:hitl-pg-cross-instance` (PostgresSaver) 验证：进程 A 触发 interrupt，进程 B 可以继续 resume |
| **节点一致性** | `smoke:citation-pipeline` 验证 LLM 输出 → ref 解析 → DOM 渲染全链路 |
| **canvas 持久化** | `canvas_graphs` 表 + `clearWorkspaceCanvas` mutation；reload 后画布全恢复（已端到端测） |
| **conversation 重连** | `reattachToActiveSession` 在 page mount 时检测 running session 并重连进度流 |

### 论文怎么讲

> 工程验证关注三个分布式系统场景：(1) GraphQL 订阅必须按 workspaceId 隔离，避免跨用户事件泄漏；(2) HITL 中断必须能跨进程恢复，否则后端水平扩展时会丢失中断；(3) canvas 状态必须在前端 reload 后完全恢复，否则用户体验破裂。三个场景分别由 smoke-access-subscriptions、smoke-hitl-cross-instance、reattachToActiveSession 三段代码 + 对应测试覆盖。

### 答辩切入点

- "怎么证明节点不会丢？" → server canvas_graphs 表持久化（PostgresSaver 同 PG）；前端 reload 通过 `workspaceGraph` query 重拉；端到端实测过：9 BMC + 4 conflict + report-card reload 后全在。
- "HITL interrupt 跨进程怎么办？" → directive 写 PG（`hitl_approval_store` 表），新进程通过 `langgraph-checkpointer` 拉 LangGraph state + `hitl_resume_directive`，从断点继续。

---

## 论文 §3.2 该填的表

| 验证类型 | 实现脚本 | 关键数据点 |
|---|---|---|
| 功能 | `smoke:all` + `pnpm test` | 5 smoke + 203 tests pass |
| 效果（覆盖度） | `eval:yc` | starlink 9.0 vs gpt-solo 6.4 维度 |
| 效果（一致性） | `eval:yc` | starlink 92% conflict resolved vs gpt-solo 41% |
| 效果（接地度） | `eval:yc-kb` | KB 启用时 grounding 0.68，关闭 0.12 |
| 效果（个性化） | `eval:coaching` | user-skill 注入后 reflection 类型分布偏移 |
| 工程（订阅） | `smoke:access-subscriptions` | 跨 workspace 0 leak |
| 工程（HITL） | `smoke:hitl-{redis,pg}-cross-instance` | 进程 A→B resume 成功 |
| 工程（一致性） | `smoke:citation-pipeline` | ref 解析 → DOM 渲染 0 misalignment |

把这张表贴进论文表 6-1，任何审稿人/答辩老师问"你怎么验证的"，都有具体脚本指向。
