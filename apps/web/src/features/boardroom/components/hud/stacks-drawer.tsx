'use client'

/**
 * StacksDrawer — left-side floating collapsible drawer.
 *
 * Houses the three "shelves" the editorial boardroom needs to keep the
 * canvas honest:
 *
 *   1. KB DOCUMENTS — the materials you uploaded; each row shows
 *      title + chunk count + citation indices that point into it.
 *   2. CITATIONS    — flat ordered list `[1] doc#chunk` for cross-reference
 *      with the [N] superscripts inside BMC cells. This is the page-margin
 *      footnote rail of a printed broadsheet.
 *   3. MEMORY       — long-term user-skill traits the system has learned
 *      across sessions (rendered as bullet kickers, not paragraphs).
 *
 * Visual moves:
 *   - Default WIDTH 296 px (expanded) / 32 px (collapsed). Toggle via
 *     a thin tab on the right edge.
 *   - Inset 24 px from viewport edges so it doesn't fight the masthead /
 *     conductor; sits ABOVE the canvas (z-30) but the canvas remains the
 *     visual subject.
 *   - 1.5 px paper-tinted border, ink-ash1 fill, NO shadow / glow. The
 *     drawer reads as a "filing cabinet drawer pulled out into the room",
 *     brutalist edge, not a card.
 *   - Section headers: Fraunces 14 px caps + 0.04em letter-spacing.
 *     Subtle paper-grain background INSIDE the drawer (ink-grain at 0.04)
 *     so it doesn't visually merge with the canvas.
 *   - All scrollable areas use mono tabular-nums for any numbers.
 *
 * No press-red used here — this rail is reference material, never alert.
 */

import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { AgentByline } from '@/shared/design-system/tokens-v2'

export type StacksKbDoc = {
  id: string
  title: string
  /** Chunks the doc decomposes into (after ingest). */
  chunkCount: number
  /** Citation indices in the current canvas that point INTO this doc. */
  citedAs: number[]
}

export type StacksCitation = {
  /** [N] visible inside cells. */
  index: number
  docId: string
  chunkId: string
  /** Optional preview snippet — shown on hover in P3. */
  snippet?: string
}

export type StacksMemoryItem = {
  id: string
  /** Trait kicker — short (≤ 24 chars). */
  title: string
  /** "user" = global cross-workspace, "workspace" = scoped here. */
  scope: 'user' | 'workspace'
  /** Confidence 0-1 — rendered as a 3-tier band. */
  confidence: number
  /** Originating agent role (for byline tint). */
  byline?: AgentByline
}

interface StacksDrawerProps {
  kbDocs?: StacksKbDoc[]
  citations?: StacksCitation[]
  memory?: StacksMemoryItem[]
  /** Initial collapsed state. P2 demo opens it expanded so the user can
   *  see the editorial intent; production should default to collapsed. */
  defaultOpen?: boolean
}

const ROLE_TINT: Record<AgentByline, string> = {
  market:      'text-byline-market',
  product:     'text-byline-product',
  finance:     'text-byline-finance',
  critic:      'text-byline-critic',
  synthesizer: 'text-byline-synthesizer',
}

export function StacksDrawer({
  kbDocs = [],
  citations = [],
  memory = [],
  defaultOpen = true,
}: StacksDrawerProps) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <aside
      className="fixed left-6 top-24 bottom-24 z-30 pointer-events-none flex"
      aria-label="Reference stacks"
    >
      {/* DRAWER BODY */}
      <div
        className={[
          'relative h-full overflow-hidden bg-ink-ash1 bg-grain-ink',
          'border-[1.5px] border-paper/30 pointer-events-auto',
          'transition-[width] duration-150 ease-out',
          open ? 'w-[296px]' : 'w-0 border-0',
        ].join(' ')}
      >
        {open ? (
          <div className="h-full flex flex-col">
            {/* HEADER kicker */}
            <header className="px-5 pt-5 pb-3 border-b-[0.5px] border-ink-ash3/30 shrink-0">
              <p className="font-instr text-[10px] uppercase tracking-kicker text-paper-ash3">
                STACKS · 资料架
              </p>
            </header>

            {/* SCROLLABLE CONTENT */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
              <SectionKb docs={kbDocs} />
              <SectionCitations items={citations} />
              <SectionMemory items={memory} />
            </div>
          </div>
        ) : null}
      </div>

      {/* TOGGLE TAB — sticks out of the drawer's right edge */}
      <button
        type="button"
        aria-label={open ? 'Collapse stacks' : 'Expand stacks'}
        onClick={() => setOpen((v) => !v)}
        className={[
          'self-center pointer-events-auto',
          'h-16 w-6 flex items-center justify-center',
          'bg-ink-ash1 border-[1.5px] border-paper/30 border-l-0',
          'text-paper-ash3 hover:text-paper transition-colors',
        ].join(' ')}
      >
        {open ? <ChevronLeft className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
      </button>
    </aside>
  )
}

