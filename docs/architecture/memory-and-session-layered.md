# Memory + Session 层化架构 · 2026-05-09

> **STATUS · P14 已完成 ship（10 commits, 35a2656 → 00ba5f2）**
>
> 范围：Starlink 后端的「记忆 + 会话」基础设施。
>
> 本文档既是设计稿也是当前实现的事实文档——所有 5 层 × CCRF 4 阶段
> + facet/category 三轴 + conversations/runs 拆表 + 5 个 service +
> LLM 蒸馏 都已 ship。下方 §一-§六 是当时的设计与 audit；§十、§十一 是
> P14 完成后的最终架构 + 文件映射表（论文直接抽用）。

---

## 十、最终架构（P14 完成后状态）· 论文可抽图

### 10.1 5 层模型

```
┌────────────────────────────────────────────────────────────────────────┐
│ L4 · Global       全用户共享          kb_chunks                         │
│                   ∞ TTL              （独立表，KB ingestion 写）          │
├────────────────────────────────────────────────────────────────────────┤
│ L3 · User         一个用户跨 ws       memory_items WHERE layer='user'   │
│                   ∞ TTL              （user-skill / user-preference /   │
│                                       user-constraint）                   │
├────────────────────────────────────────────────────────────────────────┤
│ L2 · Workspace    一个 idea          memory_items WHERE layer='workspace'│
│                   90d TTL            + canvas_graphs                     │
│                                      （bmc-summary / canvas-snapshot /   │
│                                       decision / workspace-fact）         │
├────────────────────────────────────────────────────────────────────────┤
│ L1 · Session      一次 conversation   conversation_messages（raw chat） │
│                   30d TTL            + memory_items WHERE layer='session'│
├────────────────────────────────────────────────────────────────────────┤
│ L0 · Working      当前 stream         BusinessState (in-mem only)        │
│                   stream 结束即丢     LangGraph checkpoints (HITL only)  │
└────────────────────────────────────────────────────────────────────────┘
```

### 10.2 Schema 三轴（替代旧 7 kinds × 3 scopes 死格矩阵）

```
memory_items.layer      ∈ {session, workspace, user, global}
memory_items.facet      ∈ {episodic, semantic, procedural}
memory_items.category   ∈ {bmc-summary, canvas-snapshot, decision,
                            user-skill, user-preference, user-constraint,
                            workspace-fact, chat-message, ...}
```

例：
- BMC stream summary：`(workspace, episodic, bmc-summary)`
- 用户 5 年 PM 经验：`(user, semantic, user-skill)`
- LLM 蒸馏的 chat 回顾：`(workspace, episodic, bmc-summary, tags=[chat-history])`
- Raw chat turn：`(session, episodic, chat-message)` — 走 conversation_messages 表，不向量化

旧 `kind` / `scope` 列保留 6 个月作 deprecation 兜底。

### 10.3 CCRF 4 阶段 + 5 个 service

```
[1] CAPTURE      MemoryCaptureService.capture()
                 ├─ appendChatMessage          (L1 raw)
                 ├─ captureBmcSummary          (L2 episodic)
                 ├─ captureUserSkill           (L3 semantic, encrypted)
                 └─ captureConversationOutcome (L2 canvas + decision)
                 Invariants: dedup by sourceTraceId / lazy embedding /
                             layer-required field validation

[2] CONSOLIDATE  MemoryConsolidator.consolidate*()
                 ├─ consolidateRunEnd
                 │   ├─ user-skill extract     (L1 → L3)
                 │   └─ ChatHistoryDistiller   (LLM L1 → L2，3+ user turns)
                 ├─ consolidateUserPatterns   (admin refresh, force)
                 ├─ consolidateCrossWorkspace (L2 → L3 promotion)
                 └─ decayStaleSemantic        (cron, confidence × 0.95)

[3] RETRIEVE     MemoryRetrievalService.retrieve(query): RankedMemory[]
                 salience(item, query) = 0.40·cosine(emb)
                                       + 0.20·recency_decay(last_used)
                                       + 0.20·importance
                                       + 0.20·confidence
                 recency_decay = exp(-days / TAU)
                 TAU: session=1, workspace=14, user=90, global=∞
                 (no query → 0.40 redistributes uniformly to 0.333 each)

[4] FORGET       MemoryReaper.reap()
                 Layer-specific TTL archive (archived_at = now()):
                   session   = 30d  (raw chat)
                   workspace = 90d  (episodic only; semantic untouched)
                   user      = ∞
                 CLI: pnpm --filter @starlink/server memory:reap
```

