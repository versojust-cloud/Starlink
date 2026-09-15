'use client'

/**
 * WireDrawer — right-side floating collapsible drawer.
 *
 * The "communications wire" of the editorial newsroom: agent dispatches
 * land here in chronological order as they're produced. When the critic
 * triggers a debate, the wire briefly splits into a 2-column op-ed
 * spread (claimant vs. opponent) before merging back to single-column.
 *
 * Visual moves:
 *   - Each dispatch is a self-contained "filed report" — byline kicker
 *     line + Fraunces title + Geist body. Rules between dispatches are
 *     0.5 px ash-3/16 (rule-hair) — they're part of the SAME publication
 *     so the dividers are quiet.
 *   - Timestamps in JetBrains Mono, tabular-nums.
 *   - Live "active" status uses a slow paper-pulsing dot, NOT press-red.
 *     Red is reserved for the debate header and HITL prompts.
 *   - Auto-scroll-to-latest with a subtle "↓ NEW" pill that appears
 *     only when the user has scrolled away from the bottom.
 *   - Default 320 px wide, collapses to 32 px tab handle.
 */

import { useState, useEffect, useRef } from 'react'
import { ChevronRight, ChevronLeft } from 'lucide-react'
import type { AgentByline } from '@/shared/design-system/tokens-v2'

export type WireDispatch = {
  id: string
  /** ISO timestamp. Rendered HH:MM:SS in UTC for editorial consistency. */
  occurredAt: string
  agentId: string
  agentName: string
  /** Single-letter byline glyph. */
  glyph: string
  role: AgentByline
  kind: 'dispatch' | 'phase' | 'tool-call' | 'debate-turn' | 'verdict'
  /** Headline / one-liner. Optional for tool-call rows. */
  headline?: string
  /** Body text — Geist body, max 64ch. */
  body?: string
  /** Citation refs surfaced inside this dispatch. */
  refs?: string[]
}

export type WireDebate = {
  id: string
  /** Active until verdict lands. */
  active: boolean
  /** Topic / claim under contention. */
  topic: string
  /** Two sides of the dual-column op-ed. */
  claimant: WireDispatch
  opponent: WireDispatch
}

interface WireDrawerProps {
  dispatches?: WireDispatch[]
  debate?: WireDebate | null
  defaultOpen?: boolean
}

const ROLE_TINT: Record<AgentByline, string> = {
  market:      'text-byline-market',
  product:     'text-byline-product',
  finance:     'text-byline-finance',
  critic:      'text-byline-critic',
  synthesizer: 'text-byline-synthesizer',
}

