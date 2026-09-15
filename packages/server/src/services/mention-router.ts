/**
 * Mention router (2026-05-04).
 *
 * Server-side routing for the @-mention chat feature: given an agent id +
 * a user message + a workspace id, produce a single-shot agent response.
 *
 * Routing matrix (mirrors apps/web/src/features/comfy/registries/agent-registry.ts):
 *
 *   callability                    | handler
 *   ───────────────────────────────┼─────────────────────────────────────
 *   'standalone' (BMC generators)  | invokeBmcGenerator → cells + summary
 *   'standalone' (utility)         | invokeUtility       → insight + reply
 *   'standalone-needs-bmc'         | invokeAdvisor       → context-checked
 *   'debate-side'                  | invokeOpponentSingleSide → 1-turn JSON
 *   'debate-judge'                 | invokeModeratorJudge     → balanced
 *
 * The router does NOT touch the canvas directly — it returns a structured
 * `MentionResult` and lets the caller (resolver / conversation-store)
 * persist nodes through the existing graphStore + conversation_messages
 * paths.
 */

import { nanoid } from 'nanoid'
import type {
  CanvasEdge,
  CanvasNode,
  KnowledgeEvidence
} from '@starlink/shared'
import {
  BusinessLangGraphService,
  computeBMCEdgesForCells,
  type MacraNodeData,
  renderCompactBmcCardsForPrompt
} from './business-langgraph.js'
import { defaultLlmDebateInvoker } from '../agents/shared/llm-debate-invoker.js'
import { LLMClient } from './llm-client.js'
import { injectKbBindingEvidence } from './mention/kb-binding-injector.js'
import { makeProfileGetter } from '../capabilities/profile-loader.js'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createAuditLogger } from '@starlink/shared'

const auditLogger = createAuditLogger('packages/server:mention-router')
const here = dirname(fileURLToPath(import.meta.url))
const agentsDir = join(here, '..', 'agents')

// ============================================================================
// Server-side mirror of the agent registry (subset needed for routing)
// ============================================================================

type AgentCallability =
  | 'standalone-bmc-generator'
  | 'standalone-utility'
  | 'standalone-advisor-needs-bmc'
  | 'debate-side'
  | 'debate-judge'
  | 'standalone-report'

type ServerAgentEntry = {
  id: string
  callability: AgentCallability
  /** Used by BMC generators to know which dimension they own. */
  bmcSelf?: 'market' | 'product' | 'finance'
  /** Yaml dir name (differs from id for the four `*-agent` ids). */
  yamlDir: string
}

const AGENT_TABLE: Record<string, ServerAgentEntry> = {
  'market-agent':      { id: 'market-agent',    callability: 'standalone-bmc-generator', bmcSelf: 'market',  yamlDir: 'market' },
  'product-agent':     { id: 'product-agent',   callability: 'standalone-bmc-generator', bmcSelf: 'product', yamlDir: 'product' },
  'finance-agent':     { id: 'finance-agent',   callability: 'standalone-bmc-generator', bmcSelf: 'finance', yamlDir: 'finance' },
  'critic-agent':      { id: 'critic-agent',    callability: 'standalone-advisor-needs-bmc', yamlDir: 'critic' },
  'synthesizer':       { id: 'synthesizer',     callability: 'standalone-advisor-needs-bmc', yamlDir: 'synthesizer' },
  'general-responder': { id: 'general-responder', callability: 'standalone-utility',         yamlDir: 'general-responder' },
  'deep-research':     { id: 'deep-research',   callability: 'standalone-utility',         yamlDir: 'deep-research' },
  'market-opponent':   { id: 'market-opponent', callability: 'debate-side',                yamlDir: 'market-opponent' },
  'product-opponent':  { id: 'product-opponent',callability: 'debate-side',                yamlDir: 'product-opponent' },
  'finance-opponent':  { id: 'finance-opponent',callability: 'debate-side',                yamlDir: 'finance-opponent' },
  'moderator':         { id: 'moderator',       callability: 'debate-judge',               yamlDir: 'moderator' },
  'report-writer':     { id: 'report-writer',   callability: 'standalone-report',          yamlDir: 'report-writer' },
}

// ============================================================================
// Public types
// ============================================================================