### 10.4 Session 三层拆分（P3 完成）

```
Conversation                         (long-lived: 用户在画布的"在线时间")
├── conversations 表
├── id, workspace_id, user_id, status (open/closed)
├── current_run_id ──────┐
└── 包含 N 个 Run        │
                         ▼
                    Run                  (30-90s: 一次 LangGraph stream)
                    ├── runs 表
                    ├── status (queued/streaming/waiting-hitl/
                    │           completed/failed/cancelled)
                    ├── langgraph_thread_id, latest_question,
                    │   context_snapshot, heartbeat_at, owner_pid,
                    │   hitl_directive, failure_reason
                    └── 可选 Wizard
                                         ▼
                                    Wizard                  (7 步引导)
                                    └── runs.metadata.wizard
                                        { stepIndex, history, prefill }
```

旧 `conversation_sessions` 已 DROP（migration 018），三层语义彻底拆开。

### 10.5 关键不变量（论文 §3 直接引用）

```
recency_decay(t, now) = exp(-(now - t) / TAU)

TAU(layer) = {
  session:    1   day
  workspace:  14  days
  user:       90  days
  global:     ∞   (constant 1)
}

salience(item, query) = 0.40 · cosine(item.embedding, query.embedding)
                      + 0.20 · recency_decay(item.last_used_at)
                      + 0.20 · item.importance
                      + 0.20 · item.confidence

When queryText is empty:
  cosine_weight = 0
  remaining 3 weights normalize to 0.333 each (sum = 1)
```

---

## 十一、文件映射

| 角色 | 文件 |
|---|---|
| **Schema** | `packages/shared/src/schemas/memory.ts` |
| **Migration P1** | `packages/server/migrations/016_memory_facet_category.sql` |
| **Migration P3** | `packages/server/migrations/017_conversations_runs_split.sql` |
| **Migration drop** | `packages/server/migrations/018_drop_conversation_sessions.sql` |
| **底层 store** | `packages/server/src/application/conversation-memory-store.ts` |
| **Capture** | `packages/server/src/application/memory-capture.ts` |
| **Retrieve** | `packages/server/src/application/memory-retrieval.ts` |
| **Consolidate** | `packages/server/src/application/memory-consolidator.ts` |
| **Distill** | `packages/server/src/application/chat-history-distiller.ts` |
| **Reaper** | `packages/server/src/application/memory-reaper.ts` |
| **Reaper CLI** | `packages/server/src/scripts/memory-reap.ts` |
| **Singletons** | `packages/server/src/context/index.ts`（sharedMemory* exports） |
| **User-skill 老服务（被 Consolidator 包装）** | `packages/server/src/services/user-skill-extractor.ts` `services/user-skill-consolidator.ts` |
| **加密** | `packages/server/src/services/user-skill-crypto.ts` |

业务代码（business-langgraph / mention-router / resolvers）只引 4 个 singleton service，不再直接动 SQL。

---

## ⏬ 历史归档（P14 实施前的 audit + plan）

> 以下 §一-§九 是 2026-05-09 P14 实施前的事实层 audit 与 7-phase plan。
> 实施后所有 phase 均已 ship；保留作为对照。

---

## 一、当前 inventory（事实层）

### 1.1 持久化表（PostgreSQL）

