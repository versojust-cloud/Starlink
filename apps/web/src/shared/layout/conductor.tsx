/**
 * Conductor — bottom strip "指挥台". Houses the session controls
 * (start / pause), HITL approval prompts, current phase indicator,
 * and token-usage readout.
 *
 * Visual model: orchestra pit. Single horizontal row, mono labels,
 * tabular-num readouts. When HITL is pending the entire row gains a
 * single press-red accent (left edge bar) — the only place red shows
 * in a normal session.
 */

import type { ReactNode } from 'react'

export type ConductorPhase = 'idle' | 'planning' | 'execution' | 'review' | 'decision' | 'completed'

const PHASE_LABEL: Record<ConductorPhase, string> = {
  idle:       '待机',
  planning:   '规划',
  execution:  '执行',
  review:     '审议',
  decision:   '裁决',
  completed:  '完成',
}

interface ConductorProps {
  phase: ConductorPhase
  /** Cumulative round number (0-3 typical). */
  round: number
  /** Token usage display ("3.5k / 200k"). */
  tokenUsage?: string
  /** Elapsed seconds since session start. */
  elapsedSec?: number
  /** When set, renders the HITL pending indicator + an inline action slot. */
  hitlPending?: boolean
  /** Action area — caller-supplied buttons (start / pause / approve etc). */
  actions?: ReactNode
}

export function Conductor({
  phase,
  round,
  tokenUsage,
  elapsedSec,
  hitlPending,
  actions,
}: ConductorProps) {
  return (
    <footer
      role="toolbar"
      aria-label="Session conductor"
      className={[
        'border-t-[1.5px] border-paper/80',
        'bg-ink relative',
        hitlPending ? 'border-l-4 border-l-press' : '',
      ].join(' ')}
    >
      <div className="grid grid-cols-12 gap-6 px-8 py-3 items-center">
        {/* Phase + round — left side */}
        <div className="col-span-3 flex items-baseline gap-3">
          <span className="font-instr text-[10px] uppercase tracking-kicker text-paper-ash3">
            PHASE
          </span>
          <span
            className={[
              'font-display text-[18px] font-[700]',
              hitlPending ? 'text-press' : 'text-paper',
            ].join(' ')}
          >
            {PHASE_LABEL[phase]}
          </span>
          <span className="font-instr text-[10px] tabular-nums text-ink-ash4">
            · ROUND {round}
          </span>
        </div>

        {/* HITL message + actions — center */}
        <div className="col-span-6 flex items-center justify-center gap-4 min-w-0">
          {hitlPending ? (
            <span className="font-instr text-[11px] uppercase tracking-kicker text-press">
              ── AWAITING DECISION ──
            </span>
          ) : null}
          {actions ?? null}
        </div>

        {/* Readouts — right side */}
        <div className="col-span-3 flex items-baseline justify-end gap-5">
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
