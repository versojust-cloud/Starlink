/**
 * Agent output renderer registry (2026-05-04).
 *
 * Each backend agent emits structurally different content (BMC cells
 * with confidence scores · conflicts with severity + cell pair · debate
 * verdicts with outcome enum · deep-research with [[ref:docId#chunk]]
 * citation marks · etc). A flat markdown renderer flattens all of it
 * into prose, losing the semantics.
 *
 * This registry maps each agent / macraType to a tailored React
 * renderer that exposes the structure visually:
 *   - severity badges
 *   - cell-pair links (click → focus on canvas)
 *   - inline citation chips
 *   - confidence scores
 *
 * Surfaces using the registry:
 *   1. Chat dock — when a message has `mentionedAgent`, the dock looks
 *      up the renderer for that agent and renders structured output
 *      instead of plain markdown.
 *   2. Detail drawer (future) — when user clicks a node, look up by
 *      macraType to render the drawer body. cc-bmc-card already has
 *      its own dedicated drawer (CCBMCDetailDrawer), so the registry
 *      defers to it for that type.
 *   3. Insight panel review/citation tabs — for inline structured
 *      detail in the right-side panel.
 *
 * Adding a new renderer: drop a file in `./renderers/` exporting an
 * AgentOutputRenderer descriptor, then import + register here.
 */

import type { ReactNode } from 'react'
import { CriticConflictRenderer } from './renderers/critic-conflict-renderer'
import { DeepResearchRenderer } from './renderers/deep-research-renderer'
import { ModeratorVerdictRenderer } from './renderers/moderator-verdict-renderer'
import { BmcGeneratorRenderer } from './renderers/bmc-generator-renderer'
import { SynthesizerRenderer } from './renderers/synthesizer-renderer'
import { OpponentDebateRenderer } from './renderers/opponent-debate-renderer'
import { GeneralResponseRenderer } from './renderers/general-response-renderer'
import { ReportWriterRenderer } from './renderers/report-writer-renderer'
import { DefaultMarkdownRenderer } from './renderers/default-markdown-renderer'

// ============================================================================
// Types
// ============================================================================

export interface AgentOutputContext {
  /** Where the renderer is being used; lets it adapt density. */
  surface: 'chat' | 'drawer' | 'panel'
  /** Raw text content (markdown / JSON / etc). */
  content: string
  /** Agent that emitted this output, if known. */
  agentId?: string
  /** macraType discriminator on the canvas node, if known. */
  macraType?: string
  /** Severity for conflicts. */
  severity?: 'high' | 'moderate' | 'low'
  /** Domain for BMC cells. */
  domain?: string
  /** Free-form metadata bag (citation refs, related agents, …). */
  metadata?: Record<string, unknown>
  /** Optional callback when renderer wants to navigate to a canvas node. */
  onFocusNode?: (nodeId: string) => void
}

export interface AgentOutputRenderer {
  /** Stable id for debugging. */
  id: string
  /** Match function: returns true if this renderer should handle ctx. */
  match: (ctx: AgentOutputContext) => boolean
  /** React element for the structured detail. */
  render: (ctx: AgentOutputContext) => ReactNode
}

// ============================================================================
// Registry
// ============================================================================

/**
 * Order matters — the first matching renderer wins. Specific matchers
 * (agentId / macraType) come first; the markdown fallback is last.
 */
const RENDERERS: AgentOutputRenderer[] = [
  // Specific agent renderers first — first-match wins.
  // Report-writer goes near the top: matches both agentId='report-writer'
  // AND macraType='report-card', so it wins over default for report nodes
  // even when no agentId is in scope (e.g. drawer surface looking up by node).
  ReportWriterRenderer,
  CriticConflictRenderer,
  DeepResearchRenderer,
  ModeratorVerdictRenderer,
  BmcGeneratorRenderer,
  SynthesizerRenderer,
  OpponentDebateRenderer,
  GeneralResponseRenderer,
  // Final fallback for unknown agents.
  DefaultMarkdownRenderer,
]

export function pickRenderer(ctx: AgentOutputContext): AgentOutputRenderer {
  for (const r of RENDERERS) {
    if (r.match(ctx)) return r
  }
  return DefaultMarkdownRenderer
}

export function renderAgentOutput(ctx: AgentOutputContext): ReactNode {
  return pickRenderer(ctx).render(ctx)
}

// Re-export for ad-hoc consumption
export {
  CriticConflictRenderer,
  DeepResearchRenderer,
  ModeratorVerdictRenderer,
  BmcGeneratorRenderer,
  SynthesizerRenderer,
  OpponentDebateRenderer,
  GeneralResponseRenderer,
  ReportWriterRenderer,
  DefaultMarkdownRenderer,
}