| 表 | 行义 | 关键字段 | 写入者 | 读取者 |
|---|---|---|---|---|
| `conversation_sessions` | 一次完整聊天会话（含多次 stream 运行） | id (= conversationId), workspace_id, user_id, status, latest_question, context_snapshot, heartbeat_at, owner_pid, hitl_directive | conversation-store.startConversation / continueConversation | conversation-store, reattach 流程 |
| `conversation_messages` | 用户/agent 单条消息 | id, conversation_id, role (user\|assistant\|system\|tool), content, metadata | conversation-memory-store.appendMessage | listMessages, exportUserData |
| `memory_items` | 跨会话/跨用户语义记忆，向量化 | id, workspace_id, user_id, scope, kind, title, content, embedding, importance, confidence, tags, source_type, source_id, last_used_at, archived_at | upsertMemory / store.record / user-skill-extractor / user-skill-consolidator | searchMemories / searchUserSkills / listUserSummaries / buildKnowledgePrompt 等 ≥6 种读路径 |
| `kb_chunks` | 知识库切块 + 向量 | id, kb_id, doc_id, chunk_index, content, embedding | kb ingestion pipeline | RAG retrieval |
| `canvas_graphs` | workspace 画布快照 | workspace_id, nodes (jsonb), edges (jsonb) | persistCanvasGraph | hydrateFromConversation, applyDelta |
| `langgraph_*` (3 张) | LangGraph PostgresSaver checkpoints | thread_id, checkpoint_ns, ... | LangGraph runtime | LangGraph runtime（HITL resume） |
| `kb_agent_bindings` | 知识库 ↔ agent 绑定 | kb_id, agent_id | UI mutation | RAG 路由 |

### 1.2 Schema enum（现状）

```ts
// packages/shared/src/schemas/memory.ts
memoryScopeSchema = z.enum(['workspace', 'user', 'agent'])
memoryKindSchema  = z.enum(['preference', 'decision', 'insight', 'constraint', 'summary', 'canvas', 'user-skill'])
```

**实际使用度审计**（grep 全仓库）：

| kind | scope=workspace 写入点 | scope=user 写入点 | 状态 |
|------|------------------------|-------------------|------|
| `summary` | workspace-memory-store.record | (无) | ✅ 实际使用 |
| `user-skill` | user-skill-extractor / consolidator | user-skill-extractor / consolidator | ✅ 实际使用 |
| `canvas` | captureConversationOutcome | (无) | ✅ 写入但读路径少 |
| `decision` | captureConversationOutcome | (无) | ✅ 写入但读路径少 |
| `preference` | (无) | (无) | ❌ **dead enum 值** |
| `insight` | (无) | (无) | ❌ **dead enum 值** |
| `constraint` | (无) | (无) | ❌ **dead enum 值** |
| `agent` (scope) | (无) | — | ❌ **dead enum 值** |

→ **3/7 kinds 是死代码**，1/3 scopes 是死代码。

### 1.3 读路径（已有 ≥6 个）

| API | 调用方 | 选择条件 |
|-----|--------|---------|
| `searchMemories(workspaceId, q, …)` | RAG / coach prompt | vector top-K，过 importance × cosine |
| `searchUserSkills(userId, workspaceId, q, …)` | buildUserSkillPrompt | scope=user 或 (scope=workspace AND ws=$W)，kind=user-skill |
| `listUserSummaries(userId, limit)` | user-skill-extractor 输入 | kind=summary, user_id=$U, recent N |
| `listAllUserSkillsForUser(userId)` | user-skill-consolidator | kind=user-skill, user_id=$U |
| `listMemories(workspaceId, kind?, …)` | exportUserData / debug | 简单过滤 |
| `listKnowledgeEvidenceForUser(opts)` | UI memory drawer | metadata.knowledgeEvidence not null |

→ 6 种 query API，**无统一 ranking / dedup / 节流**。每个调用方自己组合 filter+rank+limit。

### 1.4 写路径（已有 ≥4 个）

| API | 调用方 | 写哪个 kind |
|-----|--------|------------|
| `WorkspaceMemoryStore.record` | writeConversationSummary | kind=summary, scope=workspace |
| `ConversationMemoryStore.upsertMemory` | user-skill-extractor / consolidator | kind=user-skill, scope=user 或 workspace |
| `captureConversationOutcome` | persistConversationCompletion | kind=canvas + kind=decision (1-2 行 / 次) |
| `ConversationMemoryStore.appendMessage` | conversation-store | conversation_messages 表（**不是** memory_items！） |

→ 4 种写路径，**无统一节流（dedup / 频次限制 / size cap）**。每个调用方自己保证不灌爆 DB。

### 1.5 LangGraph 复用

LangGraph 的 PostgresSaver checkpointer 写 `langgraph_*` 三张表，**完全独立于** memory_items / conversation_messages。实际是一份**第 4 套**记忆——HITL 中断点 + agent 中间状态——但前端 UI 完全不知道它存在。

