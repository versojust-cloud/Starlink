/**
 * P15 Sprint 6 · SynthesisService — synthesizer outputs (cross-context,
 * agent avatars, BMC edges).
 *
 * Sixth slice. Holds the rule-based synthesizer logic that produces the
 * three structured artifacts the canvas needs after BMC generation:
 *
 *   1. CrossContext — per-domain summaries (market / product / finance)
 *      + rule-based consistency notes (high-end vs low-price clash,
 *      heavy assets vs light asset model clash) + Phase 2.6 TL;DR card.
 *
 *   2. Agent avatars — 1 visual avatar per BMC-domain agent that
 *      produced output, rendered on the canvas as the agent's "presence
 *      indicator" with a one-line core insight.
 *
 *   3. BMC structural edges — `computeBMCEdgesForCells` derives the
 *      9-cell topology edges (服务于 / 触达 / 维系 / 支撑 / 创造 /
 *      带来 / 产生 / 提供) from the actual cells produced this run.
 *
 * The heavy `runSynthesizer` method (~180 LOC) remains in
 * business-langgraph.ts — it's a registry-mode-aware wrapper that
 * combines the helpers below + emits handoff events. Becomes facade
 * once a unified registry-mode runner is extracted in a future sprint.
 *
 * Public API:
 *   - buildCrossContext(state) → CrossContext
 *   - buildAgentAvatars(state) → MacraNodeData[]
 *   - buildBMCEdges(state) → CanvasEdge[]
 *   - computeBmcEdgesForCells(nodes) → CanvasEdge[]  (mention-router exit)
 */

import type { CanvasEdge } from '@starlink/shared'
import {
  EMPTY_CROSS_CONTEXT,
  type BusinessStateType,
  type CrossContext,
  type MacraNodeData
} from './state.js'
import { AGENT_TYPES } from './constants.js'
import {
  buildConsistencySummary,
  renderCompactBmcCardsForPrompt
} from './parsing.js'

/**
 * Pure BMC topology helper. Given a flat list of cells with `.domain`
 * matching the 9 standard BMC dimension names, derive the canonical
 * 8 directed edges (服务于 / 触达 / 维系 / 支撑 / 创造 / 带来 / 产生 ×2 /
 * 提供) between cells that exist. Missing cells are silently skipped
 * — partial canvases produce partial edge sets.
 *
 * Originally lived in business-langgraph.ts as a free-function export
 * for mention-router use. Moved here in P15 S6; the orchestrator
 * re-exports it from this module so external callers' import paths
 * stay stable.
 */
export function computeBMCEdgesForCells(nodes: MacraNodeData[]): CanvasEdge[] {
  const edges: CanvasEdge[] = []
  const findNode = (domain: string) => nodes.find((n) => n.domain === domain)
  const valueProp = findNode('价值主张')
  const customerSeg = findNode('客户细分')
  const channels = findNode('渠道通路')
  const customerRel = findNode('客户关系')
  const revenue = findNode('收入来源')
  const keyRes = findNode('核心资源')
  const keyAct = findNode('关键业务')
  const keyPart = findNode('重要合作')
  const cost = findNode('成本结构')
  const addEdge = (
    source: MacraNodeData | undefined,
    target: MacraNodeData | undefined,
    label: string
  ): void => {
    if (source && target) {
      edges.push({
        id: `${source.id}->${target.id}`,
        source: source.id,
        target: target.id,
        label,
        kind: 'bmc-structure'
      })
    }
  }
  addEdge(valueProp, customerSeg, '服务于')
  addEdge(channels, customerSeg, '触达')
  addEdge(customerRel, customerSeg, '维系')
  addEdge(keyRes, valueProp, '支撑')
  addEdge(keyAct, valueProp, '创造')
  addEdge(customerSeg, revenue, '带来')
  addEdge(keyRes, cost, '产生')
  addEdge(keyAct, cost, '产生')
  addEdge(keyPart, keyRes, '提供')
  return edges
}