export type MentionInput = {
  workspaceId: string
  userId: string
  /** Optional — passing this lets us scope chat history under an existing conversation. */
  conversationId?: string
  agentId: string
  message: string
  /** Current canvas snapshot — required for `*-needs-bmc` agents. */
  canvasNodes: CanvasNode[]
  canvasEdges: CanvasEdge[]
  /** Optional KB evidence to feed the agent. */
  knowledgeEvidence?: KnowledgeEvidence[]
  /**
   * Internal · built by MentionRouter.buildPriorContext from
   * conversation history. Handlers forward this to BusinessLangGraphService
   * which renders it as state.contextPrompt. Callers should NOT set this
   * — it's populated by the mention pipeline.
   */
  priorContext?: string
}

export type MentionAppendedNode = {
  id: string
  type: string
  position: { x: number; y: number }
  data: unknown
}

export type MentionResult = {
  agentId: string
  reply: string
  refused: boolean
  refusalReason: string | null
  appendedNodes: MentionAppendedNode[]
  appendedEdges: CanvasEdge[]
}

// ============================================================================
// Mention router
// ============================================================================

/**
 * Optional callback the host (ConversationStore) hands to MentionRouter so
 * mentions can pull the conversation's prior user-messages as agent
 * context. Without this, first-@-mention on a fresh canvas has zero idea
 * what the user wanted (the /chat seed lives in conversation_messages, not
 * in canvas nodes), so agents refuse and ask the user to paste their pitch
 * a second time.
 *
 * The fetcher returns oldest-first so the seed (first user message) is
 * always the first entry. Caller is responsible for any workspace/user
 * permission checks BEFORE calling — by the time MentionRouter invokes
 * this, the GraphQL resolver has already authorized.
 */
export type MentionMessageFetcher = (
  conversationId: string,
  limit: number
) => Promise<Array<{ role: 'user' | 'ai' | 'system'; content: string; createdAt?: string }>>

export class MentionRouter {
  constructor(
    private readonly business: BusinessLangGraphService,
    private readonly llmClient: LLMClient = new LLMClient(),
    private readonly messageFetcher: MentionMessageFetcher | null = null
  ) {}

  /**
   * Build a "prior user said" context block from conversation history.
   * Returns '' if no fetcher / no conversationId / no user-role messages.
   *
   * Strategy: include the FIRST user message verbatim (the seed defines
   * the idea), plus up to 2 most-recent user messages that ISN'T just an
   * @-mention command. Keeps the block compact (~3 entries max) so we
   * don't blow the agent's prompt budget.
   */
  private async buildPriorContext(input: MentionInput): Promise<string> {
    if (!this.messageFetcher || !input.conversationId) return ''
    let messages: Array<{ role: string; content: string }>
    try {
      messages = await this.messageFetcher(input.conversationId, 20)
    } catch {
      return ''
    }
    const userMsgs = messages
      .filter((m) => m.role === 'user' && m.content.trim().length > 0)
      // Drop pure @-mention commands so the context isn't just a chain
      // of '@market-agent ...' messages with no actual idea content.
      .map((m) => m.content.trim())
      .filter((c) => !/^\s*@\w[-\w]*\s+/.test(c) || c.length > 80)
    if (userMsgs.length === 0) return ''
    // Pick: first (seed) + up to 2 most-recent distinct messages.
    const seed = userMsgs[0]
    const tail = userMsgs.slice(1).slice(-2)
    const unique = [seed, ...tail.filter((m) => m !== seed)]
    const lines = unique.map((m, i) => `[${i === 0 ? '原始 idea' : `近期补充 ${i}`}] ${m.slice(0, 400)}`)
    return `## 用户先前在本对话里说过的话\n${lines.join('\n')}`
  }

  // Exported as a free function below (assessBmcSeedDepth) so unit
  // tests don't have to instantiate MentionRouter.
  private assessSeedDepth(input: MentionInput) {
    return assessBmcSeedDepth(input)
  }

  /**
   * P15 · Discovery-depth gate for BMC generators (legacy doc — see
   * exported `assessBmcSeedDepth` below for the real implementation).
   *
   * After the priorContext fix landed, a 28-char seed like
   * "为社区医生开发的 AI 病历摘要工具,本地部署 + 按机构月费"
   * happily produces 9/9 BMC cells — but the agent is fabricating
   * specifics (Year-1 收入预测 / NPS 目标 / CAC 上限) with zero
   * user-provided evidence. That defeats the purpose of the multi-
   * agent pipeline; it's just slop dressed up as analysis.
   *
   * This gate enforces a minimum context floor BEFORE letting BMC
   * generators run. The thresholds are deliberately mild — the goal
   * is "talk to your coach first, then generate", not "write an essay
   * before we touch the canvas":
   *
   *   - Total user-content chars (priorChat + current message,
   *     excluding pure @-mention lines) ≥ 120
   *   - At least 2 distinct user turns OR ≥ 1 explicit detail
   *     marker (number / percent / "月费 X 元" / "目标客群是 X")
   *
   * Below the floor → refuse with a clear path back: "聊几轮" or
   * "/wizard 7 步引导". Caller gets a structured refusal so the
   * chat dock can render the action buttons.
   *
   * Exported as a top-level function (assessBmcSeedDepth below) so
   * unit tests can assert the thresholds without spinning up the
   * MentionRouter class.
   */