---

## 二、问题陈述

| # | 现象 | 根因 |
|---|------|------|
| 1 | 7 kinds × 3 scopes 矩阵中 **9 格死格** | enum 设计早于实际使用，未清理 |
| 2 | "summary" 既是 lifecycle phase 又是内容种类，跟 "preference" / "insight" 不同维度 | **kind 字段混用了两个正交 axis**：内容类型 (preference / insight / constraint / decision) vs 生命周期 (summary / user-skill / canvas) |
| 3 | scope=workspace 同时存放「这次 BMC 的 summary」+「跨 stream 的 user-skill 派生中间态」 | 没有 **session-level memory** 这一层；什么都丢 workspace 兜底 |
| 4 | `listUserSummaries(userId)` 期待 cross-workspace 读，但 summary 实际是 workspace-scoped 写入；用 `WHERE user_id=$U` 隐式跨 ws | scope 字段没真用，全靠 user_id+workspace_id 两个 column 间接表达层 |
| 5 | LangGraph checkpoint 是第 4 套独立 store，UI 不感知 | **HITL state 没有进 unified memory model** |
| 6 | 6 种读 API 各自 rank，没有 cache / 节流 | 没有 canonical retrieval API |
| 7 | 写路径无 dedup 节流，每会话都 embedText() 一次（昂贵） | 没有 capture-pipeline 抽象 |
| 8 | session vs conversation vs run 三个词混用 | 命名遗留；session = conversation_session row，但口语中 "session" 也指一次 BMC stream |
| 9 | `conversation_messages` 不是 memory_items，但前端 chat dock 把两者混展示 | 物理分表 vs 逻辑同一记忆视图 不对齐 |

---

## 三、提议结构：5 层 × 4 阶段

### 3.1 5 层 memory 模型

每条记忆按**作用域 + 时间尺度**归一到 5 层之一。每层有明确的 read/write API 和 TTL 政策。

```
┌─────────────────────────────────────────────────────────────────────┐
│ L0 · Working           作用域：当前 stream                            │
│    （短期工作记忆）       生命周期：stream 结束即丢                       │
│    存储：BusinessState   样例：当前 round 的 supervisorDirective /    │
│         in-memory        crossContext / pendingInterrupt              │
├─────────────────────────────────────────────────────────────────────┤
│ L1 · Session           作用域：一次 conversation_session             │
│    （会话记忆）           生命周期：session 完成 / 失败后 archive       │
│    存储：conversation_   样例：聊天消息、本轮 BMC 草稿、本轮 critic 冲突 │
│         messages,        持久化：是                                    │
│         conversation_                                                 │
│         sessions                                                      │
├─────────────────────────────────────────────────────────────────────┤
│ L2 · Workspace          作用域：一个 idea / workspace                │
│    （工作空间记忆）        生命周期：workspace 存在期间                  │
│    存储：memory_items   样例：BMC summary（kind=summary）、画布快照  │
│         scope=workspace,  （kind=canvas）、本 workspace 的所有 cite      │
│         canvas_graphs    持久化：是 + 向量化                          │
├─────────────────────────────────────────────────────────────────────┤
│ L3 · User               作用域：一个用户跨所有 workspace              │
│    （用户长期画像）        生命周期：永久（除非用户删除账号）              │
│    存储：memory_items   样例：user-skill（领域、风格、盲点、约束）    │
│         scope=user        持久化：是 + 向量化 + 加密                    │
├─────────────────────────────────────────────────────────────────────┤
│ L4 · Global             作用域：所有用户共享                          │
│    （全局知识）            生命周期：随 KB 文档生命周期                  │
│    存储：kb_chunks      样例：上传的 PDF、URL fetch、API connector  │
│         （独立表）          持久化：是 + 向量化                         │
└─────────────────────────────────────────────────────────────────────┘
```

**层间不互通**——L3 不能直接读 L4，必须经过 L2 mid-tier「检索时 join」。

### 3.2 4 阶段生命周期

每条记忆经历 4 阶段，每阶段对应一个 service：

