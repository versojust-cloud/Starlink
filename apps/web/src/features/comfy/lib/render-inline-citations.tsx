/**
 * P15 frontend · Shared inline-citation tokenizer.
 *
 * Replaces inline citation tokens in plain text with React chip nodes
 * that the user can click to open the relevant drawer / tab. Originally
 * lived inside `report-writer-renderer.tsx`; promoted here so memory
 * drawer, mention chat dock, and any future surface can use the same
 * chip styles + click semantics without re-implementing the regex.
 *
 * Recognized tokens:
 *
 *   [[ref:docId#snippetId]]   → blue chip; click → onRef(compoundId)
 *   [[bmc:dimension]]          → product-byline chip; click → onBmc(dim)
 *   [[critic:conflictId]]      → red chip; click → onCritic(id)
 *   [[insight:nodeId]]         → synth-byline chip; click → onInsight(id)
 *   [[no-ref]]                 → muted chip "无引用"; not clickable
 *
 * Unrecognized tokens pass through as raw text. Empty input returns [].
 */

import type { ReactNode } from 'react'

const TOKEN_RE = /\[\[(?:ref:([^\]#]+?)#([^\]]+?)|bmc:([^\]]+?)|critic:([^\]]+?)|insight:([^\]]+?)|no-ref)\]\]/g

export type CitationHandlers = {
  onRef?: (compoundId: string) => void
  onBmc?: (dimension: string) => void
  onCritic?: (conflictId: string) => void
  onInsight?: (nodeId: string) => void
}

/**
 * Tokenize a string segment, replacing inline citation marks with React
 * chip elements. Pass through plain text segments unchanged. Returns an
 * array of (string | ReactNode); pass to a parent that handles mixed
 * content (e.g. paragraph children).
 */
export function tokenizeInlineCitations(
  text: string,
  handlers: CitationHandlers = {}
): ReactNode[] {
  if (!text) return []
  const out: ReactNode[] = []
  let lastIdx = 0
  let key = 0
  TOKEN_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = TOKEN_RE.exec(text)) !== null) {
    if (m.index > lastIdx) out.push(text.slice(lastIdx, m.index))
    if (m[0] === '[[no-ref]]') {
      out.push(
        <span
          key={`nr-${key++}`}
          className="inline-flex items-center px-1.5 py-0 mx-0.5 font-mono text-[9px] tabular-nums uppercase tracking-[0.12em] bg-stratum-surface-low text-stratum-muted border border-stratum-line opacity-60"
          title="该论断无证据"
        >
          无引用
        </span>
      )
    } else if (m[1] && m[2]) {
      const docId = m[1]
      const snippetId = m[2]
      const compoundId = `${docId}#${snippetId}`
      out.push(
        <button
          key={`ref-${key++}`}
          type="button"
          onClick={() => handlers.onRef?.(compoundId)}
          disabled={!handlers.onRef}
          className="inline-flex items-center px-1.5 py-0 mx-0.5 font-mono text-[9px] tabular-nums uppercase tracking-[0.12em] bg-white text-stratum-blue border border-stratum-blue/40 hover:bg-stratum-blue/10 transition-colors disabled:cursor-default disabled:hover:bg-white"
          title={`证据: ${compoundId}`}
        >
          {docId.length > 12 ? docId.slice(0, 11) + '…' : docId}
        </button>
      )
    } else if (m[3]) {
      const dim = m[3]
      out.push(
        <button
          key={`bmc-${key++}`}
          type="button"
          onClick={() => handlers.onBmc?.(dim)}
          disabled={!handlers.onBmc}
          className="inline-flex items-center px-1.5 py-0 mx-0.5 font-mono text-[9px] tabular-nums uppercase tracking-[0.12em] bg-byline-product/10 text-byline-product border border-byline-product/40 hover:bg-byline-product/20 transition-colors disabled:cursor-default"
          title={`画布: ${dim}`}
        >
          BMC · {dim}
        </button>
      )
    } else if (m[4]) {
      const cid = m[4]
      out.push(
        <button
          key={`crit-${key++}`}
          type="button"
          onClick={() => handlers.onCritic?.(cid)}
          disabled={!handlers.onCritic}
          className="inline-flex items-center px-1.5 py-0 mx-0.5 font-mono text-[9px] tabular-nums uppercase tracking-[0.12em] bg-stratum-danger/10 text-stratum-danger border border-stratum-danger/40 hover:bg-stratum-danger/20 transition-colors disabled:cursor-default"
          title={`冲突: ${cid}`}
        >
          冲突
        </button>
      )
    } else if (m[5]) {
      const nodeId = m[5]
      const display = nodeId.length > 10 ? `${nodeId.slice(0, 6)}…${nodeId.slice(-3)}` : nodeId
      out.push(
        <button
          key={`ins-${key++}`}
          type="button"
          onClick={() => handlers.onInsight?.(nodeId)}
          disabled={!handlers.onInsight}
          className="inline-flex items-center px-1.5 py-0 mx-0.5 font-mono text-[9px] tabular-nums uppercase tracking-[0.12em] bg-byline-synthesizer/10 text-byline-synthesizer border border-byline-synthesizer/40 hover:bg-byline-synthesizer/20 transition-colors disabled:cursor-default"
          title={`洞察: ${nodeId}`}
        >
          洞察 · {display}
        </button>
      )
    }
    lastIdx = TOKEN_RE.lastIndex
  }
  if (lastIdx < text.length) out.push(text.slice(lastIdx))
  return out
}

/**
 * Detect if a string contains any of the recognized citation tokens.
 * Cheap pre-check so callers can skip the more expensive tokenizer
 * (and any markdown post-processing) when there's nothing to do.
 */
export function hasInlineCitations(text: string | undefined | null): boolean {
  if (!text) return false
  return text.includes('[[ref:') || text.includes('[[bmc:') || text.includes('[[critic:') || text.includes('[[insight:') || text.includes('[[no-ref]]')
}
