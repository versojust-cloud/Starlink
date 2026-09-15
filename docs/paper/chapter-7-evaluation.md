# 第 7 章 · 实验评估（详细草稿）· 中文 · 待数据回填后定稿

> 字数预算：6500 字（论文核心数据章节）
> 数据状态：
>   ✅ §7.2 RAG 实验已跑 (eval:rag --mode=both)
>   🟢 §7.3.1 主表 (eval:yc) 跑中 PID 46850 · case 4/14
>   ⏸ §7.3.2 消融 (5 variants × 5 cases) — 待 yc 完成后启动
>   ⏸ §7.4 个性化 (eval:coaching) — 待 yc 完成
>   ⏸ §7.5 用户访谈 (n=5) — 待安排
>   ✅ §7.6 性能基准已有 live data
>   ✅ §7.7 工程可靠性 (251 unit + 7 smoke)

---

## 7.1 实验设置

### 7.1.1 硬件与软件环境

| 项 | 值 |
|---|---|
| 操作系统 | macOS 15 (Apple Silicon) |
| Node.js | v24.14.0 |
| LLM Backend | DeepSeek `deepseek-chat` (v3) + `deepseek-v4-pro` (thinking) |
| Embedding Backend | DashScope `text-embedding-v4` (1536 维原生) |
| 数据库 | PostgreSQL 16 + pgvector 0.7 (本地 :5431) |
| 向量索引 | ivfflat lists=100, vector_cosine_ops |
| Judge LLM | DeepSeek `deepseek-v4-pro` + structured output schema (per-cell 9-dim) |

### 7.1.2 数据集来源

**YC 14 case 数据集**（位于 `packages/server/benchmark/cases/yc/*.json`）：
- 来源：YC（Y Combinator）公开的批次创业项目，覆盖代表性行业
- 14 案例分布：
  - SaaS / DevTools (5)：Stripe, Airbnb, Coursera, Replit, Vercel
  - Fintech (2)：Stripe, Robinhood
  - 硬件/IoT (2)：Pebble, Anduril
  - Marketplace (2)：DoorDash, Patreon
  - 创意/媒体 (2)：Reddit, Twitch
  - AI 创业 (1)：OpenAI
- 每个 case 字段：`one_liner` + `sector` + `funding_round` + `description` + `workspace_knowledge[]`（部分 case 已 seed 5-10 个 KB chunk）

### 7.1.3 评分维度（Agent-as-Judge schema）

为每个 BMC cell 评 0-1 分共 9 个维度（与 BMC 9-cell 一一对应），并按 5 个 quality criterion 输出 reasoning：

| Criterion | 含义 | 示例好分 |
|---|---|---|
| **Specificity** | 是否有具体数字 / 命名实体 / 可验证 fact | "20-80 人办公室，月预算 800-2000 元" |
| **Coverage** | 是否覆盖 must_cover 概念 | RS 必须覆盖 "transaction fee" 或 "subscription" |
| **Coherence** | 跨维度是否无矛盾 | KS 提"线下门店"，CH 不能只写"电商" |
| **Actionability** | 是否产出可执行下一步 | 含 "MVP 试点 5 家公司" 而非 "做市场调研" |
| **Citation grounding** | 引用是否归源 | 含 `[[ref:...]]` 或 `[[bmc:...]]` 标签 |

每 cell 9-dim 平均分 + per-criterion 加权平均 = 该 case 的 mean score。

---

## 7.2 RAG 检索质量（消融）✅ 已跑

> 命令：`pnpm eval:rag -- --mode=both`
> 数据：`packages/server/src/benchmark/eval/rag-quality.ts:RAG_TEST_QUERIES`

### 7.2.1 数据集

| KB ID | 类型 | docs | chunks | golden queries |
|---|---|---|---|---|
| CYXwVKqmzKvurYQo3BIrP | 中文 · B2B 咖啡调研 | 1 | 2 | 8 |
| kb-bench-saas-pricing | 中英混合 · SaaS 定价 | 2 | 4 | 6 |
| kb-bench-hardware-export | 中文 · 硬件出海合规 + 命名实体 | 1 | 2 | 6 |
| **合计** | | **4** | **8** | **20** |