```
[1] CAPTURE                                 ← 写入新记忆
        ▼
[2] CONSOLIDATE  (decay / merge / promote)  ← 衍生：弱化、合并、跨层升级
        ▼
[3] RETRIEVE     (rank / dedup / cap)       ← 读取并注入 prompt
        ▼
[4] FORGET       (TTL / archive)            ← 显式遗忘
```

**Capture-Consolidate-Retrieve-Forget** 缩写 **CCRF**，对应 4 个 service：

| 阶段 | 现有代码 | 推荐 canonical class |
|------|---------|---------------------|
| Capture | `WorkspaceMemoryStore.record` / `upsertMemory` / `appendMessage` 散乱 | **`MemoryCaptureService`** （统一节流 + dedup + embed） |
| Consolidate | `UserSkillExtractor` (L1→L3 升级) + `UserSkillConsolidator` (L2→L3 升级) | **`MemoryConsolidator`** （增加 L1→L2 BMC summary 升级、L2→L3 conflict-pattern 升级） |
| Retrieve | 6 种 search/list API 各自实现 | **`MemoryRetrievalService`** （统一 rank fn = importance × cosine × recency × confidence） |
| Forget | 仅有 `archiveMemory` 单个 by-id；无 TTL | **`MemoryReaper`** （per-layer TTL: L1 30d, L2 90d, L3 ∞, L4 by KB） |

### 3.3 命名 axis 拆分

把 `kind` 字段拆成两列：

```sql
-- BEFORE (现状)
memory_items: kind TEXT  -- 7 values 混杂

-- AFTER
memory_items: 
  facet TEXT,         -- 内容类型: episodic | semantic | procedural
  category TEXT       -- lifecycle: summary | user-skill | canvas-snapshot | decision
```

`facet` 三类（认知科学常规）：
- **episodic** — 一次具体经历（一次会话总结、一次冲突、一次决策）
- **semantic** — 抽象的事实/技能（user-skill、领域经验、约束）
- **procedural** — 怎么做（工作流模板，用户操作偏好）—— **当前未使用，留空**

`category` 是 facet 内的细分（业务术语）：

| facet | category | scope | 例子 |
|-------|----------|-------|------|
| episodic | bmc-summary | workspace | "本轮 BMC 跑完，9 cell 中 3 个 critic 标了 high-severity 冲突" |
| episodic | conflict | workspace | "key-resources ↔ revenue-streams 冲突，agent 投票 4:1" |
| episodic | decision | workspace | "用户最终接受了 auto-revise 路径" |
| semantic | user-skill | user | "用户是 5 年 B2B 数据工具背景，不爱讨论定价" |
| semantic | user-preference | user | "用户喜欢用表格 + 数字而非段落" |
| semantic | workspace-fact | workspace | "本 idea 是 to-B 数据中台，目标客户北美 SMB" |
| canvas | snapshot | workspace | (单独 kind 因为是 jsonb 结构化数据，独立表 canvas_graphs) |

死掉的 enum 值（`preference` / `insight` / `constraint`）→ 合并入 semantic.user-preference / semantic.workspace-fact 等。

---

## 四、Session 层面细化

### 4.1 三个混用的"session"概念

| 概念 | 真实含义 | 数据模型 | 生命周期 |
|------|---------|---------|---------|
| **conversation_session** | 一次完整对话（用户 → AI 来回多轮） | conversation_sessions row | 用户进画布 → 退出 / 切换 ws |
| **stream run** | 一次 LangGraph 流式 BMC 调用 | LangGraph thread_id（langgraph_checkpoints） | 30-90s，单次 streamConversation |
| **wizard session** | 一次 7 步引导 | comfy-store WizardChatState | 7 个用户回合 |

**当前混用导致的 bug**：
- `cancelActiveSession` 同时 cancel stream run + 关闭 conversation_session → 用户其实只是想停 stream
- `reattachToActiveSession` 找的是 active stream（heartbeat），但叫 session
- HITL `pendingInterrupt` 实际是 stream 级，但持久化到 conversation_session

### 4.2 提议的 3 层 session 抽象