export function WireDrawer({
  dispatches = [],
  debate = null,
  defaultOpen = true,
}: WireDrawerProps) {
  const [open, setOpen] = useState(defaultOpen)
  const scrollerRef = useRef<HTMLDivElement | null>(null)

  // Auto-scroll to latest on new dispatches (when already at bottom).
  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    if (atBottom) el.scrollTop = el.scrollHeight
  }, [dispatches.length])

  return (
    <aside
      className="fixed right-6 top-24 bottom-24 z-30 pointer-events-none flex flex-row-reverse"
      aria-label="Live wire"
    >
      <div
        className={[
          'relative h-full overflow-hidden bg-ink-ash1 bg-grain-ink',
          'border-[1.5px] border-paper/30 pointer-events-auto',
          'transition-[width] duration-150 ease-out',
          open ? 'w-[320px]' : 'w-0 border-0',
        ].join(' ')}
      >
        {open ? (
          <div className="h-full flex flex-col">
            <header className="px-5 pt-5 pb-3 border-b-[0.5px] border-ink-ash3/30 shrink-0 flex items-baseline justify-between">
              <p className="font-instr text-[10px] uppercase tracking-kicker text-paper-ash3">
                WIRE · 通讯线
              </p>
              <span className="flex items-center gap-1.5 font-instr text-[9px] uppercase tracking-kicker text-ink-ash4">
                <span
                  aria-hidden="true"
                  className="h-1.5 w-1.5 rounded-full bg-paper animate-editorial-publish"
                />
                LIVE
              </span>
            </header>

            <div ref={scrollerRef} className="flex-1 overflow-y-auto px-5 py-4">
              {/* DEBATE BLOCK — pinned at top when active */}
              {debate?.active ? <DebateBlock debate={debate} /> : null}

              {/* DISPATCH FEED */}
              {dispatches.length === 0 ? (
                <p className="font-instr text-[10px] uppercase tracking-kicker text-ink-ash4 py-3 text-center">
                  — 等待第一份发稿 —
                </p>
              ) : (
                <ul className="space-y-5">
                  {dispatches.map((d) => (
                    <li key={d.id}>
                      <DispatchRow dispatch={d} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : null}
      </div>

      <button
        type="button"
        aria-label={open ? 'Collapse wire' : 'Expand wire'}
        onClick={() => setOpen((v) => !v)}
        className={[
          'self-center pointer-events-auto',
          'h-16 w-6 flex items-center justify-center',
          'bg-ink-ash1 border-[1.5px] border-paper/30 border-r-0',
          'text-paper-ash3 hover:text-paper transition-colors',
        ].join(' ')}
      >
        {open ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
      </button>
    </aside>
  )
}

// ────────────────────────────────────────────────────────────────────────
// Single dispatch row
// ────────────────────────────────────────────────────────────────────────

function DispatchRow({ dispatch }: { dispatch: WireDispatch }) {
  const tint = ROLE_TINT[dispatch.role]
  const time = formatTime(dispatch.occurredAt)
  const phase = dispatch.kind === 'phase'
  const tool  = dispatch.kind === 'tool-call'

  return (
    <article className="border-t-[0.5px] border-ink-ash3/16 pt-3 first:border-0 first:pt-0">
      {/* BYLINE LINE — timestamp · GLYPH AGENT */}
      <header className="flex items-baseline gap-2 mb-1.5">
        <span className="font-instr text-[10px] tabular-nums text-ink-ash4">
          {time}
        </span>
        <span className="font-instr text-[9px] uppercase tracking-kicker text-ink-ash4">·</span>
        <span aria-hidden="true" className={`font-display text-[11px] font-[700] leading-none ${tint}`}>
          {dispatch.glyph}
        </span>
        <span className="font-instr text-[10px] uppercase tracking-kicker text-paper-ash3 truncate">
          {dispatch.agentName}
        </span>
        {phase ? (
          <span className="ml-auto font-instr text-[9px] uppercase tracking-kicker text-paper-ash3">
            PHASE
          </span>
        ) : tool ? (
          <span className="ml-auto font-instr text-[9px] uppercase tracking-kicker text-ink-ash4">
            TOOL
          </span>
        ) : null}
      </header>

      {/* HEADLINE — Fraunces, only for non-tool rows */}
      {dispatch.headline && !tool ? (
        <h4 className="font-display font-[700] text-[14px] leading-[1.2] text-paper mb-1">
          {dispatch.headline}
        </h4>
      ) : null}

      {/* BODY — Geist */}
      {dispatch.body ? (
        <p className="font-body text-[12px] leading-[1.5] text-paper/85 max-w-measure-body">
          {dispatch.body}
        </p>
      ) : null}

      {/* REFS — small mono chips */}
      {dispatch.refs && dispatch.refs.length > 0 ? (
        <ul className="flex flex-wrap items-baseline gap-1.5 mt-2">
          {dispatch.refs.map((r) => (
            <li
              key={r}
              className="font-instr text-[9px] tabular-nums text-press border-[0.5px] border-press/40 px-1 py-0.5"
            >
              {r}
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  )
}

// ────────────────────────────────────────────────────────────────────────
// Debate dual-column block — only renders while active
// ────────────────────────────────────────────────────────────────────────

function DebateBlock({ debate }: { debate: WireDebate }) {
  return (
    <section
      className="mb-6 border-[1.5px] border-press"
      aria-label="Active debate"
    >
      <header className="px-3 py-2 border-b-[1px] border-press bg-press-wash/5 flex items-baseline gap-2">
        <span aria-hidden="true" className="font-instr text-[10px] uppercase tracking-kicker text-press">
          ── DEBATE ──
        </span>
        <p className="font-body text-[11px] text-paper truncate flex-1" title={debate.topic}>
          {debate.topic}
        </p>
      </header>
      <div className="grid grid-cols-2">
        <DebateSide dispatch={debate.claimant} side="left" />
        <DebateSide dispatch={debate.opponent} side="right" />
      </div>
    </section>
  )
}

function DebateSide({
  dispatch,
  side,
}: {
  dispatch: WireDispatch
  side: 'left' | 'right'
}) {
  const tint = ROLE_TINT[dispatch.role]
  return (
    <div
      className={[
        'p-3',
        side === 'left' ? 'border-r-[0.5px] border-press/40' : '',
      ].join(' ')}
    >
      <p className="flex items-baseline gap-1.5 mb-1.5">
        <span aria-hidden="true" className={`font-display text-[11px] font-[700] leading-none ${tint}`}>
          {dispatch.glyph}
        </span>
        <span className="font-instr text-[9px] uppercase tracking-kicker text-paper-ash3 truncate">
          {dispatch.agentName}
        </span>
      </p>
      {dispatch.body ? (
        <p className="font-body text-[11px] leading-[1.45] text-paper/85">
          {dispatch.body}
        </p>
      ) : null}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────
// utils
// ────────────────────────────────────────────────────────────────────────

function formatTime(iso: string): string {
  try {
    return new Date(iso).toISOString().slice(11, 19)
  } catch {
    return '--:--:--'
  }
}
