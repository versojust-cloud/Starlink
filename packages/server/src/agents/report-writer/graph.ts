/**
 * Report Writer · Phase 6 (2026-05-04). Single-call generator that takes
 * the full canvas state (BMC 9 cells + conflicts + cross-context insights
 * + KB evidence + history) and produces a single 6-section structured
 * markdown report. Output lands as one MacraNodeData with type='report-card'.
 *
 * Topology:
 *   START → write → END
 *
 * Why a dedicated agent and not just a synthesizer prompt:
 *   - Synthesizer scope is "cross-dimension consistency", short bullets
 *   - Report-writer is "comprehensive document for non-technical reader",
 *     long-form, sectioned, citation-tagged. Different prompt + length budget.
 *
 * Why not ReAct: report-writer reads from already-projected canvas state
 * (passed in via `bmcContext` annotation). It doesn't need tools mid-generation.
 * One LLM call. Avoids the reasoning_content roundtrip issue with thinking
 * mode + ReAct loops.
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

export const ReportWriterSubgraphState = Annotation.Root({
  traceId: Annotation<string>(),
  workspaceId: Annotation<string>(),
  userId: Annotation<string>(),
  /** User's framing question, e.g. "整份商业报告" or specific focus. */
  question: Annotation<string>({ reducer: (_a, b) => b, default: () => '' }),
  /** Pre-rendered BMC + conflicts + insights summary (caller builds this). */
  bmcContext: Annotation<string>({ reducer: (_a, b) => b, default: () => '' }),
  /** Workspace memories / user-skill block (caller builds this). */
  workspaceContext: Annotation<string>({ reducer: (_a, b) => b, default: () => '' }),
  knowledgeEvidence: Annotation<KnowledgeEvidence[]>({
    reducer: (_a, b) => b,
    default: () => []
  }),
  /** Output: single MacraNodeData of type='report-card'. */
  reportNode: Annotation<MacraNodeData | null>({
    reducer: (_a, b) => b,
    default: () => null
  })
})

export type ReportWriterSubgraphStateType = typeof ReportWriterSubgraphState.State

// ============== Profile ==============

const here = dirname(fileURLToPath(import.meta.url))
const getProfile = makeProfileGetter(join(here, 'agent.yaml'))

// ============== Helpers ==============

function buildKnowledgeContext(evidence: KnowledgeEvidence[]): string {
  if (!evidence || evidence.length === 0) return ''
  const list = evidence
    .slice(0, 12) // report can absorb more than chat — bigger budget
    .map((e, i) => {
      const docId = (e as { docId?: string }).docId ?? `doc-${i}`
      const body =
        (e as { snippet?: string }).snippet ??
        (e as { content?: string }).content ??
        ''
      return `[${docId}] ${body.slice(0, 600)}`
    })
    .join('\n\n')
  return `\n\n---\n## 知识库参考资料（撰写时按 [[ref:docId#snippetId]] 引用）\n${list}\n`
}

function createReportNode(traceId: string, label: string, content: string): MacraNodeData {
  return {
    id: `report-${traceId}`,
    type: 'report-card',
    label,
    content,
    metadata: {
      agent_signature: AGENT_TYPES.REPORT_WRITER,
      confidence: 'high',
      stage: 'decision',
      tags: ['report', 'long-form', 'comprehensive']
    }
  }
}

// ============== Nodes ==============

function makeWriteNode(model: BusinessModel | null, systemPrompt: string) {
  return async (
    state: ReportWriterSubgraphStateType
  ): Promise<Partial<ReportWriterSubgraphStateType>> => {
    if (!model) {
      return {
        reportNode: createReportNode(
          state.traceId,
          '商业报告（LLM 未配置）',
          '当前未配置 LLM，无法生成报告。请检查 LLM_API_KEY 配置。'
        )
      }
    }

    const workspaceContext = state.workspaceContext
      ? `\n\n---\n## 工作区记忆 / Session / Canvas 上下文\n${state.workspaceContext}`
      : ''
    const bmcContext = state.bmcContext
      ? `\n\n---\n## 当前画布快照（BMC 9 cell + Conflicts + Insights）\n${state.bmcContext}`
      : ''
    const knowledgeContext = buildKnowledgeContext(state.knowledgeEvidence ?? [])

    try {
      const response = await model.invoke([
        new SystemMessage(`${systemPrompt}${workspaceContext}${bmcContext}${knowledgeContext}`),
        new HumanMessage(state.question || '基于当前画布生成完整商业报告')
      ])
      const content = readModelText(response) || '报告生成为空，请重试。'

      // Derive a short label from the first line / heading. The renderer
      // also reads `content` to render full sections, so label is just
      // for the canvas card preview.
      const firstLine = content.split('\n').find((l) => l.trim().length > 0) ?? ''
      const label = firstLine.replace(/^#+\s*/, '').slice(0, 48) || '商业报告'

      return { reportNode: createReportNode(state.traceId, label, content) }
    } catch (err) {
      return {
        reportNode: createReportNode(
          state.traceId,
          '报告生成失败',
          `生成失败：${err instanceof Error ? err.message : String(err)}`
        )
      }
    }
  }
}

// ============== Subgraph builder ==============

export function buildReportWriterSubgraph(model: BusinessModel | null, systemPrompt: string) {
  const write = makeWriteNode(model, systemPrompt)
  return new StateGraph(ReportWriterSubgraphState)
    .addNode('write', write)
    .addEdge(START, 'write')
    .addEdge('write', END)
    .compile()
}

// ============== Registration ==============

export const ready: Promise<void> = (async () => {
  const profile = await getProfile()
  const model = createLLMModelFor(profile)
  // Lazy compile — only build the StateGraph when first invoked. Same
  // pattern as general-responder / synthesizer.
  let cachedCompiled: ReturnType<typeof buildReportWriterSubgraph> | undefined
  registerAgent(
    profileToDescriptor(profile, () => {
      if (!cachedCompiled) {
        cachedCompiled = buildReportWriterSubgraph(model, profile.system_prompt)
      }
      return cachedCompiled
    })
  )
})()