```
Conversation
├── 一对一映射：一个用户 × 一个 workspace
├── 长期：用户进画布 → 切换 workspace 才结束
├── 持久化：conversation_sessions（重命名为 conversations）
└── 包含 N 个 Run：

    Run
    ├── 一次 LangGraph stream（startConversation / continueConversation 调用一次）
    ├── 短期：30-90s
    ├── 持久化：runs 表（新建）+ langgraph_thread_id 关联
    ├── 状态：queued / streaming / waiting-hitl / completed / failed / cancelled
    └── 包含 0-1 个 Wizard：

        Wizard 引导（独立子机制，可选）
        ├── 7 步采集
        ├── 短期：仅本次 run 的子集
        ├── 持久化：wizard_sessions 表（新建，可选）或纳入 run.metadata
        └── 完成后触发新 Run（实际 BMC pipeline）
```

→ 当前 `conversation_sessions` 一张表混了上述 3 层。建议拆成：

```sql
-- L1: 长期对话（用户在画布的"在线时间"）
CREATE TABLE conversations (
  id, workspace_id, user_id, status, opened_at, closed_at, 
  current_run_id  -- 指向最新 run
);

-- L2: 单次 LangGraph 流（30-90s）
CREATE TABLE runs (
  id, conversation_id, status, langgraph_thread_id, 
  started_at, completed_at, heartbeat_at, owner_pid,
  hitl_directive, latest_question
);

-- L3: 单次 wizard 引导（可选，可不建表只放 metadata）
-- runs.metadata.wizard = { stepIndex, history, prefill }
```

### 4.3 迁移策略

```
现状: conversation_sessions（混层）
       │
       ▼
拆分: conversations (L1) + runs (L2)
       │
       ├── 现有列下放：heartbeat_at / owner_pid / hitl_directive → runs
       └── 现有列上提：opened_at / closed_at → conversations
```

**复杂度**：1 张表 → 2 张表 + 1 个 migration，约 200 行代码改动；**收益**：避免 cancel/reattach/HITL 三个语义混淆 bug 的递归归并。

---

## 五、Canonical API 草图

不立刻实施，先把 interface 定下来：

```ts
// L0 · Working — in-memory only, BusinessState
// (no API change needed)

// L1+L2+L3 unified store
interface MemoryStore {
  // CAPTURE
  capture(input: {
    layer: 'session' | 'workspace' | 'user'
    facet: 'episodic' | 'semantic'
    category: string  // 'bmc-summary' | 'user-skill' | ...
    workspaceId?: string  // required for layer=session/workspace
    userId?: string       // required for layer=user
    sessionId?: string    // required for layer=session
    title: string
    content: string
    importance?: number   // [0,1]
    confidence?: number   // [0,1]
    tags?: string[]
    sourceTraceId?: string  // dedup key
    metadata?: Record<string, unknown>
  }): Promise<MemoryItem>

  // RETRIEVE — single canonical rank fn
  retrieve(query: {
    layers: Array<'session' | 'workspace' | 'user' | 'global'>
    workspaceId?: string
    userId?: string
    sessionId?: string
    queryText?: string  // for vector search
    facets?: Array<'episodic' | 'semantic'>
    categories?: string[]
    topK?: number
    rankBy?: 'salience' | 'recency'  // default salience
  }): Promise<RetrievedMemory[]>
  // RetrievedMemory adds: score, layer, scoreBreakdown

  // CONSOLIDATE — periodic / event-triggered
  consolidate(trigger: {
    kind: 'session-end' | 'workspace-checkpoint' | 'cross-workspace-promote'
    sessionId?: string
    workspaceId?: string
    userId?: string
  }): Promise<ConsolidationResult>

  // FORGET
  forget(opts:
    | { id: string; reason: string }       // explicit
    | { layer: 'session'; olderThanDays: number }  // bulk TTL
    | { workspaceId: string }              // workspace deletion
  ): Promise<{ archivedCount: number }>
}
```

### 5.1 retrieve() 内部 rank fn

```ts
score = (
  cosine(query, item)        * w_semantic    // 0.4
  + recency(item.last_used)  * w_recency     // 0.2
  + item.importance          * w_importance  // 0.2
  + item.confidence          * w_confidence  // 0.2
)
```

---

## 六、增量实施 plan（不立即做，留作后续）