  async mention(input: MentionInput): Promise<MentionResult> {
    const entry = AGENT_TABLE[input.agentId]
    if (!entry) {
      return refuse(input.agentId, `未知 agent："${input.agentId}"`)
    }

    auditLogger.info({
      action: 'mention-router.start',
      requestId: input.conversationId,
      workflowId: input.workspaceId,
      userId: input.userId,
      metadata: { agentId: entry.id, callability: entry.callability }
    })

    // P11.18 · per-agent SLO. invokeRegisteredAgent already records
    // BMC generators; mention-router covers the others (utility,
    // advisor, debate-side, debate-judge, report). We bracket the
    // whole switch with a try/finally so EVERY callability lands a
    // recording — duplicate recordings for BMC paths are intentional
    // (they reflect user-facing wall-clock vs internal subgraph time).
    const sloStart = Date.now()
    let sloStatus: 'success' | 'error' | 'fallback' = 'success'
    try {
      // F4 · agent-bound KB auto-search.
      // Each agent can have N KBs bound via kb_agent_bindings (auto_search=true).
      // When the agent is invoked, we run a fresh kb-search for each binding
      // using the user's message as the query and merge the resulting chunks
      // into knowledgeEvidence. The agent then sees these chunks via
      // buildKnowledgePrompt downstream just as if the user had passed
      // an explicit kbId.
      //
      // We don't replace any caller-provided knowledgeEvidence — we APPEND.
      // This lets the user pass an explicit kbId (single-shot one-off
      // research) on top of the agent's standing bindings.
      const kbEnrichedInput = await this.injectAgentKbEvidence(input, entry.id)
      // P15 · "用户先前说过" context block. Prefer caller-supplied
      // priorContext (built by ConversationStore.mentionAgent from the
      // GraphQL priorChat field — the chat dock's user messages). Fall
      // back to the server-side messageFetcher if caller didn't supply
      // anything (legacy mention path, no chat dock history).
      const priorContext =
        kbEnrichedInput.priorContext && kbEnrichedInput.priorContext.trim().length > 0
          ? kbEnrichedInput.priorContext
          : await this.buildPriorContext(input)
      const enrichedInput: MentionInput = { ...kbEnrichedInput, priorContext }

      switch (entry.callability) {
        case 'standalone-bmc-generator':
          return await this.handleBmcGenerator(enrichedInput, entry)
        case 'standalone-utility':
          return await this.handleUtility(enrichedInput, entry)
        case 'standalone-advisor-needs-bmc':
          return await this.handleAdvisor(enrichedInput, entry)
        case 'debate-side':
          return await this.handleDebateSide(enrichedInput, entry)
        case 'debate-judge':
          return await this.handleDebateJudge(enrichedInput, entry)
        case 'standalone-report':
          return await this.handleReportWriter(enrichedInput, entry)
        default:
          return refuse(entry.id, `不支持的 callability：${entry.callability}`)
      }
    } catch (err) {
      sloStatus = 'error'
      auditLogger.error({
        action: 'mention-router.failed',
        requestId: input.conversationId,
        workflowId: input.workspaceId,
        userId: input.userId,
        metadata: { agentId: entry.id, error: err instanceof Error ? err.message : String(err) },
        error: err as Error
      })
      return refuse(entry.id, `调用 agent 失败：${err instanceof Error ? err.message : String(err)}`)
    } finally {
      try {
        const { recordAgentInvocation } = await import('../infrastructure/observability/agent-slo-tracker.js')
        recordAgentInvocation(`mention:${entry.id}`, Date.now() - sloStart, sloStatus)
      } catch {
        // Defensive: SLO must never break user-facing path.
      }
    }
  }

  /**
   * F4 · Pre-fetch KB chunks for the agent's standing bindings.
   *
   * For every (agentId, workspaceId) binding with auto_search=true,
   * runs a kb-search using the user's message as query (top-3 per
   * binding). Results are appended to input.knowledgeEvidence so the
   * downstream agent prompt sees them as if the user had passed an
   * explicit kbId.
   *
   * Errors are logged and swallowed — a KB outage shouldn't block
   * the agent invocation; the agent just runs without that source.
   */
  /** P15 S7 · KB-binding evidence injection delegated to
   *  mention/kb-binding-injector.ts. */
  private async injectAgentKbEvidence(
    input: MentionInput,
    agentId: string
  ): Promise<MentionInput> {
    return injectKbBindingEvidence(input, agentId)
  }

