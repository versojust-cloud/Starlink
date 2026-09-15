/**
 * Deep research renderer — parses `[[ref:docId#snippetId]]` citation
 * marks the deep-research agent embeds in its prose, replacing each
 * with a clickable inline citation chip.
 *
 * The agent's prompt (see runDeepResearchAgent in business-langgraph)
 * mandates two sections:
 *   ## 核心结论
 *   ## 详细分析
 * with every claim followed by `[[ref:docId#chunkId]]` or `[[no-ref]]`.
 *
 * Visual:
 *   - Section headings rendered with newspaper kicker (uppercase + space)
 *   - Citations: small inline chip with mono font, click → openEvidenceDrawer
 *   - [[no-ref]] markers: muted `(无引用)` chip, low opacity — signals
 *     to the user the claim is unsupported
 */

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ReactNode } from 'react'
import { useComfyStore } from '../../store'
import type { AgentOutputRenderer, AgentOutputContext } from '../agent-output-renderer-registry'

const REF_PATTERN = /\[\[ref:([^\]#]+?)#([^\]]+?)\]\]/g
const NO_REF_PATTERN = /\[\[no-ref\]\]/g

function shouldHandle(ctx: AgentOutputContext): boolean {
  if (ctx.agentId === 'deep-research') return true
  // Heuristic fallback: content has the [[ref:...]] pattern
  if (ctx.content && /\[\[(ref:[^\]]+|no-ref)\]\]/.test(ctx.content)) return true
  return false
}

/** Splits text by inline citation marks, returning a mix of strings and React chips. */
function tokenize(text: string, openEvidence: (id: string) => void): ReactNode[] {
  const out: ReactNode[] = []
  let lastIdx = 0
  let key = 0

  // Combined regex: matches either pattern
  const combined = /\[\[(?:ref:([^\]#]+?)#([^\]]+?)|no-ref)\]\]/g
  let m: RegExpExecArray | null
  while ((m = combined.exec(text)) !== null) {
    if (m.index > lastIdx) {
      out.push(text.slice(lastIdx, m.index))
    }
    if (m[0] === '[[no-ref]]') {
      out.push(
        <span
          key={`nr-${key++}`}
          className="inline-flex items-center px-1.5 py-0 mx-0.5 font-mono text-[9px] tabular-nums uppercase tracking-[0.12em] bg-stratum-surface-low text-stratum-muted border border-stratum-line opacity-60"
          title="该论断缺少引用证据"
        >
          无引用
        </span>
      )
    } else {
      const docId = m[1]
      const snippetId = m[2]
      const compoundId = `${docId}#${snippetId}`
      out.push(
        <button
          key={`ref-${key++}`}
          type="button"
          onClick={() => openEvidence(compoundId)}
          className="inline-flex items-center px-1.5 py-0 mx-0.5 font-mono text-[9px] tabular-nums uppercase tracking-[0.12em] bg-white text-stratum-blue border border-stratum-blue/40 hover:bg-stratum-blue/10 transition-colors"
          title={`证据: ${compoundId}`}
        >
          {docId.length > 12 ? docId.slice(0, 11) + '…' : docId}
        </button>
      )
    }
    lastIdx = combined.lastIndex
  }
  if (lastIdx < text.length) {
    out.push(text.slice(lastIdx))
  }
  return out
}

// Reset regex used in the heuristic so it doesn't keep state between calls.
function resetPatterns() {
  REF_PATTERN.lastIndex = 0
  NO_REF_PATTERN.lastIndex = 0
}

export const DeepResearchRenderer: AgentOutputRenderer = {
  id: 'deep-research',
  match: (ctx) => {
    resetPatterns()
    return shouldHandle(ctx)
  },
  render: (ctx) => <DeepResearchView ctx={ctx} />,
}

function DeepResearchView({ ctx }: { ctx: AgentOutputContext }) {
  const openEvidenceDrawer = useComfyStore((s) => s.openEvidenceDrawer)

  // react-markdown's `components` lets us replace text rendering. We
  // hook into `p` and `li` so any inline [[ref:...]] gets tokenized.
  // Block-level elements (h2, h3) are restyled to newspaper kicker.
  // P12 fix · explicit text-stratum-ink. The drawer is one of the
  // few v2 surfaces with a LIGHT background (stratum-surface-low /
  // bg-white). Without this, the body sets text-paper (#F4F0E8 warm
  // off-white) which then inherits down through the markdown tree
  // → drawer text becomes invisible. The strong/h2/h3 elements
  // override individually but li/p/h4 plain spans inherit.
  const proseClass =
    ctx.surface === 'drawer'
      ? 'max-w-none break-words text-[13px] leading-[1.7] text-stratum-ink'
      : 'max-w-none break-words text-[12px] leading-[1.6] text-stratum-ink'

  return (
    <div className={`${proseClass} space-y-3`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h2: ({ children }) => (
            <div className="border-b-[0.5px] border-stratum-line pb-1 mt-3">
              <span className="font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-stratum-muted block mb-0.5">
                SECTION
              </span>
              <h2 className="font-display font-[700] text-[15px] tracking-tight text-stratum-navy uppercase">
                {children}
              </h2>
            </div>
          ),
          h3: ({ children }) => (
            <h3 className="font-display font-[700] text-[13px] text-stratum-navy mt-2 mb-1">
              {children}
            </h3>
          ),
          // P12 fix · h4 was missing entirely → default browser style
          // kicked in (inherited paper color, near-invisible). Add an
          // explicit handler matching h3 weight a notch smaller, with
          // tracking + dark navy color so numbered Chinese sub-headers
          // like "1. V2EX 技术社区精准投放" render readable.
          h4: ({ children }) => (
            <h4 className="font-display font-[600] text-[12.5px] tracking-tight text-stratum-navy mt-2 mb-1">
              {children}
            </h4>
          ),
          p: ({ children }) => (
            <p className="text-stratum-ink leading-[1.65] my-1.5">
              {tokenizeReactChildren(children, openEvidenceDrawer)}
            </p>
          ),
          li: ({ children }) => (
            // P12 fix · explicit text-stratum-ink so plain-text spans
            // inside the li (the "<strong>label</strong><span>: value</span>"
            // pattern agents emit) inherit the dark color, not the
            // paper inherited from <body>.
            <li className="my-0.5 text-stratum-ink">
              {tokenizeReactChildren(children, openEvidenceDrawer)}
            </li>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-stratum-navy">{children}</strong>
          ),
          ul: ({ children }) => <ul className="list-disc pl-5 my-1.5">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-5 my-1.5">{children}</ol>,
        }}
      >
        {ctx.content || ''}
      </ReactMarkdown>
    </div>
  )
}

/**
 * Walk react-markdown's children (which can be string | ReactElement[])
 * and run tokenize() on each string segment so inline [[ref:...]] gets
 * replaced with chips. Leaves React elements (e.g. <strong>) intact.
 */
function tokenizeReactChildren(
  children: ReactNode,
  openEvidence: (id: string) => void
): ReactNode {
  if (typeof children === 'string') {
    return tokenize(children, openEvidence)
  }
  if (Array.isArray(children)) {
    return children.map((c, i) => {
      if (typeof c === 'string') {
        return <span key={i}>{tokenize(c, openEvidence)}</span>
      }
      return c
    })
  }
  return children
}
