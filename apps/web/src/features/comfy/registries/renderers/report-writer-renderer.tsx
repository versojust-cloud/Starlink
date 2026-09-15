/**
 * ReportWriterRenderer — surfaces the long 6-section structured report
 * emitted by the report-writer agent. Handles three reading densities:
 *
 *   - chat:   collapsed accordion. Each `## Section` becomes a row;
 *             user clicks to expand inline. Keeps the chat dock from
 *             being eaten by a 3000-word block.
 *   - drawer: full reading mode with sticky left TOC + right column for
 *             section content. Used inside ReportDetailDrawer.
 *   - panel:  same as chat (collapsed) — present here in case the
 *             insight panel ever surfaces report content.
 *
 * Citation tokens supported (consistent with deep-research format):
 *   [[ref:docId#snippetId]]   → blue inline chip, click → openEvidenceDrawer
 *   [[bmc:dimension]]         → byline-tinted chip linking to BMC cell
 *   [[critic:conflictId]]     → red chip linking to conflict
 *   [[no-ref]]                → muted "无引用" tag
 */

import { useMemo, useState, type ReactNode } from 'react'
import { ChevronDown, FileText } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useComfyStore } from '../../store'
import { EditorialProse } from './editorial-prose'
import type { AgentOutputRenderer, AgentOutputContext } from '../agent-output-renderer-registry'
import {
  tokenizeInlineCitations,
  type CitationHandlers
} from '../../lib/render-inline-citations'

function shouldHandle(ctx: AgentOutputContext): boolean {
  if (ctx.agentId === 'report-writer') return true
  if (ctx.macraType === 'report-card') return true
  return false
}

interface Section {
  title: string
  body: string
}

/** Split markdown into sections by `## Heading`. Returns the leading
 *  pre-section content (if any) under a synthetic "前言" key. */
function splitSections(markdown: string): { preamble: string; sections: Section[] } {
  if (!markdown) return { preamble: '', sections: [] }
  const re = /^##\s+(.+)$/gm
  const headings: Array<{ title: string; index: number; matchEnd: number }> = []
  let m: RegExpExecArray | null
  while ((m = re.exec(markdown)) !== null) {
    headings.push({ title: m[1].trim(), index: m.index, matchEnd: m.index + m[0].length })
  }
  if (headings.length === 0) {
    return { preamble: markdown.trim(), sections: [] }
  }
  const preamble = markdown.slice(0, headings[0].index).trim()
  const sections: Section[] = []
  for (let i = 0; i < headings.length; i++) {
    const cur = headings[i]
    const next = headings[i + 1]
    const body = markdown.slice(cur.matchEnd, next ? next.index : markdown.length).trim()
    sections.push({ title: cur.title, body })
  }
  return { preamble, sections }
}

// P15 frontend · Tokenize + chip rendering moved to shared helper
// (`apps/web/src/features/comfy/lib/render-inline-citations.tsx`).
// Local `TokenizeHandlers` aliased to the shared `CitationHandlers` so
// downstream code in this file (tokenizeChildren etc.) keeps the same
// shape without touching every call site.
type TokenizeHandlers = Required<CitationHandlers>

const tokenize = (text: string, h: TokenizeHandlers): ReactNode[] =>
  tokenizeInlineCitations(text, h)

function tokenizeChildren(children: ReactNode, h: TokenizeHandlers): ReactNode {
  if (typeof children === 'string') return tokenize(children, h)
  if (Array.isArray(children)) {
    return children.map((c, i) => {
      if (typeof c === 'string') return <span key={i}>{tokenize(c, h)}</span>
      return c
    })
  }
  return children
}

// ============================================================================
// Renderer
// ============================================================================

export const ReportWriterRenderer: AgentOutputRenderer = {
  id: 'report-writer',
  match: shouldHandle,
  render: (ctx) => <ReportView ctx={ctx} />,
}

// Map BMC dimension string (as it appears in [[bmc:dim]] tokens) to the
// canonical canvas node id. The dimension token may be either kebab-case
// English (matching the cell id directly) or Chinese — handle both.
const BMC_DIMENSION_TO_NODE_ID: Record<string, string> = {
  'customer-segments':       'market-customer-segments',
  'channels':                'market-channels',
  'customer-relationships':  'market-customer-relationships',
  'value-propositions':      'product-value-propositions',
  'key-resources':           'product-key-resources',
  'key-activities':          'product-key-activities',
  'key-partnerships':        'product-key-partnerships',
  'revenue-streams':         'finance-revenue-streams',
  'cost-structure':          'finance-cost-structure',
  // Chinese aliases
  '客户细分':       'market-customer-segments',
  '渠道通路':       'market-channels',
  '客户关系':       'market-customer-relationships',
  '价值主张':       'product-value-propositions',
  '核心资源':       'product-key-resources',
  '关键业务':       'product-key-activities',
  '重要合作':       'product-key-partnerships',
  '收入来源':       'finance-revenue-streams',
  '成本结构':       'finance-cost-structure',
}