  // ── handlers ─────────────────────────────────────────────────────────────

  private async handleBmcGenerator(input: MentionInput, entry: ServerAgentEntry): Promise<MentionResult> {
    if (!entry.bmcSelf) return refuse(entry.id, 'BMC generator 缺少 bmcSelf 配置')

    // P15 · discovery-depth gate. Block BMC generation when the user
    // hasn't provided enough context to ground the analysis. Without
    // this, agents fabricate specifics (CAC, ARR, team size) from a
    // 28-char seed.
    const depth = this.assessSeedDepth(input)
    if (!depth.sufficient) {
      auditLogger.info({
        action: 'mention-router.bmc-gate.refused',
        requestId: input.conversationId,
        workflowId: input.workspaceId,
        userId: input.userId,
        metadata: {
          agentId: entry.id,
          reason: depth.reason,
          userChars: depth.userChars,
          userTurns: depth.userTurns
        }
      })
      const friendly =
        `先别急着生成 BMC。你目前给的信息还很浅 (${depth.reason})。\n\n` +
        `BMC agent 需要扎实的 idea 描述才能给出有据可依的分析,否则就是在凭空编 CAC / 收入预测 / 团队规模。两条推荐路径:\n\n` +
        `1. **跟 coach 多聊几轮** — 直接在 chat dock 描述你的产品、目标客户、定价直觉、最担心的假设。3-5 轮后再 @ ${entry.id}。\n` +
        `2. **走 /wizard 7 步引导** — 点画布右上角"快速入门",每步聚焦一个维度,产出结构化答案,再让 agent 整合成 BMC。\n\n` +
        `📝 提示: 把"为社区医生开发的 AI 病历摘要工具,本地部署 + 按机构月费" 补到 200 字以上,加上具体客群(一线/县级)、月费水平、团队规模、3 个最不确定的假设。`
      return {
        agentId: entry.id,
        reply: friendly,
        refused: true,
        refusalReason: '画布上下文不足,请先深挖再生成',
        appendedNodes: [],
        appendedEdges: []
      }
    }

    const seed = collectSeedFromCanvas(input.canvasNodes, input.canvasEdges)
    const traceId = nanoid()
    const { nodes, chatFallback } = await this.business.invokeBmcGeneratorForMention(entry.bmcSelf, {
      traceId,
      workspaceId: input.workspaceId,
      userId: input.userId,
      question: input.message,
      priorContext: input.priorContext,
      seed,
      // P11.18 fix · forward KB chunks injected by injectAgentKbEvidence.
      // Previously this was dropped on the floor → BMC mentions ignored
      // bound KBs and produced citation-less output. Now the chunks
      // reach BusinessState.knowledgeEvidence and buildKnowledgePrompt
      // renders them into the agent's system prompt with the
      // [[ref:docId#snippetId]] enforcement rule.
      knowledgeEvidence: input.knowledgeEvidence ?? []
    })

    // P11.14 · chatFallback UX polish. Strip the agent's internal
    // monologue ("工作区没有任何历史记忆..." / "按照约束我需要输出反问")
    // and append a tip on how to recover. The clean form is:
    //   "我需要先了解 X 才能补这个维度。
    //
    //    💡 再次 @-mention 我并补充信息（如 'B2B SaaS, 月费 99 元'）"
    const cleanChatFallback = (raw: string): string => {
      let s = raw.trim()
      // Drop sentence-level meta-monologue lines that LLMs insert before
      // the actual question. Heuristic: drop any line ending with a
      // period/句号 that contains internal-state keywords.
      const droppableLine = /(工作区|历史记忆|信息严重不足|按照约束|根据规则|我需要(?!先了解|你))/
      const lines = s.split('\n')
      const filtered: string[] = []
      let droppedAny = false
      for (const line of lines) {
        const trimmed = line.trim()
        if (!droppedAny && trimmed && droppableLine.test(trimmed) && !/[?？]\s*$/.test(trimmed)) {
          droppedAny = true
          continue
        }
        filtered.push(line)
      }
      s = filtered.join('\n').trim()
      // Strip leading horizontal rule markers if they're now stranded.
      s = s.replace(/^---\s*\n?/g, '').trim()
      // Append the recovery hint if not already there.
      if (!/再.*@.*补充|再次 @|再 @ 一次/.test(s)) {
        s = `${s}\n\n💡 **再次 @ 我并补充上述信息**（例如 "B2B SaaS / 月费 99 元 / 目标是 AI 创业者"），我会立刻生成 BMC cell。`
      }
      return s
    }

    // P11.12 · Fix B chatFallback. When agent produces 0 cells but has a
    // prose reply (e.g. asking for clarification), surface that reply
    // (after UX cleanup) so the user can read the agent's actual question
    // and re-mention with more context. Falls back to generic refusal
    // only when neither cells nor chat text are available.
    const reply =
      nodes.length === 0
        ? (chatFallback.length > 0
            ? cleanChatFallback(chatFallback)
            : `${entry.id} 暂未给出新的维度更新。`)
        : `生成 ${nodes.length} 张 ${entry.bmcSelf} 维度卡片：\n\n` +
          nodes
            .map((n: MacraNodeData) => `- **${n.label ?? n.id}**：${n.content || ''}`)
            .join('\n')

    // P11.13 / T2.2 · After mention generates new cells, recompute BMC
    // structural edges so the new cells aren't dangling. Combine seed
    // cells (already on canvas) with newly generated cells, run the
    // standard 9-edge derivation, and return only edges that touch at
    // least one new node id (existing edges are already on the canvas).
    let appendedEdges: CanvasEdge[] = []
    if (nodes.length > 0) {
      const allCells: MacraNodeData[] = [
        ...seed.marketNodes,
        ...seed.productNodes,
        ...seed.financeNodes,
        ...nodes
      ]
      const newIds = new Set(nodes.map((n) => n.id))
      const allBmcEdges = computeBMCEdgesForCells(allCells)
      appendedEdges = allBmcEdges.filter(
        (e) => newIds.has(e.source) || newIds.has(e.target)
      )
    }

    return {
      agentId: entry.id,
      reply,
      refused: false,
      refusalReason: null,
      appendedNodes: nodes.map(macraToMentionNode),
      appendedEdges
    }
  }

