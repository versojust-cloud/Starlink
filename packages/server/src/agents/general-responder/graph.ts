/**
 * General Responder (Generator) · Phase 2.5 P1.2.5 · Real LLM-driven subgraph.
 *
 * STATUS: LIVE in registry mode (Stage 4, 2026-04-30). When
 * ORCHESTRATION_MODE=registry, runGeneralResponder in business-langgraph.ts
 * delegates to this subgraph via invokeRegisteredAgent. In legacy mode
 * (default) the inline LLM call in runGeneralResponder still runs — both
 * paths produce a single insight-note via createGeneralResponseNode.
 *
 * On subgraph error the supervisor falls through to the legacy inline path
 * and emits an `agent-degraded` handoff so the failure is observable.
 *
 * Subgraph topology:
 *   START → respond → END
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

export const GeneralResponderSubgraphState = Annotation.Root({
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

export type GeneralResponderSubgraphStateType = typeof GeneralResponderSubgraphState.State

// ============== Profile ==============

const here = dirname(fileURLToPath(import.meta.url))
const getProfile = makeProfileGetter(join(here, 'agent.yaml'))

// ============== Helpers ==============

function buildKnowledgeContext(evidence: KnowledgeEvidence[]): string {
  if (!evidence || evidence.length === 0) return ''
  const list = evidence
    .slice(0, 6)
    .map((e, i) => {
      const body =
        (e as { snippet?: string; content?: string; title?: string }).snippet ??
        (e as { content?: string }).content ??
        (e as { title?: string }).title ??
        ''
      return `${i + 1}. ${body}`
    })
    .join('\n')
  return `\n\n参考资料（来自知识库）：\n${list}\n`
}

function createGeneralResponseNode(traceId: string, content: string): MacraNodeData {
  return {
    id: `general-response-${traceId}`,
    type: 'insight-note',
    label: '综合回答',
    content,
    metadata: {
      agent_signature: AGENT_TYPES.ORCHESTRATOR,
      confidence: 'high',
      stage: 'decision'
    }
  }
}

// ============== Nodes ==============

function makeRespondNode(model: BusinessModel | null, systemPrompt: string) {
  return async (
    state: GeneralResponderSubgraphStateType
  ): Promise<Partial<GeneralResponderSubgraphStateType>> => {
    if (!model) {
      return {
        generalNodes: [
          createGeneralResponseNode(state.traceId, '当前未配置 LLM，无法生成通用答复。')
        ]
      }
    }

    const workspaceContext = state.workspaceContext
      ? `\n\n---\n## 工作区记忆、Session 与 Canvas 上下文\n${state.workspaceContext}`
      : ''
    const knowledgeContext = buildKnowledgeContext(state.knowledgeEvidence ?? [])

    try {
      const response = await model.invoke([
        new SystemMessage(`${systemPrompt}${workspaceContext}${knowledgeContext}`),
        new HumanMessage(state.question)
      ])
      const content = readModelText(response) || '当前没有足够信息生成明确答复。'
      return { generalNodes: [createGeneralResponseNode(state.traceId, content)] }
    } catch {
      return {
        generalNodes: [createGeneralResponseNode(state.traceId, '通用答复生成失败，请重试。')]
      }
    }
  }
}

// ============== Subgraph builder ==============

export function buildGeneralResponderSubgraph(
  model: BusinessModel | null,
  systemPrompt: string
) {
  const respond = makeRespondNode(model, systemPrompt)
  return new StateGraph(GeneralResponderSubgraphState)
    .addNode('respond', respond)
    .addEdge(START, 'respond')
    .addEdge('respond', END)
    .compile()
}

// ============== Registration ==============

export const ready: Promise<void> = (async () => {
  const profile = await getProfile()
  const model = createLLMModelFor(profile)
  // Lazy compile (LangGraph hygiene fix #4): same rationale as the
  // synthesizer — orphan agent, never invoked through the registry,
  // skip the eager StateGraph.compile() at module load.
  let cachedCompiled: ReturnType<typeof buildGeneralResponderSubgraph> | undefined
  registerAgent(
    profileToDescriptor(profile, () => {
      if (!cachedCompiled) {
        cachedCompiled = buildGeneralResponderSubgraph(model, profile.system_prompt)
      }
      return cachedCompiled
    })
  )
})()
