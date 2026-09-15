/**
 * Deep Research (Generator) · Phase 2.6 · Real LLM-driven subgraph.
 *
 * STATUS: LIVE in registry mode. When ORCHESTRATION_MODE=registry,
 * runDeepResearchAgent in business-langgraph.ts delegates to this subgraph
 * via invokeRegisteredAgent. In legacy mode (default) the inline LLM call in
 * runDeepResearchAgent runs — both paths produce a single insight-note via
 * the citation pipeline.
 *
 * Subgraph topology:
 *   START → research → END
 *
 * The agent activates when classifyIntent returns `intent === 'deep_research'`.
 * Output is one insight-note tagged stage='review' that is rendered by the
 * canvas builder; the graph routes deepResearchAgent → END (no critic), so
 * research output is presented as-is rather than subjected to BMC conflict
 * detection.
 */

import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Annotation, StateGraph, START, END } from '@langchain/langgraph'
import { SystemMessage, HumanMessage } from '@langchain/core/messages'
import type { KnowledgeEvidence } from '@starlink/shared'

import {
  makeProfileGetter,
  profileToDescriptor,
  registerAgent
} from '../../capabilities/index.js'
import { createLLMModelFor } from '../../services/llm-factory.js'
import {
  readModelText,
  AGENT_TYPES,
  type MacraNodeData,
  type BusinessModel
} from '../shared/parsing.js'

// ============== State ==============

export const DeepResearchSubgraphState = Annotation.Root({
  traceId: Annotation<string>(),
  workspaceId: Annotation<string>(),
  userId: Annotation<string>(),
  question: Annotation<string>({ reducer: (_a, b) => b, default: () => '' }),
  workspaceContext: Annotation<string>({ reducer: (_a, b) => b, default: () => '' }),
  knowledgeEvidence: Annotation<KnowledgeEvidence[]>({
    reducer: (_a, b) => b,
    default: () => []
  }),
  generalNodes: Annotation<MacraNodeData[]>({ reducer: (_a, b) => b, default: () => [] })
})

export type DeepResearchSubgraphStateType = typeof DeepResearchSubgraphState.State

// ============== Profile ==============

const here = dirname(fileURLToPath(import.meta.url))
const getProfile = makeProfileGetter(join(here, 'agent.yaml'))

// ============== Helpers ==============

function buildEvidenceBlock(evidence: KnowledgeEvidence[]): string {
  if (!evidence || evidence.length === 0) return ''
  const list = evidence
    .slice(0, 12)
    .map((e, i) => {
      const body =
        (e as { snippet?: string; content?: string; title?: string }).snippet ??
        (e as { content?: string }).content ??
        (e as { title?: string }).title ??
        ''
      const docId = (e as { docId?: string }).docId ?? `doc-${i}`
      const snippetId = (e as { snippetId?: string }).snippetId ?? `s-${i}`
      return `${i + 1}. [docId=${docId} snippetId=${snippetId}] ${body}`
    })
    .join('\n')
  return `\n\n参考资料：\n${list}\n`
}

function createResearchPair(
  traceId: string,
  summary: string,
  detail: string,
  evidenceCount: number
): MacraNodeData[] {
  const baseMeta = {
    agent_signature: AGENT_TYPES.ORCHESTRATOR,
    confidence: (evidenceCount > 0 ? 'high' : 'medium') as 'high' | 'medium',
    stage: 'review' as const,
    evidenceCount
  }
  const summaryNode: MacraNodeData = {
    id: `deep-research-summary-${traceId}`,
    type: 'insight-note',
    label: '深度研究 · 核心结论',
    content: summary,
    metadata: { ...baseMeta, segment: 'summary' }
  }
  if (!detail) return [summaryNode]
  const detailNode: MacraNodeData = {
    id: `deep-research-detail-${traceId}`,
    type: 'insight-note',
    label: '深度研究 · 详细分析',
    content: detail,
    metadata: { ...baseMeta, segment: 'detail' }
  }
  return [summaryNode, detailNode]
}

/**
 * Split LLM-emitted markdown into the (summary, detail) pair. Mirror of the
 * splitter in business-langgraph.ts so the YAML subgraph can run standalone
 * (registry-mode bypasses the legacy method but expects the same shape).
 */
function splitSections(raw: string): { summary: string; detail: string } {
  if (!raw || !raw.trim()) return { summary: '', detail: '' }
  const text = raw.replace(/\r\n/g, '\n')
  const summaryMatch = text.match(/##\s*核心结论\s*\n([\s\S]*?)(?=\n##\s*详细分析|\n##\s|$)/)
  const detailMatch = text.match(/##\s*详细分析\s*\n([\s\S]*?)(?=\n##\s*核心结论|$)/)
  if (summaryMatch || detailMatch) {
    return {
      summary: (summaryMatch?.[1] ?? '').trim(),
      detail: (detailMatch?.[1] ?? '').trim()
    }
  }
  const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
  if (paragraphs.length === 0) return { summary: '', detail: '' }
  if (paragraphs.length === 1) return { summary: paragraphs[0], detail: '' }
  return { summary: paragraphs[0], detail: paragraphs.slice(1).join('\n\n') }
}

// ============== Nodes ==============

function makeResearchNode(model: BusinessModel | null, systemPrompt: string) {
  return async (
    state: DeepResearchSubgraphStateType
  ): Promise<Partial<DeepResearchSubgraphStateType>> => {
    const evidenceCount = state.knowledgeEvidence?.length ?? 0
    if (!model) {
      return {
        generalNodes: createResearchPair(
          state.traceId,
          '当前未配置 LLM，无法生成核心结论。',
          '当前未配置 LLM，无法生成详细研究综述。',
          evidenceCount
        )
      }
    }

    const workspaceBlock = state.workspaceContext
      ? `\n\n---\n## 工作区记忆、Session 与 Canvas 上下文\n${state.workspaceContext}`
      : ''
    const evidenceBlock = buildEvidenceBlock(state.knowledgeEvidence ?? [])

    try {
      const response = await model.invoke([
        new SystemMessage(`${systemPrompt}${workspaceBlock}${evidenceBlock}`),
        new HumanMessage(state.question)
      ])
      const raw = readModelText(response) || ''
      const { summary, detail } = splitSections(raw)
      return {
        generalNodes: createResearchPair(
          state.traceId,
          summary || '当前没有足够信息生成核心结论。',
          detail,
          evidenceCount
        )
      }
    } catch {
      return {
        generalNodes: createResearchPair(
          state.traceId,
          '研究综述生成失败，请重试。',
          '',
          evidenceCount
        )
      }
    }
  }
}

// ============== Subgraph builder ==============

export function buildDeepResearchSubgraph(
  model: BusinessModel | null,
  systemPrompt: string
) {
  const research = makeResearchNode(model, systemPrompt)
  return new StateGraph(DeepResearchSubgraphState)
    .addNode('research', research)
    .addEdge(START, 'research')
    .addEdge('research', END)
    .compile()
}

// ============== Registration ==============

export const ready: Promise<void> = (async () => {
  const profile = await getProfile()
  const model = createLLMModelFor(profile)
  // Lazy compile: same rationale as general-responder — skip eager compile at
  // module load when registry mode is off.
  let cachedCompiled: ReturnType<typeof buildDeepResearchSubgraph> | undefined
  registerAgent(
    profileToDescriptor(profile, () => {
      if (!cachedCompiled) {
        cachedCompiled = buildDeepResearchSubgraph(model, profile.system_prompt)
      }
      return cachedCompiled
    })
  )
})()