  private async handleAdvisor(input: MentionInput, entry: ServerAgentEntry): Promise<MentionResult> {
    const seed = collectSeedFromCanvas(input.canvasNodes, input.canvasEdges)
    const totalBmc = seed.marketNodes.length + seed.productNodes.length + seed.financeNodes.length
    if (totalBmc === 0) {
      return refuse(
        entry.id,
        entry.id === 'critic-agent'
          ? 'critic 需要画布上有 BMC 节点才能找冲突，请先 @market-agent / @product-agent / @finance-agent 或点 "快速入门" 生成 BMC。'
          : 'synthesizer 需要 BMC 三维度的节点才能跨维度合成，请先生成 BMC。'
      )
    }

    const traceId = nanoid()
    if (entry.id === 'critic-agent') {
      const conflicts = await this.business.invokeCriticForMention({
        traceId,
        workspaceId: input.workspaceId,
        userId: input.userId,
        question: input.message,
      priorContext: input.priorContext,
        seed
      })
      const reply =
        conflicts.length === 0
          ? '画布上当前 BMC 维度间未检出明显冲突。'
          : `检出 ${conflicts.length} 处冲突：\n\n` +
            conflicts
              .map((c: MacraNodeData) => `- **${c.label}** (${c.severity ?? 'medium'})：${c.content || ''}`)
              .join('\n')
      return {
        agentId: entry.id,
        reply,
        refused: false,
        refusalReason: null,
        appendedNodes: conflicts.map((c: MacraNodeData) => ({
          id: c.id,
          type: 'note',
          position: { x: 160, y: 0 }, // canvas builder will reposition
          data: macraToCanvasData(c)
        })),
        appendedEdges: []
      }
    }

    // synthesizer
    const { insights, suggestedEdges } = await this.business.invokeSynthesizerForMention({
      traceId,
      workspaceId: input.workspaceId,
      userId: input.userId,
      question: input.message,
      priorContext: input.priorContext,
      seed
    })
    const reply =
      insights.length === 0 && suggestedEdges.length === 0
        ? '暂未发现新的跨维度洞察。'
        : [
            insights.length
              ? '## 跨维度洞察\n' + insights.map((i: string) => `- ${i}`).join('\n')
              : '',
            suggestedEdges.length
              ? '## 建议连线\n' +
                suggestedEdges
                  .map((e: { from: string; to: string; label: string }) => `- ${e.from} → ${e.to}：${e.label}`)
                  .join('\n')
              : ''
          ]
            .filter(Boolean)
            .join('\n\n')

    const appendedEdges: CanvasEdge[] = suggestedEdges.map(
      (e: { from: string; to: string; label: string }) => ({
        id: `synth-edge-${nanoid(6)}`,
        source: e.from,
        target: e.to,
        label: e.label
      })
    )

    return {
      agentId: entry.id,
      reply,
      refused: false,
      refusalReason: null,
      appendedNodes: [],
      appendedEdges
    }
  }

