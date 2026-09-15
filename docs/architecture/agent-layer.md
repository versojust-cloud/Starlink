# Agent 层架构 · 2026-05-09

> 与 `memory-and-session-layered.md`（数据层）配套的「12-agent 协作层」事实文档。
> P14 完成 + agent layer audit（2026-04-26 → 2026-05-09 完整修复）后的最终状态。
> **P15 (2026-05-09 续) ship 完毕**：BusinessLangGraphService 拆为 6 service +
> mention-router 抽出 KB-binding helper + 16 个新 service 单测 + 全量测试 310/310。

---

## 0. P15 拆分后服务地图（最重要的论文图）

```
                   ┌─────────────────────────────────────────────────────┐
                   │              BusinessLangGraphService               │
                   │              (orchestrator facade · 3500 → ~3000)   │
                   │                                                       │
                   │  createGraph + run* node bodies + thin facades       │
                   └──────┬───┬───┬───┬───┬───┬───────────────────────────┘
                          │   │   │   │   │   │
        ┌─────────────────┘   │   │   │   │   └──────────────────┐
        │                     │   │   │   │                       │
        ▼                     ▼   ▼   ▼   ▼                       ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ Stream-      │  │ Supervisor-  │  │ Generation-  │  │ Critic-      │  │ Debate-      │  │ Synthesis-   │
│ Lifecycle    │  │ Service      │  │ Service      │  │ Service      │  │ Service      │  │ Service      │
│ ────────     │  │ ────────     │  │ ────────     │  │ ────────     │  │ ────────     │  │ ────────     │
│ heartbeat    │  │ classifyIn-  │  │ distillCell  │  │ HITL set/    │  │ maybeRunDe-  │  │ buildCross-  │
│ handoff sub  │  │ tent         │  │ Summaries    │  │ consume      │  │ bates +      │  │ Context      │
│ OTel span    │  │ isAgent-     │  │ toParser-    │  │ emitGen-     │  │ budget gate  │  │ buildAgent-  │
│ businessSpan │  │ Active       │  │ Evidence     │  │ Output       │  │ + per-       │  │ Avatars      │
│ Contexts     │  │ buildCross-  │  │ applyCit-    │  │ emitAgent-   │  │ debate span  │  │ buildBMC-    │
│              │  │ ContextProm  │  │ Parsing      │  │ Degraded     │  │              │  │ Edges        │
│              │  │              │  │              │  │ emitRevReq   │  │              │  │              │
└──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘
   stream-lifecycle      supervisor-     generation-     critic-          debate-         synthesis-
                         service.ts      service.ts      service.ts       service.ts      service.ts
   ~180 LOC              ~150 LOC        ~120 LOC        ~180 LOC         ~160 LOC        ~190 LOC

         ↓ Mention path (separate file)
   ┌───────────────────────────────────────────────────────┐
   │  MentionRouter (775 → 715 LOC)                        │
   │  + mention/kb-binding-injector.ts (~100 LOC)          │
   │     handleBmcGenerator / handleAdvisor / handleUtility│
   │     handleDebateSide / handleDebateJudge / ...Report  │
   └───────────────────────────────────────────────────────┘
```

每个 service 都是 ≤ 200 LOC、单一职责、独立 unit-testable。

---

## 0.1 P15 commit chain (Sprint 1-7)

| Sprint | Commit | 内容 | 净 LOC 变化 |
|---|---|---|---|
| S1 | `c8a336d` | stream-lifecycle 抽出 + BUSINESS_STATE_CONTRACT | +528 / -65 |
| S2 | `2bcf23a` | SupervisorService（classifyIntent / isAgentActive / buildCrossContextPrompt） | +166 / -69 |
| S3 | `cf4e54d` | GenerationService（distillCellSummaries / toParserEvidence / applyCitationParsing） | +137 / -45 |
| S4 | `88ef8af` | CriticService（HITL + 3 emit helpers） | +229 / -126 |
| S5 | `29c11fc` | DebateService（maybeRunDebates） | +176 / -100 |
| S6 | `98e4d07` | SynthesisService（buildCrossContext / Avatars / BMCEdges + computeBMCEdgesForCells 移入） | +264 / -142 |
| S7 | `784491c` | mention/kb-binding-injector.ts（mention-router 解耦） | +106 / -60 |
| S8 | (本 commit) | service 单元测试 + agent-layer.md 同步 | TBD |