// ────────────────────────────────────────────────────────────────────────
// Section: Knowledge Base
// ────────────────────────────────────────────────────────────────────────

function SectionKb({ docs }: { docs: StacksKbDoc[] }) {
  return (
    <section>
      <SectionHead label="KNOWLEDGE BASE" count={docs.length} />
      {docs.length === 0 ? (
        <EmptyHint>未挂载知识库</EmptyHint>
      ) : (
        <ul className="space-y-2">
          {docs.map((d) => (
            <li
              key={d.id}
              className="border-[1px] border-ink-ash3/30 px-3 py-2 hover:border-paper/40 transition-colors"
            >
              <p className="font-body text-[12px] text-paper truncate" title={d.title}>
                {d.title}
              </p>
              <div className="flex items-baseline gap-3 mt-1">
                <span className="font-instr text-[9px] tabular-nums uppercase tracking-kicker text-ink-ash4">
                  {d.chunkCount} CHUNK{d.chunkCount === 1 ? '' : 'S'}
                </span>
                {d.citedAs.length > 0 ? (
                  <span className="font-instr text-[9px] tabular-nums text-press">
                    {d.citedAs.map((n) => `[${n}]`).join(' ')}
                  </span>
                ) : (
                  <span className="font-instr text-[9px] uppercase tracking-kicker text-ink-ash4">
                    — uncited
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

// ────────────────────────────────────────────────────────────────────────
// Section: Citations index
// ────────────────────────────────────────────────────────────────────────

function SectionCitations({ items }: { items: StacksCitation[] }) {
  return (
    <section>
      <SectionHead label="CITATIONS" count={items.length} />
      {items.length === 0 ? (
        <EmptyHint>暂无引用</EmptyHint>
      ) : (
        <ol className="space-y-1.5">
          {items.map((c) => (
            <li
              key={c.index}
              className="flex items-baseline gap-2 font-instr text-[11px] text-paper-ash3 hover:text-paper transition-colors"
            >
              <span className="text-press tabular-nums shrink-0">[{c.index}]</span>
              <span className="truncate" title={`${c.docId}#${c.chunkId}`}>
                {c.docId}#{c.chunkId}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

// ────────────────────────────────────────────────────────────────────────
// Section: Memory
// ────────────────────────────────────────────────────────────────────────

function SectionMemory({ items }: { items: StacksMemoryItem[] }) {
  return (
    <section>
      <SectionHead label="MEMORY · 长期画像" count={items.length} />
      {items.length === 0 ? (
        <EmptyHint>用户未识别</EmptyHint>
      ) : (
        <ul className="space-y-2">
          {items.map((m) => (
            <li key={m.id} className="flex items-baseline gap-2">
              <span
                aria-hidden="true"
                className={[
                  'shrink-0 font-display text-[12px] font-[700] leading-none',
                  m.byline ? ROLE_TINT[m.byline] : 'text-paper-ash3',
                ].join(' ')}
              >
                ·
              </span>
              <div className="min-w-0">
                <p className="font-body text-[12px] text-paper truncate" title={m.title}>
                  {m.title}
                </p>
                <p className="font-instr text-[9px] uppercase tracking-kicker text-ink-ash4">
                  {m.scope === 'user' ? '全局' : '本工作区'} · CONF {confBand(m.confidence)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function confBand(c: number): string {
  if (c >= 0.75) return 'high'
  if (c >= 0.45) return 'mid'
  return 'low'
}

// ────────────────────────────────────────────────────────────────────────
// Shared bits
// ────────────────────────────────────────────────────────────────────────

function SectionHead({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-baseline justify-between mb-2.5 pb-1.5 border-b-[0.5px] border-ink-ash3/30">
      <h3 className="font-display font-[700] text-[12px] tracking-[0.04em] uppercase text-paper">
        {label}
      </h3>
      <span className="font-instr text-[10px] tabular-nums text-ink-ash4">
        {count.toString().padStart(2, '0')}
      </span>
    </div>
  )
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-instr text-[10px] uppercase tracking-kicker text-ink-ash4 py-2">
      — {children} —
    </p>
  )
}