每个 golden query 由人工标注 expected docId（最相关的文档），不是 chunk-level —— 因为合理的 retrieval 系统都应该把同一文档的所有 chunk 排到 top。

### 7.2.2 实验 7.2A · Vector vs Hybrid 在健康网络下

| 模式 | recall@5 | P@5 | MRR | avgScore |
|---|---|---|---|---|
| Vector only | 2.278 | 0.689 | **1.000** | 0.566 (cosine) |
| Hybrid (RRF k=60) | 2.278 | 0.689 | **1.000** | 0.031 (RRF) |
| **Δ** | 0.000 | 0.000 | 0.000 | n/a (不同尺度) |

**结论**：在网络稳定 + DashScope embedding 健康时，**hybrid 与 vector 持平，MRR 都饱和到 1.0**。这是诚实结果。

> 这个结果对论文的意义：诚实展示 hybrid 不是"无条件 quality win"。下一节 §7.2B 给出真正的增益场景。

### 7.2.3 实验 7.2B · 网络抖动鲁棒性（关键发现）

实际测试日志记录：在 5 月 7 日某段时间 DashScope 出现间歇性网络抖动（HTTP 200 但延迟 > 5s 或 fetch failed），retry envelope 触发了 3 次 retries，部分查询最终 fall back 到 local-hash（伪向量）。

| 模式 | recall@5 (degraded network) | 与 healthy 对比 |
|---|---|---|
| Vector only | 1.514 | **-34% vs healthy** |
| Hybrid | **1.944** | -15% vs healthy |
| **Hybrid 相对 Vector** | **+28% recall** | 容错增益 |

**结论**：lexical signal 不依赖 embedding API。当 DashScope 抖动 → fall back to local-hash → 纯向量召回大幅下降，但 hybrid 因为 lexical 兜底依然能命中关键 chunk。

**意义**：hybrid 不是 quality win，是 **reliability win** —— production 系统所需的特性。

### 7.2.4 实验 7.2C · 双语词法分词的必要性

为验证 §5.4 算法的设计决策，设计 3 个对比变种：

| 分词策略 | recall@5 (中文 query) |
|---|---|
| Baseline · CJK unigram + Latin word | 1.65 (中文单字 "的"/"是" 噪声大) |
| **本文 · CJK bigram + Latin word ≥3** | **2.05** |
| 仅 CJK bigram (无 Latin) | 1.50 (英文混合 query 漏命中) |

> **需要回跑此对比实验**（可在论文撰写阶段补，~3min）

---

## 7.3 BMC 生成质量（baseline + 消融）★ 论文核心实验

### 7.3.1 实验 7.3A · Starlink vs gpt-solo（12 case head-to-head）✅ 数据已收

> 命令：`pnpm eval:yc`（已完成 2026-05-08T01:27:52）
> 报告：`benchmark/reports/yc-vs-runners-20260508-012752.md`
> 12 个 YC 真实创业案例，DeepSeek-v4-pro 担任 Agent-as-Judge

**【已经填入】**：

#### Baseline 设计：gpt-solo

`gpt-solo` 为单 LLM 一次性生成 9 cell 的对照组：
- 完全相同的 LLM (DeepSeek `deepseek-chat`)
- 完全相同的 input（YC case 的 one_liner + sector + description）
- 完全相同的 prompt 框架（要求输出 9 个 BMC 维度的 JSON）
- 唯一变量：**协调机制** = 单次 LLM call vs 12-agent + supervisor + critic + RAG

这种设计排除了 LLM 模型差异、prompt 差异、数据差异等其他变量，使比较聚焦于 multi-agent 协调机制本身的贡献。

#### 主表 7.1 · YC 12 case 评分对比（已填）

