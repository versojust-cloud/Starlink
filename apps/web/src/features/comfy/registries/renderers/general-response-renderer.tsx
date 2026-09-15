/**
 * GeneralResponseRenderer — for the general-responder agent.
 *
 * The agent emits markdown answers that may contain inline citation
 * marks (`[source: knowledge-base ...]` or `[[ref:docId#snippetId]]`).
 * This renderer shares the citation-tokenizing logic with
 * DeepResearchRenderer but presents a lighter chrome: just a small
 * "GENERAL · 综合回答" kicker, no forced sectioning, gray byline.
 *
 * If the content has zero citation markers, this is functionally
 * identical to the default markdown — but the kicker still labels
 * the agent so user knows who answered.
 */

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ReactNode } from 'react'
import { MessageSquare } from 'lucide-react'
import { useComfyStore } from '../../store'
import type { AgentOutputRenderer, AgentOutputContext } from '../agent-output-renderer-registry'
import { bylineAccent } from '@/shared/design-system/tokens-v2'

const TINT = bylineAccent.synthesizer  // mid-gray, matches agent-registry's byline mapping for 'general'

function shouldHandle(ctx: AgentOutputContext): boolean {
  return ctx.agentId === 'general-responder'
}

const REF_RE = /\[\[(?:ref:([^\]#]+?)#([^\]]+?)|no-ref)\]\]/g

function tokenizeRefs(text: string, openEvidence: (id: string) => void): ReactNode[] {
  const out: ReactNode[] = []
  let lastIdx = 0
  let key = 0
  let m: RegExpExecArray | null
  while ((m = REF_RE.exec(text)) !== null) {
    if (m.index > lastIdx) out.push(text.slice(lastIdx, m.index))
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
      out.push(
        <button
          key={`ref-${key++}`}
          type="button"
          onClick={() => openEvidence(`${docId}#${snippetId}`)}
          className="inline-flex items-center px-1.5 py-0 mx-0.5 font-mono text-[9px] tabular-nums uppercase tracking-[0.12em] bg-white text-stratum-blue border border-stratum-blue/40 hover:bg-stratum-blue/10 transition-colors"
          title={`证据: ${docId}#${snippetId}`}
        >
          {docId.length > 12 ? docId.slice(0, 11) + '…' : docId}
        </button>
      )
    }
    lastIdx = REF_RE.lastIndex
  }
  if (lastIdx < text.length) out.push(text.slice(lastIdx))
  return out
}

function tokenizeChildren(children: ReactNode, openEvidence: (id: string) => void): ReactNode {
  if (typeof children === 'string') return tokenizeRefs(children, openEvidence)
  if (Array.isArray(children)) {
    return children.map((c, i) =>
      typeof c === 'string' ? <span key={i}>{tokenizeRefs(c, openEvidence)}</span> : c
    )
  }
  return children
}

export const GeneralResponseRenderer: AgentOutputRenderer = {
  id: 'general-response',
  match: (ctx) => {
    REF_RE.lastIndex = 0
    return shouldHandle(ctx)
  },
  render: (ctx) => <GeneralView ctx={ctx} />,
}

function GeneralView({ ctx }: { ctx: AgentOutputContext }) {
  const openEvidenceDrawer = useComfyStore((s) => s.openEvidenceDrawer)
  return (
    <div
      className="border-[1px] border-stratum-line bg-white"
      style={{ boxShadow: `inset 3px 0 0 0 ${TINT}` }}
    >
      <div className="flex items-center gap-2 px-3 py-2 border-b-[0.5px] border-stratum-line">
        <MessageSquare className="h-3.5 w-3.5 text-stratum-muted" strokeWidth={1.75} />
        <span className="font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-stratum-muted">
          GENERAL · 综合回答
        </span>
      </div>
      <div className="px-3 py-2.5">
        <div className="prose prose-sm max-w-none break-words text-[12px] leading-[1.65] [&>*]:my-1 [&_p]:leading-[1.65] [&_strong]:font-semibold [&_strong]:text-stratum-navy">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              p: ({ children }) => <p className="my-1.5">{tokenizeChildren(children, openEvidenceDrawer)}</p>,
              li: ({ children }) => <li className="my-0.5">{tokenizeChildren(children, openEvidenceDrawer)}</li>,
            }}
          >
            {ctx.content || ''}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  )
}
