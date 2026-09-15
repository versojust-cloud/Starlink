/**
 * P15 Sprint 3 · GenerationService — BMC generator helpers.
 *
 * First slice of the Generation extraction. Holds the shared post-processing
 * helpers used by every BMC-domain agent (market / product / finance) +
 * the cross-domain agents (general-responder / deep-research):
 *
 *   - distillCellSummaries: cheap-fast LLM second pass that replaces the
 *     generator agent's inline cell summary with a focused digest. Falls
 *     back to the original summary on per-cell failure. Configurable via
 *     BMC_SUMMARIZER_ENABLED env.
 *   - toParserEvidence + applyCitationParsing: parse inline
 *     [[ref:docId#snippetId]] / [[no-ref]] tokens in the LLM output's
 *     `content` field, replace clean text + attach citation metadata
 *     (spans / noRefRanges / invalidRefs / groundingRate) to node.metadata.
 *
 * The heavy `runMarketAgent` / `runProductAgent` / `runFinanceAgent` /
 * `runGeneralResponder` / `runDeepResearchAgent` methods (~640 LOC total)
 * remain in business-langgraph.ts as private methods this sprint —
 * they intertwine with supervisor directives, agent registry routing,
 * and HITL state. They become facades calling GenerationService once
 * the surrounding services land in S4-S6.
 */

import { deriveSnippetId } from '@starlink/shared'
import type { KnowledgeEvidence, Evidence } from '@starlink/shared'
import { LLMClient } from '../llm-client.js'
import { distillSummariesForCells } from '../../agents/shared/cell-summarizer.js'
import { parseCitations, computeGroundingRate } from '../citation/index.js'
import type { MacraNodeData, BusinessStateType } from './state.js'

export class GenerationService {
  private summarizerLLM: LLMClient | null = null

  /** Lazy-init shared summarizer LLM client (cheap-fast tier).
   *  One instance pooled across all cells in a run. */
  private getSummarizerLLM(): LLMClient {
    if (!this.summarizerLLM) {
      this.summarizerLLM = new LLMClient()
    }
    return this.summarizerLLM
  }

  /**
   * P11.5 / B3 · distill the `summary` field of each cc-bmc-card in the
   * supplied node array using a dedicated cheap-fast LLM. Replaces the
   * generator agent's inline summary with a focused digest. On per-cell
   * failure, keeps the agent's original summary as a fallback. Disabled
   * when BMC_SUMMARIZER_ENABLED=false.
   */
  async distillCellSummaries(
    state: BusinessStateType,
    nodes: MacraNodeData[]
  ): Promise<MacraNodeData[]> {
    return distillSummariesForCells(
      nodes,
      {
        traceId: state.traceId,
        workspaceId: state.workspaceId,
        userId: state.userId
      },
      { llm: this.getSummarizerLLM() }
    )
  }

  /**
   * Convert KnowledgeEvidence[] to the shape expected by the citation
   * parser. Centralizes snippetId derivation so all generators see the
   * same evidence index.
   */
  toParserEvidence(evidence: KnowledgeEvidence[] | undefined): Evidence[] {
    if (!evidence || evidence.length === 0) return []
    return evidence.map((e) => {
      const snippetId = deriveSnippetId(
        e.docId,
        e.metadata as { chunkIndex?: number } | undefined,
        e.snippet
      )
      return {
        id: `${e.docId}-${snippetId}`,
        docId: e.docId,
        snippetId,
        text: e.snippet,
        score: e.score,
        metadata: (e.metadata ?? {}) as Evidence['metadata']
      }
    })
  }

  /**
   * Post-process validated LLM agent output. For each node's `content`
   * field:
   *   - parse inline [[ref:docId#snippetId]] / [[no-ref]] tokens
   *   - replace `content` with the clean text (tokens removed)
   *   - attach citation metadata under node.metadata.citations + grounding
   *
   * Idempotent: nodes without `[[` in content pass through unchanged.
   */
  applyCitationParsing(
    nodes: MacraNodeData[],
    evidence: KnowledgeEvidence[] | undefined
  ): MacraNodeData[] {
    const parserEvidence = this.toParserEvidence(evidence)
    return nodes.map((node) => {
      const rawContent = typeof node.content === 'string' ? node.content : ''
      if (!rawContent.includes('[[')) {
        return node
      }
      const parsed = parseCitations(rawContent, parserEvidence)
      const groundingRate = computeGroundingRate(parsed)
      return {
        ...node,
        content: parsed.cleanText,
        metadata: {
          ...(node.metadata ?? {}),
          citations: parsed.spans,
          noRefRanges: parsed.noRefRanges,
          invalidRefs: parsed.invalidRefs,
          groundingRate
        }
      }
    })
  }
}
