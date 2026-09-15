/**
 * Frontpage — the central BMC 9-cell layout in the Editorial Boardroom.
 *
 * Maps the canonical Osterwalder layout onto a 5-col × 3-row CSS Grid:
 *
 *   ┌─────┬─────┬─────┬─────┬─────┐
 *   │ KP  │ KA  │ VP  │ CR  │ CS  │   row 1
 *   │     ├─────┤     ├─────┤     │
 *   │     │ KR  │     │ CH  │     │   row 2
 *   ├─────┴─────┼─────┴─────┴─────┤
 *   │   COST    │     REVENUE      │   row 3
 *   └───────────┴───────────────────┘
 *
 * KP / VP / CS span 2 rows. Cost / Revenue span the bottom row across
 * 2 / 3 columns respectively.
 *
 * Each cell renders byline (Fraunces kicker) + body. Empty cells render
 * a "待编辑" hairline placeholder so the structure is legible even when
 * no agent has filed yet.
 */

import type { ReactNode } from 'react'
import type { AgentByline } from '@/shared/design-system/tokens-v2'

export type BmcDim =
  | 'KP' | 'KA' | 'KR' | 'VP' | 'CR' | 'CH' | 'CS' | 'COST' | 'REVENUE'

export interface BmcCell {
  dim: BmcDim
  /** Fraunces kicker label rendered above body. */
  label: string
  /** Optional byline tint (per-agent kicker color). */
  byline?: AgentByline
  /** Optional agent name + timestamp ("market-agent · 12:34"). */
  attribution?: string
  /** Body content (may include citation marks). */
  content?: ReactNode
}

const DIM_AREA: Record<BmcDim, string> = {
  KP:      'kp',
  KA:      'ka',
  KR:      'kr',
  VP:      'vp',
  CR:      'cr',
  CH:      'ch',
  CS:      'cs',
  COST:    'cost',
  REVENUE: 'revenue',
}

const BYLINE_COLOR: Record<AgentByline, string> = {
  market:      'text-byline-market',
  product:     'text-byline-product',
  finance:     'text-byline-finance',
  critic:      'text-byline-critic',
  synthesizer: 'text-byline-synthesizer',
}

interface FrontpageProps {
  cells: BmcCell[]
}

export function Frontpage({ cells }: FrontpageProps) {
  const cellMap = new Map(cells.map((c) => [c.dim, c]))
  const allDims: BmcDim[] = ['KP', 'KA', 'KR', 'VP', 'CR', 'CH', 'CS', 'COST', 'REVENUE']

  return (
    <section
      className="bg-grain-ink relative h-full"
      aria-label="Business Model Canvas frontpage"
    >
      <div
        className="grid h-full gap-px relative z-[1]"
        style={{
          gridTemplateColumns: 'repeat(5, 1fr)',
          gridTemplateRows: '1fr 1fr 0.85fr',
          gridTemplateAreas: `
            "kp ka vp cr cs"
            "kp kr vp ch cs"
            "cost cost revenue revenue revenue"
          `,
        }}
      >
        {allDims.map((dim) => {
          const cell = cellMap.get(dim) ?? { dim, label: dim, content: null }
          return (
            <FrontpageCell
              key={dim}
              cell={cell}
              area={DIM_AREA[dim]}
            />
          )
        })}
      </div>
    </section>
  )
}

interface FrontpageCellProps {
  cell: BmcCell
  area: string
}

function FrontpageCell({ cell, area }: FrontpageCellProps) {
  const tint = cell.byline ? BYLINE_COLOR[cell.byline] : 'text-paper-ash3'
  const empty = !cell.content

  return (
    <article
      style={{ gridArea: area }}
      className={[
        'border-[0.5px] border-ink-ash3/16',
        'bg-ink-ash1/50',
        'p-4 flex flex-col gap-3',
        'overflow-hidden',
        empty ? 'opacity-60' : 'animate-editorial-publish',
      ].join(' ')}
    >
      {/* Byline kicker */}
      <header className="flex items-baseline justify-between gap-2 border-b-[0.5px] border-ink-ash3/16 pb-2">
        <span
          className={`font-display text-[11px] uppercase tracking-kicker font-[600] ${tint}`}
        >
          {cell.label}
        </span>
        {cell.attribution ? (
          <span className="font-instr text-[10px] tabular-nums text-ink-ash4 truncate">
            {cell.attribution}
          </span>
        ) : null}
      </header>

      {/* Body */}
      <div className="flex-1 font-body text-[13px] text-paper/85 leading-[1.5] max-w-measure-cell">
        {empty ? (
          <span className="font-instr text-[10px] uppercase tracking-kicker text-ink-ash4">
            待编辑
          </span>
        ) : (
          cell.content
        )}
      </div>
    </article>
  )
}