  private async handleUtility(input: MentionInput, entry: ServerAgentEntry): Promise<MentionResult> {
    const traceId = nanoid()
    const agentName = entry.id as 'deep-research' | 'general-responder'
    const nodes = await this.business.invokeUtilityForMention(agentName, {
      traceId,
      workspaceId: input.workspaceId,
      userId: input.userId,
      question: input.message,
      priorContext: input.priorContext,
      knowledgeEvidence: input.knowledgeEvidence ?? []
    })
    const reply =
      nodes.length === 0
        ? `${entry.id} 没有产生新的内容。`
        : nodes
            .map((n: MacraNodeData) => n.content || '')
            .filter((s: string) => s.length > 0)
            .join('\n\n')

    return {
      agentId: entry.id,
      reply,
      refused: false,
      refusalReason: null,
      appendedNodes: nodes.map(macraToMentionNode),
      appendedEdges: []
    }
  }

  private async handleDebateSide(input: MentionInput, entry: ServerAgentEntry): Promise<MentionResult> {
    // Use LlmDebateInvoker.nextTurn in single-side mode (priorTurns=[],
    // disputedNodeIds=[]). The invoker treats the user's message as the
    // claim being challenged via the system prompt that already loads
    // from agent.yaml. The debate prompt template is robust enough to
    // produce a critical 1-turn response for an empty-prior context.
    const turn = await defaultLlmDebateInvoker.nextTurn({
      speaker: entry.id,
      addressee: 'user',
      priorTurns: [],
      disputedNodeIds: [],
      dimension: undefined
    })
    const reply = turn.message?.startsWith('[fallback')
      ? `${entry.id} 暂时未能生成对抗性视角，请稍后重试。`
      : turn.message
    const noteId = `mention-${entry.id}-${nanoid(6)}`
    const appendedNodes: MentionAppendedNode[] = [
      {
        id: noteId,
        type: 'note',
        position: { x: 160, y: 0 },
        data: {
          type: 'note',
          title: `${entry.id} 单边批判`,
          content: reply,
          variant: 'insight',
          meta: {
            macraType: 'insight-note',
            metadata: {
              agent_signature: entry.id,
              confidence: 'medium',
              stage: 'review',
              tags: ['mention', 'opponent']
            }
          }
        }
      }
    ]
    return {
      agentId: entry.id,
      reply,
      refused: false,
      refusalReason: null,
      appendedNodes,
      appendedEdges: []
    }
  }

  private async handleDebateJudge(input: MentionInput, entry: ServerAgentEntry): Promise<MentionResult> {
    // Moderator on @-mention: read its yaml profile, do a single chat call
    // with the user's message as the topic to evaluate. We don't reuse
    // judge() because that requires synthesised turns; for a standalone
    // ping we want a balanced read on the message itself.
    const profileGetter = makeProfileGetter(join(agentsDir, entry.yamlDir, 'agent.yaml'))
    const profile = await profileGetter()
    const system =
      profile.system_prompt +
      '\n\n---\n请对用户提出的议题给出平衡评议（3-5 句）：列出其中的合理之处、潜在风险、以及建议的下一步验证。' +
      '\n\n输出纯文本，不要 markdown 代码块。'
    const response = await this.llmClient.chat({
      model: profile.model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: input.message }
      ]
    })
    const reply = (response.content ?? '').trim() || `${entry.id} 暂未给出评议。`
    const noteId = `mention-moderator-${nanoid(6)}`
    return {
      agentId: entry.id,
      reply,
      refused: false,
      refusalReason: null,
      appendedNodes: [
        {
          id: noteId,
          type: 'note',
          position: { x: 160, y: 0 },
          data: {
            type: 'note',
            title: '辩论裁决者评议',
            content: reply,
            variant: 'insight',
            meta: {
              macraType: 'insight-note',
              metadata: {
                agent_signature: entry.id,
                confidence: 'medium',
                stage: 'review',
                tags: ['mention', 'moderator']
              }
            }
          }
        }
      ],
      appendedEdges: []
    }
  }

  /**
   * Report-writer handler. Reads the full canvas (BMC + conflicts +
   * insights), invokes the long-form generator, and emits one
   * `report-card` macra node. Refuses gracefully if the canvas has no
   * BMC nodes — the report needs something to summarize.
   */
  private async handleReportWriter(input: MentionInput, entry: ServerAgentEntry): Promise<MentionResult> {
    const seed = collectSeedFromCanvas(input.canvasNodes, input.canvasEdges)
    const totalBmc = seed.marketNodes.length + seed.productNodes.length + seed.financeNodes.length
    if (totalBmc === 0) {
      return refuse(
        entry.id,
        'report-writer 需要画布上有 BMC 节点才能撰写报告。请先 @market-agent / @product-agent / @finance-agent 或点 "快速入门" 生成 BMC。'
      )
    }
    const traceId = nanoid()
    const reportNode = await this.business.invokeReportWriterForMention({
      traceId,
      workspaceId: input.workspaceId,
      userId: input.userId,
      question: input.message,
      priorContext: input.priorContext,
      seed,
      // Pass the richer canvas context so the report-writer can weave
      // every agent's voice into the final document — synthesizer's
      // cross-dim insights, opponents' critiques, deep-research notes,
      // general-responder summaries are all in `insightNotes`.
      insightNotes: seed.insightNotes,
      knowledgeEvidence: input.knowledgeEvidence ?? [],
    })
    if (!reportNode) {
      return refuse(entry.id, '报告生成失败，请重试或检查 LLM 配置。')
    }
    const reply = (reportNode as MacraNodeData).content || '（报告内容为空）'
    return {
      agentId: entry.id,
      reply,
      refused: false,
      refusalReason: null,
      appendedNodes: [
        {
          id: reportNode.id,
          type: 'note',
          position: { x: 160, y: 0 }, // canvas builder will reposition via apply-bmc-layout
          data: macraToCanvasData(reportNode),
        },
      ],
      appendedEdges: [],
    }
  }
}