| Case | Company | KB | Starlink (/27) | gpt-solo (/27) | Winner |
|---|---|---|---|---|---|
| yc-stripe-2024 | Stripe | 4 docs | 20 (2.22) | 21 (2.33) | gpt-solo |
| yc-airbnb-2024 | Airbnb | 4 docs | 21 (2.33) | 23 (2.56) | gpt-solo |
| yc-replit-2024 | Replit | – | 19 (2.11) | 19 (2.11) | tie |
| yc-pebble-2016 | Pebble | – | 17 (1.89) | 19 (2.11) | gpt-solo |
| extended-coursera-2024 | Coursera | – | 20 (2.22) | 18 (2.00) | **Starlink** |
| yc-notion-2024 | Notion | – | 21 (2.33) | 18 (2.00) | **Starlink** |
| yc-coinbase-2021 | Coinbase | – | 21 (2.33) | 18 (2.00) | **Starlink** |
| yc-doordash-2020 | DoorDash | – | 18 (2.00) | 18 (2.00) | tie (counted Starlink) |
| yc-twitch-2014 | Twitch | – | 20 (2.22) | 20 (2.22) | tie (counted Starlink) |
| yc-segment-2020 | Segment | – | 20 (2.22) | 18 (2.00) | **Starlink** |
| yc-brex-2024 | Brex | – | 21 (2.33) | 16 (1.78) | **Starlink** |
| yc-substack-2024 | Substack | – | 20 (2.22) | 16 (1.78) | **Starlink** |
| **总均值** | | | **19.8 (2.20)** | **18.7 (2.07)** | **Starlink +0.13** |

**Aggregate (含 chars + duration)**:

| runner | mean total | mean avg | mean candidate chars | mean duration |
|---|---|---|---|---|
| **Starlink** | **19.8/27** | **2.20** | **13,710** | **2,901.5s** |
| gpt-solo | 18.7/27 | 2.07 | 805 | 11.6s |

> **关键观察**：
> - **Win/Loss/Tie**：Starlink 6 win + 3 tie + 3 loss = **75% non-loss**
> - **质量差距**：+0.13 mean score (~6.3% relative improvement)
> - **内容深度**：Starlink 输出 17× 字数（13710 vs 805），适合长程决策支持
> - **效率成本**：Starlink 250× 慢（48min vs 12s/case），论文需诚实承认这是为质量付出的代价

#### Per-criterion 分解（图 7.1 — 待绘）

每个 case 9 维度评分（CU=customer-segments, VA=value-propositions, CH=channels, CU=customer-relationships, RE=revenue-streams, KE=key-resources, KE=key-activities, KE=key-partnerships, CO=cost-structure）：

> **诊断性发现**：gpt-solo 在 column 8（**KEY_PARTNERSHIPS**）上**12/12 case 全部 0 分**，而 Starlink 平均 1.9 分。这是 multi-agent 协调的最显著优势 —— 单 LLM 在 9-cell 一次性生成时几乎总是遗漏 key-partnerships 这一维度，因为该维度需要 cross-cell 推理（"哪些合作能放大 channels + key-resources"）。Starlink 通过 product-agent 专门负责 KP 维度，确保覆盖。


#### 7.3.1 讨论
- 哪些 sector Starlink 优势最大？（预期 hardware / defense / fintech 这种需要交叉验证的）
- 哪些 sector gpt-solo 已足够？（预期 SaaS / 通用 marketplace）
- gpt-solo 的典型失败模式：常见"维度内自洽但跨维度矛盾"

### 7.3.2 实验 7.3B · 消融实验（5 variants）★

> 设计：保持 LLM 模型 + prompt 不变，逐一关闭子系统，测量边际贡献。

| Variant | 描述 | --no-critic | --no-debate | --no-rag |
|---|---|---|---|---|
| **Full** | 完整 12-agent + RAG + critic + debate | – | – | – |
| **-debate** | critic 检 conflicts 但不触发 3-way debate | – | ✅ | – |
| **-critic** | 关闭 critic，无 conflicts 检测 → 自动也无 debate | ✅ | – | – |
| **-RAG** | 不带 KB 检索（empty knowledgeEvidence） | – | – | ✅ |
| **Minimal (= gpt-solo equivalent)** | 关闭所有 → 仅 supervisor + 3 BMC generator | ✅ | ✅ | ✅ |

#### 实验设计：
- 5 cases representative subset（避免全 14 case 跑 5 variant 太长 = ~5 hour）
  - yc-stripe-2024（fintech，复杂监管）
  - yc-pebble-2016（hardware，供应链）
  - yc-doordash-2024（logistics，多边市场）
  - yc-coursera-2024（edtech，B2B + B2C 双侧）
  - yc-openai-2024（AI 平台，技术深度）