**总：6 个新 service 模块 + 1 个 mention helper · 16 unit tests · BLG 主类减 ~600 LOC · 测试 288 → 310（+22）**。

---

## 一、12 个 agent · 三类路径

```
┌────────────────────────────────────────────────────────────────────┐
│ A · 核心 BMC 生成（3 agent）                  ReAct + 工具          │
│   market-agent / product-agent / finance-agent                      │
│   注册：agentRegistry  · 角色：generator                             │
│   Subgraph：buildBmcGeneratorSubgraph + StateGraph.compile()        │
│   工具：knowledge-base / web-search / 各 dimension-action           │
├────────────────────────────────────────────────────────────────────┤
│ B · 跨维度服务（5 agent）                     ReAct / single-LLM    │
│   critic-agent          (审议 · advisorRegistry)                    │
│   synthesizer           (跨维度 · agentRegistry)                    │
│   general-responder     (无 BMC · agentRegistry)                    │
│   deep-research         (RAG 深研 · agentRegistry)                  │
│   report-writer         (整合报告 · agentRegistry)                  │
│   都走 invokeRegisteredAgent → compiled subgraph.invoke()           │
├────────────────────────────────────────────────────────────────────┤
│ C · Debate-only 提示词路径（4 agent）         single-LLM via       │
│   market-opponent       LlmDebateInvoker.nextTurn()                 │
│   product-opponent      LlmDebateInvoker.nextTurn()                 │
│   finance-opponent      LlmDebateInvoker.nextTurn()                 │
│   moderator             LlmDebateInvoker.judge()                    │
│   注册：advisorRegistry / agentRegistry                              │
│   Subgraph：getOrphanSubgraphStub()（不通过 subgraph 路径调用）      │
│   原因：debate 是单次结构化 LLM 调用，无 ReAct 循环、无工具        │
└────────────────────────────────────────────────────────────────────┘
```

**总计 12 agent**：8 ReAct + 4 prompt-only。8 个走 `invokeRegisteredAgent`
路径，4 个 debate 走 `LlmDebateInvoker` 直读 yaml.system_prompt。

---

## 二、两条执行路径

### 2.1 Subgraph 路径（8 agent）

```
business-langgraph.invokeRegisteredAgent(agentId, state, projectInput, projectOutput)
   │
   ├─ agentRegistry.get(agentId) ?? advisorRegistry.get(agentId)
   ├─ runtime check: subgraph.invoke is fn  (audit 2.8)
   ├─ otelTracer.startSpan('business.subagent.invoke')
   ├─ agentSloTracker mark start
   ├─ subgraph.invoke(projectInput(state, decision), { configurable: {...} })
   │     ↓ inside: ReAct loop = call-llm → tools → call-llm → parse
   ├─ projectOutput(result) → Partial<BusinessState>
   └─ emitGenerationOutput(state, agentName, validatedNodes, usage)
        → handoff log + frontend stream
```

### 2.2 Prompt-only 路径（4 agent）

```
LlmDebateInvoker.nextTurn({ speaker, addressee, priorTurns, disputedNodeIds })
   │
   ├─ getProfileFor(speaker)() → load yaml.system_prompt directly
   ├─ buildTurnPrompt(profile.system_prompt, priorTurns, ...)
   ├─ this.client.chat({ model: profile.model, messages: [...] })
   ├─ regex extract { JSON } from response
   ├─ parse → DebateTurn
   └─ on parse-fail / LLM-fail: auditLogger.warn + buildFallback(reason)
                                 (audit 2.6)

LlmDebateInvoker.judge({ moderator, turns }) — same shape, returns DebateVerdict
```

---

## 三、Audit 历史 · 9 个问题全部完成

