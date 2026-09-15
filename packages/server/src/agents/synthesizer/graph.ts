/**
 * Synthesizer (Generator) · Phase 2.5 P1.2.4 · Real LLM-driven subgraph.
 *
 * STATUS: LIVE in registry mode (Stage 4b, 2026-04-30). When
 * ORCHESTRATION_MODE=registry, runSynthesizer in business-langgraph.ts
 * AUGMENTS the rule-based crossContext + edges with this subgraph's
 * LLM-driven `insights` (appended to consistencyNotes under a "## LLM
 * 跨维度洞察" heading) and `suggestedEdges` (converted to CanvasEdge[],
 * filtered to real BMC node ids only). In legacy mode (default) this
 * file is dormant.
 *
 * The merge is purely additive — LLM output never replaces rule-based
 * notes/edges. On subgraph error, runSynthesizer emits an
 * `agent-degraded` handoff and ships the legacy output unchanged.
 *
 * Subgraph topology:
 *   START → synthesize → END
 */

import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { Annotation, StateGraph, START, END } from '@langchain/langgraph'
import { SystemMessage, HumanMessage } from '@langchain/core/messages'

import { createAuditLogger } from '@starlink/shared'
import {
  makeProfileGetter,
  profileToDescriptor,
  registerAgent
} from '../../capabilities/index.js'
import { createLLMModelFor } from '../../services/llm-factory.js'
import {
  type MacraNodeData,
  type BusinessModel
} from '../../services/business-langgraph.js'

const auditLogger = createAuditLogger('packages/server:agents:synthesizer')

// ============== Output schema ==============

export const SynthesizerOutputSchema = z.object({
  insights: z.array(z.string()).default([]),
  suggestedEdges: z
    .array(
      z.object({
        from: z.string(),
        to: z.string(),
        label: z.string()
      })
    )
    .default([])
})

export type SynthesizerOutput = z.infer<typeof SynthesizerOutputSchema>

// ============== State ==============

export const SynthesizerSubgraphState = Annotation.Root({
  traceId: Annotation<string>(),
  workspaceId: Annotation<string>(),
  userId: Annotation<string>(),
  question: Annotation<string>(),
  roundNumber: Annotation<number>({ reducer: (_a, b) => b, default: () => 0 }),
  marketNodes: Annotation<MacraNodeData[]>({ reducer: (_a, b) => b, default: () => [] }),
  productNodes: Annotation<MacraNodeData[]>({ reducer: (_a, b) => b, default: () => [] }),
  financeNodes: Annotation<MacraNodeData[]>({ reducer: (_a, b) => b, default: () => [] }),
  insights: Annotation<string[]>({ reducer: (_a, b) => b, default: () => [] }),
  suggestedEdges: Annotation<Array<{ from: string; to: string; label: string }>>({
    reducer: (_a, b) => b,
    default: () => []
  })
})

export type SynthesizerSubgraphStateType = typeof SynthesizerSubgraphState.State

// ============== Profile ==============

const here = dirname(fileURLToPath(import.meta.url))
const getProfile = makeProfileGetter(join(here, 'agent.yaml'))

// ============== Helpers ==============

function summarizeNodesForPrompt(nodes: MacraNodeData[], dimension: string): string {
  if (!nodes.length) return `### ${dimension}\n（无节点）`
  const lines = nodes.map((n) => {
    const dom = n.domain ? `[${n.domain}] ` : ''
    return `- ${n.id} ${dom}${n.label}: ${n.content.slice(0, 120)}`
  })
  return `### ${dimension}\n${lines.join('\n')}`
}

// ============== Nodes ==============