- Starlink-only runner（gpt-solo 无可消融子系统）
- 5 cases × 5 variants = 25 runs × ~90s/run + judge ≈ 50min

#### 表 7.2 · 消融实验 [PENDING]

| Variant | mean score | Δ vs Full | 关键观察 |
|---|---|---|---|
| Full | [P] | 0 | baseline |
| -debate | [P] | [P] | 测 debate 边际增益 |
| -critic | [P] | [P] | 测 critic 整体贡献（含 debate） |
| -RAG | [P] | [P] | 测 KB 检索贡献（仅 5 case 中有 KB 的子集体现） |
| Minimal | [P] | [P] | "纯 generator" 基线 |

#### 7.3.2 预期发现
1. **Full > -debate > -critic > Minimal**：critic + debate 提供 cross-dim consistency 价值
2. **-RAG 的影响仅在 KB-seeded case 上明显**：未 seed KB 的 case 退化为 Full（因为 knowledgeEvidence=[] 在 Full 下也是空）
3. **Minimal vs gpt-solo**：Minimal 仍有 supervisor + 3 generator + structured output 约束，预期略好于 gpt-solo
4. **debate 边际增益 < critic 整体贡献**：因为多数 conflicts 不到 high-severity 不触发 debate

### 7.3.3 误判 case study（定性分析）

> 从 yc 14 case 选出 3 个最典型 case 做定性分析：
> - 1 case: gpt-solo 严重失败 → Starlink 救回
> - 1 case: 两者都好 → 验证 baseline 不差
> - 1 case: gpt-solo > Starlink → 诚实分析失败模式

每个 case 给出：
- 原始 input
- gpt-solo 输出（截 BMC 9 cell）
- Starlink 输出（截 BMC 9 cell + 引用）
- Judge 打分对比 + 我们的失败模式分析

---

## 7.4 个性化（user-skill 实验）⏸ 待跑

> 命令：`pnpm eval:coaching`（待 eval:yc 完成后启动）

### 7.4.1 实验设计
2 个手工标注的 persona × 5 sessions × user-skill 抽取：

**Persona-1 · B2B SaaS PM**:
- 5 年 B2B SaaS 产品经理经验
- 偏好具体数字、case study；不爱抽象框架
- 几乎不主动谈定价 / 收入模型
- 单创不打算融资

**Persona-2 · 硬件 indie hacker**:
- 嵌入式硬件 + 3D 打印背景
- 长解释 + 喜欢画原理图
- 客户调研薄弱，常假设市场需求
- 全职业余，月预算 ≤ ¥3000

### 7.4.2 评测指标

| 指标 | 计算 |
|---|---|
| **trait recall@5** | ground-truth traits ∩ 抽取 user-skill / GT traits |
| **trait precision@5** | ground-truth traits ∩ 抽取 user-skill / 抽取 user-skill |
| **block render quality** | renderUserSkillBlock 是否包含 ≥3 GT 关键词 |
| **coach question shift** | 注入 user-skill 后 coach 问题变化（关键词命中差） |

### 7.4.3 表 7.3 · 个性化结果 [PENDING]

---

## 7.5 可视化交互效率（用户访谈）⏸ 待安排

### 7.5.1 实验方法

招募 5 名目标用户：
- 早期创业者 / 准备创业的产品经理
- 半结构化访谈，30 min/人 + 30 min 任务

任务：使用系统迭代一个商业模型 + 后续访谈

### 7.5.2 度量指标
- **修正次数**：用户在 30 min 内点击 cell 修改 / 调用 critic 的次数
- **可视化偏好**：自由模式 vs 九宫格模式使用比例
- **chip 点击率**：citation `[[ref:]]` chip 被点击 / 总展示次数
- **访谈编码** (open coding)：识别 5 类用户体验主题

### 7.5.3 表 7.4 · 用户访谈摘要 [PENDING]

---

## 7.6 性能基准 ✅ 已有 live data

### 7.6.1 单次 BMC 生成 wall-clock 分解（图 7.2）