| Phase | 范围 | 风险 | 估时 |
|-------|------|------|------|
| **P1: 命名规整** | 给 memory_items 加 `facet` / `category` 列（与 `kind` 共存）；新代码用新列；旧代码兼容 read | 低 | 1d |
| **P2: 死 enum 清理** | 删 `preference` / `insight` / `constraint` / `agent` （先 grep 0 引用） | 低 | 0.5d |
| **P3: MemoryCaptureService 统一** | 抽 `record / upsertMemory / appendMessage` 三入口为单一 API；加 dedup throttle | 中 | 2d |
| **P4: MemoryRetrievalService 统一** | 6 种 search/list 合并为 1 个；rank fn 抽出 | 中 | 2d |
| **P5: conversations + runs 拆表** | 1 张表 → 2 张表，迁移现有数据 | 高（破坏 reattach / HITL）| 3d |
| **P6: MemoryConsolidator** | session-end / workspace-checkpoint / cross-workspace 3 种 trigger 入口；user-skill 已有，加 BMC summary L1→L2 / pattern L2→L3 | 中 | 2d |
| **P7: MemoryReaper** | TTL 表驱动；ops 脚本跑 cleanup | 低 | 1d |

总：~12d。每 phase 独立 ship。

### 6.1 优先级建议

如果只做 1 个：**P1（命名规整）**——为后续打基础，风险低。

如果做 3 个：**P1 + P2 + P3**——把"写"侧的混乱收掉。

如果做 5 个：**P1 + P2 + P3 + P4 + P5**——读+写+session 全打通。这相当于"v2 内存层"。

剩下的 P6 / P7 是优化，不阻塞。

---

## 七、不会做的（明确划界）

| 项 | 原因 |
|----|------|
| 用 LLM 直接当记忆替代 PG | 成本 + 可解释性差 |
| 引入向量数据库（Pinecone / Weaviate） | pgvector 已够用 |
| 把 LangGraph checkpointer 也合并进 memory_items | LangGraph 内部用，不暴露给业务层 |
| 全自动迁移 conversation_sessions 到 conversations + runs | 太大变动；P5 单独 plan + 灰度 |
| 给 memory 加版本（git-like history） | 太复杂；archived_at 已够 |
| 跨用户共享记忆（Organization 层） | 不在毕设范围 |

---

## 八、与论文关联

毕设论文 §3 「多层记忆」目前只描述了 user-skill (L3)。补完本文档后，论文可直接抽：

- §3.1 5 层模型图（L0-L4）
- §3.2 4 阶段生命周期（CCRF）
- §3.3 facet × category 二维分类
- §3.4 与 ACT-R / SOAR 等认知架构对比表（可选 follow-up）

---

## 九、Open question

1. **是否要把 `conversation_messages` 也纳入 L1 memory 模型？** 当前是独立表，但语义就是 L1 episodic。若纳入则统一了 chat 视图与 memory 视图。
2. **L0 working memory 是否应有持久化备份？** 当前完全 in-memory；进程崩溃就丢。LangGraph checkpoint 部分弥补，但仅 HITL 路径走它。
3. **Cross-user memory promotion**？例如发现"to-B SaaS 创业者普遍不讨论 churn"——这是 L4 semantic 知识，但来源是多个 L3。当前不做。
4. **加密**？user-skill (L3) 涉及个人画像，论文 §安全章节可写「列级加密 follow-up」。

---

## 附：代码文件 → 层映射

| 文件 | 当前职责 | 应属层 | Phase |
|------|---------|--------|-------|
| `packages/server/src/application/conversation-memory-store.ts` | 4 件事（session / message / memory / user-skill） | 拆为 4 个 service：SessionStore / MessageStore / MemoryCapture / MemoryRetrieve | P3+P4+P5 |
| `packages/server/src/infrastructure/memory/workspace-memory-store.ts` | L2 capture（kind=summary） | merge 进 MemoryCaptureService | P3 |
| `packages/server/src/services/user-skill-extractor.ts` | L1→L3 promotion | merge 进 MemoryConsolidator | P6 |
| `packages/server/src/services/user-skill-consolidator.ts` | L2→L3 promotion | merge 进 MemoryConsolidator | P6 |
| `packages/server/src/application/conversation-store.ts` | session 主流程（含 stream） | 拆 session 启停 + run 启停 | P5 |
| `packages/server/src/services/business-langgraph.ts` | L0 working state + 主流程 | 通过 retrieve() 拿 L1-L4 注入 prompt | P4 |