function makeSynthesizeNode(model: BusinessModel | null, systemPrompt: string) {
  return async (
    state: SynthesizerSubgraphStateType
  ): Promise<Partial<SynthesizerSubgraphStateType>> => {
    const totalNodes =
      state.marketNodes.length + state.productNodes.length + state.financeNodes.length
    if (totalNodes === 0 || !model) {
      return { insights: [], suggestedEdges: [] }
    }

    try {
      // P11.8 · deepseek-chat does NOT support OpenAI's `response_format:
      // json_schema` (returns "400 This response_format type is unavailable
      // now"). Switch to `method: 'jsonMode'` which uses the simpler
      // `response_format: { type: 'json_object' }` that deepseek supports.
      // The schema is enforced via prompt + Zod parse on our side instead
      // of provider-side strict validation.
      const structured = model.withStructuredOutput(SynthesizerOutputSchema, {
        name: 'SynthesizerOutput',
        method: 'jsonMode'
      })

      const nodesSummary = [
        summarizeNodesForPrompt(state.marketNodes, 'Market 维度'),
        summarizeNodesForPrompt(state.productNodes, 'Product 维度'),
        summarizeNodesForPrompt(state.financeNodes, 'Finance 维度')
      ].join('\n\n')

      const prompt =
        systemPrompt +
        `\n\n## 三维度 BMC 节点\n${nodesSummary}\n\n` +
        `## 任务\n` +
        `1. 在 \`insights\` 中给出 1-3 条跨维度一致性观察（每条 1-2 句话）\n` +
        `2. 在 \`suggestedEdges\` 中给出 BMC 节点间的关系边，from/to 必须使用上面列出的节点 id，label 为关系标签（≤8 字）\n` +
        `3. 没有发现观察或边时返回空数组，不要编造\n\n` +
        // P11.8 · deepseek's json mode requires the literal "json" keyword
        // in the prompt. Without this it returns 400.
        `请以 JSON 格式输出，schema: { "insights": string[], "suggestedEdges": [{"from": string, "to": string, "label": string}] }`

      const response = await structured.invoke([
        new SystemMessage(prompt),
        new HumanMessage(state.question || '请整合以上 BMC 三维度的输出。')
      ])

      return {
        insights: response.insights ?? [],
        suggestedEdges: response.suggestedEdges ?? []
      }
    } catch (err) {
      // P11.13 / T2.4 · upgraded from console.warn to auditLogger so
      // failures appear in the same audit stream as all other
      // observability events. Includes traceId for cross-trace lookup.
      auditLogger.warn({
        action: 'synthesizer.withStructuredOutput-failed',
        requestId: state.traceId,
        workflowId: state.workspaceId,
        userId: state.userId,
        metadata: {
          err: err instanceof Error ? err.message : String(err),
          fallback: 'empty-insights-empty-edges'
        }
      })
      return { insights: [], suggestedEdges: [] }
    }
  }
}

// ============== Subgraph builder ==============

export function buildSynthesizerSubgraph(
  model: BusinessModel | null,
  systemPrompt: string
) {
  const synthesize = makeSynthesizeNode(model, systemPrompt)
  return new StateGraph(SynthesizerSubgraphState)
    .addNode('synthesize', synthesize)
    .addEdge(START, 'synthesize')
    .addEdge('synthesize', END)
    .compile()
}

// ============== Registration ==============

export const ready: Promise<void> = (async () => {
  const profile = await getProfile()
  const model = createLLMModelFor(profile)
  // Lazy compile (LangGraph hygiene fix #4): orphan agents that may never
  // be invoked don't pay the StateGraph.compile() cost at module load.
  // First invocation triggers the build and caches the result; subsequent
  // invocations reuse. Synthesizer is currently NEVER invoked through the
  // registry (top-level uses runSynthesizer rule-based code), so the
  // cached value typically stays undefined for the entire process.
  let cachedCompiled: ReturnType<typeof buildSynthesizerSubgraph> | undefined
  registerAgent(
    profileToDescriptor(profile, () => {
      if (!cachedCompiled) {
        cachedCompiled = buildSynthesizerSubgraph(model, profile.system_prompt)
      }
      return cachedCompiled
    })
  )
})()