function ReportView({ ctx }: { ctx: AgentOutputContext }) {
  const openEvidenceDrawer = useComfyStore((s) => s.openEvidenceDrawer)
  const openDetailPanel = useComfyStore((s) => s.openDetailPanel)
  const setFocusedConflictId = useComfyStore((s) => s.setFocusedConflictId)

  const onRef = (id: string) => openEvidenceDrawer(id)
  // [[insight:nodeId]] → open the detail drawer for that canvas node.
  // ctx.onFocusNode (if provided) wins over the default to allow per-
  // surface override (e.g. flash-highlight instead of opening drawer).
  const onInsight = (nodeId: string) => {
    if (ctx.onFocusNode) ctx.onFocusNode(nodeId)
    else openDetailPanel(nodeId)
  }
  // [[bmc:dimension]] → translate to canonical cell id, then open detail.
  const onBmc = (dim: string) => {
    const normalizedDim = dim.toLowerCase().trim()
    const target = BMC_DIMENSION_TO_NODE_ID[normalizedDim] ?? BMC_DIMENSION_TO_NODE_ID[dim.trim()]
    if (target) {
      if (ctx.onFocusNode) ctx.onFocusNode(target)
      else openDetailPanel(target)
    }
  }
  // [[critic:conflictId]] → set focusedConflictId in the store. Canvas
  // page subscribes and auto-opens the Insight Panel · 审查 tab.
  const onCritic = (conflictId: string) => {
    setFocusedConflictId(conflictId)
  }

  const handlers: TokenizeHandlers = { onRef, onBmc, onCritic, onInsight }

  const { preamble, sections } = useMemo(() => splitSections(ctx.content), [ctx.content])

  if (ctx.surface === 'drawer') {
    return <DrawerView preamble={preamble} sections={sections} handlers={handlers} />
  }
  // chat / panel — collapsed accordion
  return <ChatView preamble={preamble} sections={sections} handlers={handlers} />
}

// ----------------------------------------------------------------------------
// Chat / panel: collapsed accordion
// ----------------------------------------------------------------------------