// ============================================================================
// Helpers
// ============================================================================

function refuse(agentId: string, reason: string): MentionResult {
  return {
    agentId,
    reply: reason,
    refused: true,
    refusalReason: reason,
    appendedNodes: [],
    appendedEdges: []
  }
}

/**
 * Walk the canvas snapshot and rebuild the per-agent node lists the
 * critic / synthesizer subgraphs expect. We classify by `agent_signature`
 * in the meta.metadata payload (set by the BMC generators on emit).
 */
/** Extended canvas snapshot — includes insight-notes (synthesizer /
 *  general-responder / deep-research output) so the report-writer can
 *  weave their voices into the final report. Returned alongside the
 *  base seed so existing callers (handleAdvisor / handleReportWriter)
 *  can opt into the richer context without changing their seed shape. */
export type CanvasSnapshot = {
  marketNodes: MacraNodeData[]
  productNodes: MacraNodeData[]
  financeNodes: MacraNodeData[]
  agentAvatars: MacraNodeData[]
  conflicts: MacraNodeData[]
  /** Synthesizer / general-responder / deep-research / opponent / moderator outputs. */
  insightNotes: MacraNodeData[]
  /** Optional KB document cards. */
  dataSources: MacraNodeData[]
  edges: CanvasEdge[]
}

function collectSeedFromCanvas(
  nodes: CanvasNode[],
  edges: CanvasEdge[]
): CanvasSnapshot {
  const market: MacraNodeData[] = []
  const product: MacraNodeData[] = []
  const finance: MacraNodeData[] = []
  const avatars: MacraNodeData[] = []
  const conflicts: MacraNodeData[] = []
  const insightNotes: MacraNodeData[] = []
  const dataSources: MacraNodeData[] = []

  for (const n of nodes) {
    const data = (n.data ?? {}) as Record<string, unknown>
    const meta = data.meta as Record<string, unknown> | undefined
    if (!meta) continue
    const macraType = String(meta.macraType ?? '')
    const agentSig = String(((meta.metadata as Record<string, unknown> | undefined)?.agent_signature) ?? '')

    const md: MacraNodeData = {
      id: n.id,
      type: (macraType || 'cc-bmc-card') as MacraNodeData['type'],
      label: typeof data.title === 'string' ? data.title : '未命名',
      content: typeof data.content === 'string' ? data.content : '',
      domain: typeof meta.domain === 'string' ? (meta.domain as MacraNodeData['domain']) : undefined,
      metadata: ((meta.metadata as Record<string, unknown> | undefined) ?? {}) as MacraNodeData['metadata'],
      agentType: typeof meta.agentType === 'string' ? (meta.agentType as MacraNodeData['agentType']) : undefined,
      severity: typeof meta.severity === 'string' ? (meta.severity as MacraNodeData['severity']) : undefined,
      conflictType: typeof meta.conflictType === 'string' ? (meta.conflictType as MacraNodeData['conflictType']) : undefined,
      isInteractive: typeof meta.isInteractive === 'boolean' ? meta.isInteractive : undefined
    }

    if (macraType === 'cc-bmc-card') {
      if (agentSig === 'Market_Agent') market.push(md)
      else if (agentSig === 'Product_Agent') product.push(md)
      else if (agentSig === 'Finance_Agent') finance.push(md)
    } else if (macraType === 'agent-avatar') {
      avatars.push(md)
    } else if (macraType === 'conflict-alert') {
      conflicts.push(md)
    } else if (macraType === 'insight-note') {
      insightNotes.push(md)
    } else if (macraType === 'data-source') {
      dataSources.push(md)
    }
  }

  // touch the helper to silence unused-param lint when canvas has no BMC
  void renderCompactBmcCardsForPrompt

  return {
    marketNodes: market,
    productNodes: product,
    financeNodes: finance,
    agentAvatars: avatars,
    conflicts,
    insightNotes,
    dataSources,
    edges
  }
}

