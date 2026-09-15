'use client'

/**
 * Wire — right column "通讯线", live transcript of agent dispatches.
 *
 * Each entry is a styled paragraph with timestamp + agent kicker (in
 * Fraunces) + body (in Geist). When debate is active the column splits
 * into 2 sub-columns "对仗" — left = agent, right = opponent — to make
 * the back-and-forth visible at a glance.
 *
 * Auto-scrolls to the most recent dispatch. Honors prefers-reduced-motion
 * via the v2 motion stack (publish 80ms slide-up).
 */

import { useEffect, useRef } from 'react'
import type { AgentByline } from '@/shared/design-system/tokens-v2'

export type WireDispatch = {
  id: string
  /** ISO timestamp; rendered as HH:MM:SS in mono. */
  occurredAt: string
  agentName: string
  /** Drives kicker color. */
  role: AgentByline
  /** "claim" | "rebuttal" | "concession" | etc. — short kind label, optional. */
  kind?: string
  body: string
  /** When provided, this dispatch is part of an opposing debate stream. */
  opponentOf?: string
  /** doc#chunk references rendered as small mono tags below body. */
  citations?: string[]
}

const ROLE_TINT: Record<AgentByline, string> = {
  market:      'text-byline-market',
  product:     'text-byline-product',
  finance:     'text-byline-finance',
  critic:      'text-byline-critic',
  synthesizer: 'text-byline-synthesizer',
}

interface WireProps {
  dispatches: WireDispatch[]
  /** When true, render debate dispatches in a 2-column duel layout. */
  debating?: boolean
}

export function Wire({ dispatches, debating = false }: WireProps) {
  const tailRef = useRef<HTMLDivElement | null>(null)

  // Auto-scroll to newest. Honors reduced-motion via 'auto' fallback below.
  useEffect(() => {
    const el = tailRef.current
    if (!el) return
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'end' })
  }, [dispatches.length])

  return (
    <aside
      aria-label="Live agent transcript"
      className="border-l-[1.5px] border-paper/80 bg-grain-ink relative h-full overflow-y-auto"
    >
      {/* Section kicker — sits sticky at the top so the reader always
          sees what they're looking at. */}
      <header className="sticky top-0 z-10 border-b-[0.5px] border-ink-ash3/16 bg-ink/95 backdrop-blur-[0px] px-4 py-3">
        <span className="font-instr text-[10px] uppercase tracking-kicker text-paper-ash3">
          ── WIRE · LIVE TRANSCRIPT
        </span>
      </header>

      {dispatches.length === 0 ? (
        <p className="font-instr text-[11px] uppercase tracking-kicker text-ink-ash4 px-4 py-6">
          (no dispatches yet)
        </p>
      ) : debating ? (
        <DebateColumns dispatches={dispatches} />
      ) : (
        <ol className="px-4 py-3 flex flex-col gap-5 relative z-[1]">
          {dispatches.map((d) => (
            <WireEntry key={d.id} dispatch={d} />
          ))}
        </ol>
      )}

      <div ref={tailRef} aria-hidden="true" />
    </aside>
  )
}

function DebateColumns({ dispatches }: { dispatches: WireDispatch[] }) {
  // Group dispatches by role: opponent on the right, primary on the left.
  // Empty cells aligned by index so the reader can read horizontally.
  const left = dispatches.filter((d) => !d.opponentOf)
  const right = dispatches.filter((d) => Boolean(d.opponentOf))
  return (
    <div className="px-4 py-3 grid grid-cols-2 gap-x-4 gap-y-5 relative z-[1]">
      <ol className="flex flex-col gap-5">
        {left.map((d) => (
          <WireEntry key={d.id} dispatch={d} />
        ))}
      </ol>
      <ol className="flex flex-col gap-5 border-l-[0.5px] border-ink-ash3/16 pl-4">
        {right.map((d) => (
          <WireEntry key={d.id} dispatch={d} />
        ))}
      </ol>
    </div>
  )
}

function WireEntry({ dispatch }: { dispatch: WireDispatch }) {
  const time = formatTime(dispatch.occurredAt)
  return (
    <li className="animate-editorial-publish flex flex-col gap-1 max-w-measure-body">
      <header className="flex items-baseline gap-3 border-b-[0.5px] border-ink-ash3/16 pb-1">
        <span className="font-instr text-[10px] tabular-nums text-ink-ash4">
          {time}
        </span>
        <span
          className={`font-display text-[11px] uppercase tracking-kicker font-[600] ${ROLE_TINT[dispatch.role]}`}
        >
          {dispatch.agentName}
        </span>
        {dispatch.kind ? (
          <span className="font-instr text-[10px] uppercase tracking-kicker text-ink-ash4">
            · {dispatch.kind}
          </span>
        ) : null}
      </header>

      <p className="font-body text-[13px] text-paper/85 leading-[1.55]">
        {dispatch.body}
      </p>

      {dispatch.citations?.length ? (
        <p className="font-instr text-[10px] tabular-nums text-ink-ash4">
          refs:{' '}
          {dispatch.citations.map((c, i) => (
            <span key={c}>
              {i > 0 ? ', ' : ''}
              {c}
            </span>
          ))}
        </p>
      ) : null}
    </li>
  )
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toISOString().slice(11, 19) // HH:MM:SS
  } catch {
    return '--:--:--'
  }
}