| # | 问题 | 修复 | Commit / 位置 |
|---|---|---|---|
| 2.1 | `streamConversation` 的 `bmcNodeCount` / `conflictCount` 永远 0 | ✅ | for-await 循环里累加 |
| 2.2 | `writeConversationSummary` 仅在 try 内 yield | ✅ | P12 移到 finally + race fix |
| 2.3 | Legacy fallback 路径丢 handoff | ✅ P0.2.3 | 全部 5 个 legacy path 加 emitGenerationOutput / debate / revision-request |
| 2.4 | 4/8 agent passthrough | ⚠ 设计如此 | 4 个 debate agent 故意 prompt-only — 文档化 |
| 2.5 | OPPONENT_MAP 仅 market | ✅ | 扩展到 product + finance |
| 2.6 | LlmDebateInvoker silent fallback | ✅ | nextTurn + judge 都加 audit log |
| 2.7 | buildSubgraph 重编译 | ✅ | IIFE 闭包捕获 compiled，4 BMC + critic |
| 2.8 | invokeRegisteredAgent 类型 cast 无运行时校验 | ✅ | runtime check + 失败时 auditLogger.error + fail-fast |
| 2.9 | 论文叙事 "8 agent team" 打折 | ✅ | 本文档明确"8 ReAct + 4 prompt-only"混合架构 |

---

## 四、注册表

```
capabilities/registry.ts:
  agentRegistry    Map<string, AgentDescriptor>     8 entries
  advisorRegistry  Map<string, AdvisorDescriptor>   4 entries

agentRegistry:
  market-agent       generator  · cc-bmc · ReAct
  product-agent      generator  · cc-bmc · ReAct
  finance-agent      generator  · cc-bmc · ReAct
  synthesizer        generator  · cross-dim · single-LLM
  report-writer      generator  · long-form · single-LLM
  general-responder  generator  · no-BMC · single-LLM
  deep-research      generator  · rag-deep · ReAct
  moderator          meta       · debate · orphan-stub (prompt-only via LlmDebateInvoker.judge)

advisorRegistry:
  critic-agent       advisor   · ReAct + interrupt + relevanceScorer
  market-opponent    advisor   · orphan-stub (prompt-only via LlmDebateInvoker.nextTurn)
  product-opponent   advisor   · orphan-stub
  finance-opponent   advisor   · orphan-stub
```

每个 agent 在 `agents/<id>/graph.ts` 顶层 IIFE 里调用 `registerAgent` / `registerAdvisor` 注册自己。`OPPONENT_MAP` 把 generator → opponent 配对：

```ts
{
  'market-agent':  'market-opponent',
  'product-agent': 'product-opponent',
  'finance-agent': 'finance-opponent'
}
```

---

## 五、Capability 模型

每个 agent 在 yaml 里声明 capabilities，用于 supervisor 的 routing 决策：

```yaml
capabilities:
  - kind: generate
    scope: full-bmc           # market / product / finance
  - kind: review
    scope: structural          # critic
  - kind: synthesize
    scope: cross-dimension     # synthesizer
  - kind: reflect
    scope: single_round        # deep-research
```

`agents/shared/profile-loader.ts` 的 `profileToDescriptor` / `profileToAdvisorDescriptor` 把 yaml 转成 registry 描述符。

---

## 六、Supervisor 路由

```
business-langgraph.runSupervisor(state)
   │
   ├─ if mode='registry' && agentRegistry.has('supervisor')
   │     → registry route
   │     ├─ build CapabilityRequest from state.question + intent
   │     ├─ supervisor LLM emits RoutingDecision[] (which agents this round)
   │     └─ for each decision → invokeRegisteredAgent(agent_id, state, ...)
   │                                ↓
   │                              ReAct loop, emit nodes
   │
   └─ else (legacy mode)
         → switch on intent ∈ {generate_bmc, analyze, ...}
         → directly call runMarketAgent / runProductAgent / runFinanceAgent
            (these bypass registry, but still emit handoff via P0.2.3)
```

---

## 七、Debate 触发路径

```
runCritic (returns conflicts[]) → maybeRunDebates(state, conflicts):
   │
   for each conflict:
     ├─ relatedAgents.filter(a => OPPONENT_MAP[a]) → proponents to debate
     ├─ for each proponent in OPPONENT_MAP keys:
     │     opponentId = OPPONENT_MAP[proponent]    # 3 dimensions covered
     │     debate = runDebate(proponent, opponent, moderator):
     │        ├─ for round in 1..MAX_DEBATE_ROUNDS:
     │        │     proponentTurn = LlmDebateInvoker.nextTurn(speaker=proponent)
     │        │     opponentTurn = LlmDebateInvoker.nextTurn(speaker=opponent)
     │        │     if convergence → break
     │        └─ verdict = LlmDebateInvoker.judge(moderator, allTurns)
     ├─ apply verdict.outcome → ratify / invalidate / escalate
     └─ emit debate-turn × 2N + debate-verdict × 1 to handoff log
```