export class SynthesisService {
  /**
   * Rule-based cross-context synthesis. Emits per-domain summaries
   * (rendered compact for prompt inclusion) + flagged consistency
   * notes when high-confidence pattern collisions are detected
   * (high-end target × low-price strategy; heavy-asset × light-asset).
   *
   * Returns EMPTY_CROSS_CONTEXT shape with empty strings when no nodes
   * exist — callers that pass to buildCrossContextPrompt(excludeAgent)
   * see no-op rendering.
   */
  buildCrossContext(state: BusinessStateType): CrossContext {
    const summarizeNodes = (nodes: MacraNodeData[]) =>
      renderCompactBmcCardsForPrompt(nodes)

    const marketSummary = summarizeNodes(state.marketNodes)
    const productSummary = summarizeNodes(state.productNodes)
    const financeSummary = summarizeNodes(state.financeNodes)

    // Rule-based consistency check
    const allNodes = [...state.marketNodes, ...state.productNodes, ...state.financeNodes]
    const notes: string[] = []

    const hasHighEnd = allNodes.some((n) => /高端|奢侈|premium|中产/.test(n.content))
    const hasLowPrice = allNodes.some((n) => /低价|廉价|降价|平价/.test(n.content))
    if (hasHighEnd && hasLowPrice) {
      notes.push('- 定价与客户定位可能存在矛盾：高端客户群 vs 低价策略')
    }

    const hasHeavyAssets = allNodes.some((n) => /重资产|自建|工厂|生产线/.test(n.content))
    const hasLightModel = allNodes.some((n) => /轻资产|平台|外包|代工/.test(n.content))
    if (hasHeavyAssets && hasLightModel) {
      notes.push('- 资源模型矛盾：同时提及重资产自建和轻资产平台模式')
    }

    // Phase 2.6 · TL;DR — 1-3 sentence overall core conclusion.
    //   - 0 risk + 0 nodes: empty string (pipeline didn't produce BMC, emit skip)
    //   - 0 risk + has nodes: 9-dim coverage-driven one-line positioning
    //   - >0 risk: 1 sentence pulling out the rule-triggered core conflict
    const consistencySummary = buildConsistencySummary({
      bmcNodeCount: allNodes.length,
      hasHighEnd,
      hasLowPrice,
      hasHeavyAssets,
      hasLightModel,
      ruleNoteCount: notes.length
    })

    return {
      marketSummary,
      productSummary,
      financeSummary,
      consistencyNotes: notes.length > 0
        ? `## 维度间一致性分析\n\n${notes.join('\n')}\n\n请各 Agent 在下一轮修正中关注以上问题。`
        : '',
      consistencySummary
    }
  }

  /**
   * One avatar per BMC-domain agent that produced output this run.
   * Avatars are rendered on the right rail as the agent's "presence
   * indicator" + one-line summary. Returns empty array when no
   * generators ran.
   */
  buildAgentAvatars(state: BusinessStateType): MacraNodeData[] {
    const avatars: MacraNodeData[] = []

    if (state.marketNodes.length > 0) {
      avatars.push({
        id: 'avatar-market',
        type: 'agent-avatar',
        label: '市场分析专家',
        content: `我已为你分析了目标客户、渠道通路和客户关系三个维度。\n\n**核心洞察**：${state.marketNodes[0]?.label || '市场分析'}`,
        agentType: AGENT_TYPES.MARKET,
        isInteractive: true,
        metadata: {
          agent_signature: AGENT_TYPES.MARKET,
          confidence: 'high',
          stage: 'execution'
        }
      })
    }

    if (state.productNodes.length > 0) {
      avatars.push({
        id: 'avatar-product',
        type: 'agent-avatar',
        label: '产品策略专家',
        content: `我已为你分析了价值主张、核心资源、关键业务和重要合作。\n\n**核心洞察**：${state.productNodes[0]?.label || '产品策略'}`,
        agentType: AGENT_TYPES.PRODUCT,
        isInteractive: true,
        metadata: {
          agent_signature: AGENT_TYPES.PRODUCT,
          confidence: 'high',
          stage: 'execution'
        }
      })
    }

    if (state.financeNodes.length > 0) {
      avatars.push({
        id: 'avatar-finance',
        type: 'agent-avatar',
        label: '财务分析专家',
        content: `我已为你分析了收入来源和成本结构。\n\n**核心洞察**：${state.financeNodes[0]?.label || '财务分析'}`,
        agentType: AGENT_TYPES.FINANCE,
        isInteractive: true,
        metadata: {
          agent_signature: AGENT_TYPES.FINANCE,
          confidence: 'high',
          stage: 'execution'
        }
      })
    }

    return avatars
  }

  /**
   * Compute BMC structural edges from this run's cells. Wraps the
   * stand-alone `computeBMCEdgesForCells` helper which is also used
   * by mention-router for incremental edge derivation.
   */
  buildBMCEdges(state: BusinessStateType): CanvasEdge[] {
    return computeBMCEdgesForCells([
      ...state.marketNodes,
      ...state.productNodes,
      ...state.financeNodes
    ])
  }

  /**
   * P11.13 / T2.2 · Public helper for mention-router to recompute BMC
   * structural edges given a flat list of cells (existing seed + newly
   * generated). Lets @-mention paths produce edges instead of dangling
   * orphans on the canvas.
   */
  computeBmcEdgesForCells(nodes: MacraNodeData[]): CanvasEdge[] {
    return computeBMCEdgesForCells(nodes)
  }
}

// Keep EMPTY_CROSS_CONTEXT re-exported here so callers don't need a
// separate import for the empty default.
export { EMPTY_CROSS_CONTEXT }