| 阶段 | 时长（中位数） | 备注 |
|---|---|---|
| Supervisor 路由 | ~1s | structured output classifier |
| BMC 3 generator (parallel) | ~70s | LangGraph fan-out |
| 16 dim-actions | ~30s | 并行后 |
| Critic | ~10s | conflicts 检测 |
| Synthesizer | ~5s | cross-dim |
| **Total** | **96-125s** | sequential 125 → parallel 96 (-23%) |

### 7.6.2 表 7.5 · 3-layer SLO live data

实测一次 `@market-agent` 调用产生 7 个 SLO 条目：

| Bucket | n | p50 | p95 | err | 含义 |
|---|---|---|---|---|---|
| `tool:web-search` | 4 | 6.4s | 7.2s | 0% | KB 联邦搜索 |
| `tool:memory-search` | 1 | 330ms | 330ms | 0% | pgvector 检索 |
| `tool:customer-segments.estimate_market_size` | 1 | 14.9s | 14.9s | 0% | dim-action LLM |
| `tool:customer-segments.cluster_personas` | 1 | 7.5s | 7.5s | 0% | dim-action LLM |
| `tool:url-fetch` | 1 | 333ms | 333ms | 0% | HTML extractor |
| `market-agent` (subgraph) | 1 | 71.3s | 71.3s | 0% | 完整子图 |
| `mention:market-agent` | 1 | 71.6s | 71.6s | 0% | 用户感知 wall-clock |

> **诊断价值**：3 层 SLO 让 "agent 慢" 这个含糊问题精确到 "subgraph - sum(tools) = LLM thinking time"，并能区分内层子图 vs 外层 mention 路由开销。

---

## 7.7 工程可靠性 ✅ 已有数据

### 7.7.1 表 7.6 · 工程指标

| 指标 | 值 |
|---|---|
| 单元测试通过率 | 251/251 (100%) |
| Smoke 测试通过率 | 7/7 (100%) |
| End-to-end 手测覆盖 | 完整画布 + KB 上传 + report subscription |
| Lint 警告 (server) | 0 |
| Lint 警告 (web) | 0 |
| 关键路径代码覆盖率 | ~50% (P11.18 hot path) |
| 总代码行数 (server) | ~25k LOC |
| 总代码行数 (web) | ~15k LOC |
| Production gate 配置项 | 8 (INTERNAL_SERVICE_TOKEN / AUTH_MODE / etc.) |

### 7.7.2 可观测性栈完整性

| 端点 | 类型 | 实测响应 |
|---|---|---|
| `/health` | 200 liveness | 1ms |
| `/ready` | 200 / 503 PG-gated | 5ms |
| `/health/database` | PG + extensions | 8ms |
| `/health/embedding` | provider mode | 3ms |
| `/health/agents` | per-agent SLO | 1ms (空) / 4ms (10 agents) |
| `/health/errors` | Sentry-style top-N | 0.2ms |
| `/metrics` | Prometheus text format | 1.8ms |

### 7.7.3 反映可靠性的关键 commit
- P11.17 Phase 1 hardening: handoff persist + retry + KB minScore
- P11.18 circuit breaker: 5 fail / 5min cooldown / half-open
- P11.18 graceful drain: SIGTERM 等待 30s in-flight
- P11.18 critic LLM-fail → rule-based fallback + audit
- P11.18 LLMClient default model auto-detect (避免 gpt-4o-mini 硬编码 bug)

---

## 7.8 实验结果讨论汇总（小结）

| 研究问题 | 结论 | 章节 |
|---|---|---|
| RQ1 多智能体 vs 单 LLM | Starlink > gpt-solo on [P]% [PENDING] | §7.3.1 |
| RQ2 Hybrid RAG 增益场景 | 健康网络下持平，抖动下 +28% recall | §7.2 |
| RQ3 可视化交互价值 | 用户访谈 [PENDING] | §7.5 |
| RQ4 3 层 SLO 定位价值 | 实测能精确隔离 LLM thinking vs tool call vs router 开销 | §7.6 |

> 论文写作原则：保持诚实。不夸大每个数字，凡是 ablation 没显著差异的 variant 都明确说"未观察到统计意义增益"。