每条 debate-turn / debate-verdict 都进入 conversation_messages（P14 L1 chat-message），可被 ChatHistoryDistiller 蒸馏为 L2 summary。

---

## 八、可观测性

### 8.1 Handoff log

`infrastructure/handoff-log/index.ts` 提供 `emitGenerationOutput` / `emitRevisionRequests` / `emitDebateTurn` / `emitDebateVerdict`。每个 emit 写一条 `Handoff` 到当前 traceId 的 ring buffer，stream 完成后 release。

| 类别 | emit 函数 | 触发点 |
|---|---|---|
| generation-output | emitGenerationOutput | 8 个 ReAct agent 完成 |
| revision-request  | emitRevisionRequests | critic 输出的每个 conflict |
| debate-turn       | (inline in maybeRunDebates) | LlmDebateInvoker.nextTurn 每次 |
| debate-verdict    | (inline) | LlmDebateInvoker.judge |

P0.2.3 之前：legacy 回退路径不调任何 emit → benchmark 看到 0 handoff。修复后：legacy + registry 双路径都完整。

### 8.2 SLO 跟踪

`infrastructure/observability/agent-slo-tracker.ts` 维护每个 agent 的 (durationMs, status) ring buffer：

```
window = 30 invocations
errorRate threshold = 30%
crossing → audit emit "agent-slo.degraded" + frontend AgentHealthChip 红色
```

每次 `invokeRegisteredAgent` 在 try-finally 里 mark start/end，写入 tracker。

### 8.3 Tracing

OpenTelemetry span：每个 agent 调用产生一条 `business.subagent.invoke` span，attributes 含 `agent_id`, `round`, `trace_id`。父 span 是 `business.streamConversation`。

---

## 九、测试覆盖

| 文件 | 类型 | 覆盖 |
|---|---|---|
| `agents/agent-registry.test.ts` | 集成（IIFE 注册）| 12 agent 全部注册 + 8 compiled / 4 stub 契约 + closure cache (2.7) + OPPONENT_MAP (2.5) + role 分类 |
| `agents/critic/critic-parser.test.ts` | 单元 | LLM 输出 → CriticConflict[] 解析 |
| `agents/deep-research/registry-contract.test.ts` | 集成 | deep-research 描述符 + capability shape |
| `tools/llm-agent/domain-analyst.tool-base.test.ts` | 单元 | BMC ReAct subgraph 共用基础 |
| `tools/llm-agent/bmc-output.test.ts` | 单元 | extractAndParseJSON / validateNineBmcDimensions |
| 其它 ReAct subgraph 间接覆盖 | — | 通过 yc benchmark + smoke tests |

**总：8 + 2 + 2 + 多个间接 ≈ 12+ agent layer 专项 + 全 server 288/288 通过**。

---

## 十、文件映射

| 角色 | 文件 |
|---|---|
| **Capability 注册表** | `packages/server/src/capabilities/registry.ts` + `index.ts` |
| **Profile loader** | `packages/server/src/capabilities/profile-loader.ts` |
| **YAML loader / boot** | `packages/server/src/agents/index.ts` |
| **共享 ReAct 子图** | `packages/server/src/agents/shared/bmc-generator-subgraph.ts` |
| **Orphan 子图 stub** | `packages/server/src/agents/shared/orphan-subgraph-stub.ts` |
| **Debate 调用** | `packages/server/src/agents/shared/llm-debate-invoker.ts` |
| **Tool 注入** | `packages/server/src/agents/shared/register-helpers.ts` |
| **OPPONENT_MAP** | `packages/server/src/services/business-langgraph/constants.ts` |
| **Orchestrator** | `packages/server/src/services/business-langgraph.ts` (3500+ 行) |
| **Mention router** | `packages/server/src/services/mention-router.ts` |
| **Handoff log** | `packages/server/src/infrastructure/handoff-log/index.ts` |
| **SLO tracker** | `packages/server/src/infrastructure/observability/agent-slo-tracker.ts` |
| **YAML profiles** | `packages/server/src/agents/<id>/agent.yaml` × 12 |
| **Graph registrations** | `packages/server/src/agents/<id>/graph.ts` × 12 |

---

## 十一、与 memory 层的对照