function ChatView(props: {
  preamble: string
  sections: Section[]
  handlers: TokenizeHandlers
}) {
  const { preamble, sections, handlers } = props
  const [expandedIdx, setExpandedIdx] = useState<number | null>(0) // first section auto-open

  return (
    <div className="border-[1px] border-stratum-line bg-white">
      <div className="flex items-center gap-2 px-3 py-2 border-b-[0.5px] border-stratum-line">
        <FileText className="h-3.5 w-3.5 text-stratum-muted" strokeWidth={1.75} />
        <span className="font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-stratum-muted">
          REPORT · {sections.length} SECTIONS
        </span>
      </div>

      {preamble ? (
        <div className="px-3 py-2 border-b-[0.5px] border-stratum-line">
          <div className="prose prose-sm max-w-none break-words text-[12px] leading-[1.6] text-stratum-ink">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                p: ({ children }) => <p className="my-1">{tokenizeChildren(children, handlers)}</p>,
              }}
            >
              {preamble}
            </ReactMarkdown>
          </div>
        </div>
      ) : null}

      <ul>
        {sections.map((sec, i) => {
          const open = i === expandedIdx
          return (
            <li key={i} className="border-b-[0.5px] border-stratum-line last:border-b-0">
              <button
                type="button"
                onClick={() => setExpandedIdx(open ? null : i)}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-stratum-surface-low/40 transition-colors"
              >
                <div className="flex items-baseline gap-2 min-w-0">
                  <span className="font-mono text-[10px] tabular-nums text-stratum-muted shrink-0 w-5">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="font-display font-[700] text-[13px] tracking-tight text-stratum-navy truncate">
                    {sec.title}
                  </span>
                </div>
                <ChevronDown
                  className={`h-3.5 w-3.5 text-stratum-muted shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
                  strokeWidth={1.75}
                />
              </button>
              {open ? (
                <div className="px-3 pb-2.5 pt-1 bg-stratum-surface-low/30">
                  <div className="prose prose-sm max-w-none break-words text-[12px] leading-[1.65] text-stratum-ink">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        p: ({ children }) => <p className="my-1.5">{tokenizeChildren(children, handlers)}</p>,
                        li: ({ children }) => <li className="my-0.5">{tokenizeChildren(children, handlers)}</li>,
                        h3: ({ children }) => <h3 className="font-display font-[700] text-[12px] mt-2 mb-1 text-stratum-navy">{children}</h3>,
                        ul: ({ children }) => <ul className="list-disc pl-5 my-1">{children}</ul>,
                        ol: ({ children }) => <ol className="list-decimal pl-5 my-1">{children}</ol>,
                        strong: ({ children }) => <strong className="font-semibold text-stratum-navy">{children}</strong>,
                        table: ({ children }) => (
                          <div className="my-2 -mx-1 overflow-x-auto rounded-[1px] border-[1px] border-stratum-line bg-white">
                            <table className="w-full border-collapse text-[11.5px] leading-[1.5] tabular-nums">{children}</table>
                          </div>
                        ),
                        thead: ({ children }) => (
                          <thead className="bg-stratum-surface-low border-b-[1.5px] border-stratum-navy">{children}</thead>
                        ),
                        tr: ({ children }) => (
                          <tr className="border-b-[0.5px] border-stratum-line last:border-b-0 hover:bg-stratum-surface-low/40 transition-colors">{children}</tr>
                        ),
                        th: ({ children }) => (
                          <th className="font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-stratum-muted text-left px-2 py-1.5 whitespace-nowrap">{children}</th>
                        ),
                        td: ({ children }) => (
                          <td className="px-2 py-1.5 text-stratum-ink align-top">{children}</td>
                        ),
                      }}
                    >
                      {sec.body}
                    </ReactMarkdown>
                  </div>
                </div>
              ) : null}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// ----------------------------------------------------------------------------
// Drawer: sticky TOC + full sections rendered through EditorialProse for
// magazine-grade reading typography (drop cap / serif headings / hairline
// rules / pull quotes / mono list markers).
// ----------------------------------------------------------------------------

function DrawerView(props: {
  preamble: string
  sections: Section[]
  handlers: TokenizeHandlers
}) {
  const { preamble, sections, handlers } = props

  // Citation tokenizer wired to the registry's processors so EditorialProse
  // doesn't need to know about citation chips. We pass children through
  // the tokenizer for both <p> and <li>.
  const tokenizeP = (children: ReactNode) => tokenizeChildren(children, handlers)
  const tokenizeLi = (children: ReactNode) => tokenizeChildren(children, handlers)

  return (
    <div className="grid grid-cols-[200px_1fr] gap-8">
      {/* Sticky TOC — newspaper-style left rail */}
      <nav className="sticky top-0 self-start border-r border-stratum-line pr-4 py-1">
        <div className="border-b-[1.5px] border-stratum-navy pb-2 mb-3">
          <span className="font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-stratum-navy">
            CONTENTS
          </span>
        </div>
        <ol className="space-y-2.5 list-none">
          {sections.map((sec, i) => (
            <li key={i}>
              <a
                href={`#section-${i}`}
                className="group flex items-baseline gap-2 text-stratum-muted hover:text-stratum-navy transition-colors"
              >
                <span className="font-mono text-[10px] font-bold tabular-nums shrink-0 text-stratum-navy/60 group-hover:text-stratum-navy">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="font-display font-[600] text-[12.5px] leading-snug">
                  {sec.title}
                </span>
              </a>
            </li>
          ))}
        </ol>
      </nav>

      {/* Body */}
      <article className="max-w-[680px]">
        {preamble ? (
          <EditorialProse
            content={preamble}
            density="reading"
            paragraphProcessor={tokenizeP}
            listItemProcessor={tokenizeLi}
          />
        ) : null}

        {sections.map((sec, i) => (
          <section key={i} id={`section-${i}`} className="scroll-mt-6 mt-12 first:mt-0">
            {/* Cross-column section header — eyebrow + serif title + hairline */}
            <header className="mb-6">
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-stratum-navy/60">
                Section · {String(i + 1).padStart(2, '0')}
              </p>
              <h2 className="font-display font-[800] text-[28px] leading-[1.15] tracking-tight text-stratum-navy mt-1.5">
                {sec.title}
              </h2>
              <div className="mt-3 h-[1.5px] bg-stratum-navy w-16" />
            </header>

            <EditorialProse
              content={sec.body}
              density="reading"
              paragraphProcessor={tokenizeP}
              listItemProcessor={tokenizeLi}
            />
          </section>
        ))}
      </article>
    </div>
  )
}
