'use client'

/**
 * FloatingConductor — fixed bottom overlay with phase / round / token
 * readouts and HITL prompt. Floats over the canvas but inset 24 px
 * from the viewport edge to suggest "control panel sitting in the pit".
 *
 * Press-red left-edge bar fires only when HITL is pending — the only
 * red element on screen during a normal session.
 */

import type { ReactNode } from 'react'

export type ConductorPhase =
  | 'idle' | 'planning' | 'execution' | 'review' | 'decision' | 'completed'

const PHASE_LABEL: Record<ConductorPhase, string> = {
  idle:       '待机',
  planning:   '规划',
  execution:  '执行',
  review:     '审议',
  decision:   '裁决',
  completed:  '完成',
}

interface FloatingConductorProps {
  phase: ConductorPhase
  round: number
  tokenUsage?: string
  elapsedSec?: number
  hitlPending?: boolean
  actions?: ReactNode
}

export function FloatingConductor({
  phase,
  round,
  tokenUsage,
  elapsedSec,
  hitlPending,
  actions,
}: FloatingConductorProps) {
  return (
    <footer
      role="toolbar"
      aria-label="Session conductor"
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[40] pointer-events-auto"
    >
      <div
        className={[
          'flex items-center gap-6 px-6 py-2.5 bg-ink-ash1',
          'border-[1px] border-paper/30',
          hitlPending ? 'border-l-[4px] border-l-press' : '',
        ].join(' ')}
      >
        {/* Phase + round */}
        <div className="flex items-baseline gap-3">
          <span className="font-instr text-[10px] uppercase tracking-kicker text-paper-ash3">
            PHASE
          </span>
          <span
            className={[
              'font-display text-[16px] font-[700] leading-none',
              hitlPending ? 'text-press' : 'text-paper',
            ].join(' ')}
          >
            {PHASE_LABEL[phase]}
          </span>
          <span className="font-instr text-[10px] tabular-nums text-ink-ash4">
            · ROUND {round}
          </span>
        </div>

        <span className="h-4 w-px bg-paper/20" aria-hidden="true" />

        {/* Center — HITL pulse + actions */}
        <div className="flex items-center gap-3 min-w-0">
          {hitlPending ? (
            <span className="font-instr text-[11px] uppercase tracking-kicker text-press">
              ── AWAITING DECISION ──
            </span>
          ) : null}
          {actions ?? null}
        </div>

        {/* Right — readouts */}
        <div className="flex items-baseline gap-5 ml-auto">
          {typeof elapsedSec === 'number' ? (
            <span className="font-instr text-[10px] tabular-nums text-ink-ash4">
              <span className="text-paper-ash3">ELAPSED</span>{' '}
              {formatElapsed(elapsedSec)}
            </span>
          ) : null}
          {tokenUsage ? (
            <span className="font-instr text-[10px] tabular-nums text-ink-ash4">
              <span className="text-paper-ash3">TOK</span> {tokenUsage}
            </span>
          ) : null}
        </div>
      </div>
    </footer>
  )
}

function formatElapsed(sec: number): string {
  const total = Math.max(0, Math.floor(sec))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}