| 维度 | memory（P14）| agent layer |
|---|---|---|
| 服务化 | 5 service（Capture/Retrieve/Consolidate/Reaper/Distiller）| 1 大 BusinessLangGraphService + 多个共享 helper |
| Schema 命名 | layer/facet/category 三轴 | role × callability × capabilities yaml |
| 死值清理 | 7 kinds → 4, 3 scopes → 2 | 4 stub agent 是设计而非死值 |
| 测试覆盖 | 29 unit + 4 集成 = 33 | 8 集成 + 2 critic + 2 deep-research = 12+ |
| 文档 | memory-and-session-layered.md | **本文档** agent-layer.md |

---

## 十二、不会做的（明确划界）

| 项 | 原因 |
|---|---|
| 把 4 个 debate agent 改造成真 ReAct subgraph | 单次 LLM 调用够用，包成 ReAct 是 ceremony 无价值 |
| 拆 BusinessLangGraphService 巨型类（3500+ 行）| 风险过高；当前 lint+test 通过；论文不需要 |
| 把 supervisor 改成 separate agent（独立注册）| 当前 supervisor 是 LangGraph 内的 plain node；改造成 agent 收益小 |
| Cross-user agent 共享（marketplace）| 不在毕设范围 |
| Agent 链路自我演化（动态生成 prompt） | research-grade，不是工程交付 |

---

## 十三、论文章节对应

| 论文章节 | 对应代码 / 概念 |
|---|---|
| §3 多智能体协作 | 12 agent · 8 ReAct + 4 prompt-only |
| §3.1 capability 注册表 | profile-loader + agentRegistry / advisorRegistry |
| §3.2 Supervisor 路由 | runSupervisor + RoutingDecision |
| §3.3 BMC 生成（market/product/finance） | buildBmcGeneratorSubgraph + ReAct |
| §3.4 审议（critic + interrupt） | runCritic + HITL pendingInterrupt |
| §3.5 Debate（opponent + moderator） | LlmDebateInvoker · 3 dimensions × 4 agents |
| §3.6 综合（synthesizer / report-writer）| invokeRegisteredAgent 长文输出 |
| §6 可观测性 | handoff log + SLO tracker + OTel span |

---

## 十四、最终架构图（论文 §3 抽用）

```
                          ┌──────────────────────────────────┐
                          │  business-langgraph (orchestrator)│
                          │  StateGraph: supervisor → agents → │
                          │              critic → debate → end │
                          └────────────────┬─────────────────┘
                                           │
                  ┌────────────────────────┼─────────────────────┐
                  ▼                        ▼                     ▼
          ┌──────────────┐         ┌──────────────┐      ┌──────────────┐
          │  GENERATION   │         │   REVIEW     │      │   DEBATE     │
          │  (parallel)   │         │              │      │  (sequential)│
          ├──────────────┤         ├──────────────┤      ├──────────────┤
          │ market-agent  │         │ critic-agent  │      │ market-opp.   │
          │ product-agent │         │ (HITL ready)  │      │ product-opp.  │
          │ finance-agent │         │               │      │ finance-opp.  │
          │ synthesizer   │         │               │      │ moderator     │
          │ deep-research │         │               │      │               │
          │ report-writer │         │               │      │  via Llm-     │
          │ general-resp. │         │               │      │  DebateInvoker│
          │               │         │               │      │  (yaml prompt-│
          │ ReAct loop    │         │ ReAct loop    │      │   only path)  │
          │ subgraph route│         │ subgraph route│      │               │
          └──────┬───────┘         └──────┬───────┘      └──────┬───────┘
                 │                        │                     │
                 ▼                        ▼                     ▼
                         ┌────────────────────────────────────┐
                         │  Handoff log (per traceId)          │
                         │  generation-output / revision-      │
                         │  request / debate-turn / verdict    │
                         └────────────────────────────────────┘
                                           │
                                           ▼
                         ┌────────────────────────────────────┐
                         │  Frontend: stream events →          │
                         │  CanvasStageStrip (P13) +           │
                         │  AgentHealthChip + WireDrawer       │
                         └────────────────────────────────────┘
```

8 个 ReAct agent 通过 invokeRegisteredAgent 走 subgraph 路径；4 个 debate
agent 通过 LlmDebateInvoker 走 prompt-only 路径。两条路径在
handoff log 里汇合，前端通过 stream 事件统一可视化。