function macraToMentionNode(m: MacraNodeData): MentionAppendedNode {
  return {
    id: m.id,
    type: 'note',
    position: { x: 160, y: 0 },
    data: macraToCanvasData(m)
  }
}

function macraToCanvasData(m: MacraNodeData): unknown {
  return {
    type: 'note',
    title: m.label ?? m.id,
    content: m.content ?? '',
    variant: 'insight',
    meta: {
      macraType: m.type,
      domain: m.domain,
      agentType: m.agentType,
      severity: m.severity,
      conflictType: m.conflictType,
      isInteractive: m.isInteractive,
      // P11.15 · pass through summary + fullContent so mention-appended
      // BMC cells render the 核心摘要 / 详细分析 split in the drawer just
      // like main-pipeline cells (canvas-builder.addMacraNode already
      // does this). Without it, drawer's extractMacraNodeData would
      // see no meta.summary and the drawer's 5-tier derivedSummary
      // fallback would kick in — usable but inconsistent.
      summary: (m as { summary?: string }).summary ?? '',
      fullContent: (m as { fullContent?: string }).fullContent ?? '',
      metadata: m.metadata ?? {}
    }
  }
}

/**
 * P15 · BMC seed-depth assessment. See `MentionRouter.assessSeedDepth`
 * docstring for design rationale.
 */
export function assessBmcSeedDepth(
  input: Pick<MentionInput, 'priorContext' | 'message'>
): { sufficient: true } | { sufficient: false; reason: string; userChars: number; userTurns: number } {
  const isMentionLine = (s: string): boolean =>
    /^\s*@\w[-\w]*\s+/.test(s) && s.length <= 80
  const userTexts: string[] = []
  if (input.priorContext) {
    // priorContext format: "## 用户先前... \n[原始 idea] X\n[近期补充 1] Y"
    const lines = input.priorContext.split('\n').slice(1)
    for (const line of lines) {
      const m = line.match(/^\[.+?\]\s*(.+)$/)
      if (m && m[1] && !isMentionLine(m[1])) userTexts.push(m[1].trim())
    }
  }
  if (input.message && !isMentionLine(input.message)) {
    userTexts.push(input.message.trim())
  }
  const userChars = userTexts.reduce((a, t) => a + t.length, 0)
  const userTurns = userTexts.length
  const hasConcreteDetail = userTexts.some((t) =>
    /\d/.test(t) || /目标客群是|月费|每月|每年|预算|融资|团队\s*\d|\d\s*人/.test(t)
  )
  // Three OR-paths to pass — any one is enough:
  //   A. ≥100 chars AND has concrete detail (numbers / 月费 / 客群)
  //   B. ≥3 distinct user turns (depth via dialogue)
  //   C. ≥200 chars total (one dense paragraph)
  // None → refuse.
  const passByDetail = userChars >= 100 && hasConcreteDetail
  const passByTurns = userTurns >= 3
  const passByLength = userChars >= 200
  if (passByDetail || passByTurns || passByLength) {
    return { sufficient: true }
  }
  const why: string[] = []
  if (userChars < 100) why.push(`总用户输入仅 ${userChars} 字符`)
  if (userChars >= 100 && !hasConcreteDetail) {
    why.push('描述里没有具体数字/客群/月费/团队规模/预算等细节')
  }
  if (userTurns < 3) why.push(`只有 ${userTurns} 轮用户表达,深度不够`)
  return {
    sufficient: false,
    reason: why.join('; '),
    userChars,
    userTurns
  }
}
