'use client'

import { useMemo, useState } from 'react'
import { Download, FileImage, Loader2 } from 'lucide-react'
import { CC_BMC_DOMAINS, type CCBMCDomain } from '@/types/macra'
import { IDEATION_HUE, TOKENS } from '@/features/comfy/components/canvas-design-tokens'
import { useIdeationStore } from '../store/ideation-store'
import {
  BMC_ABBR,
  mapIdeationToBmc,
  type MappedNode
} from '../utils/ideation-to-bmc-mapping'
import { buildBmcSvg } from '../utils/build-bmc-svg'
import { downloadPng, downloadSvg } from '../utils/download-bmc'

/**
 * Ideation → BMC 9-grid output view.
 *
 * Bridges the Meflex-style ideation canvas to the canonical CC-BMC framework
 * for paper-friendly export + at-a-glance coverage check. Mapping logic lives
 * in `utils/ideation-to-bmc-mapping.ts` (heuristic, instant, no LLM).
 *
 * Visual treatment uses the established Stellar Cartographer tokens:
 *   - slate-900/40 cells with 1-px white/[0.08] borders (no glow)
 *   - mono kicker labels (10px tracking 0.22em)
 *   - hue-tinted left edge per ideation kind on the inner pills
 *   - empty cells render a faint "—" + GAP label so coverage gaps are
 *     visually loud without being alarming
 *
 * Layout reuses the proven 5-col × 3-row BMC layout (rowspan-2 for
 * KP/VP/CS, split bottom row for cost vs revenue).
 */

const D = CC_BMC_DOMAINS

interface CellLayout {
  domain: CCBMCDomain
  /** Chinese label */
  label: string
  /** css `gridRow` value (e.g. "1 / span 2") */
  row: string
  /** css `gridColumn` value */
  col: string
}

const GRID_LAYOUT: CellLayout[] = [
  { domain: D.KEY_PARTNERSHIPS, label: '重要合作', row: '1 / span 2', col: '1' },
  { domain: D.KEY_ACTIVITIES, label: '关键业务', row: '1', col: '2' },
  { domain: D.KEY_RESOURCES, label: '核心资源', row: '2', col: '2' },
  { domain: D.VALUE_PROPOSITIONS, label: '价值主张', row: '1 / span 2', col: '3' },
  { domain: D.CUSTOMER_RELATIONSHIPS, label: '客户关系', row: '1', col: '4' },
  { domain: D.CHANNELS, label: '渠道通路', row: '2', col: '4' },
  { domain: D.CUSTOMER_SEGMENTS, label: '客户细分', row: '1 / span 2', col: '5' },
  { domain: D.COST_STRUCTURE, label: '成本结构', row: '3', col: '1 / span 2' },
  { domain: D.REVENUE_STREAMS, label: '收入来源', row: '3', col: '3 / span 3' }
]

export function IdeationBmcView() {
  const nodes = useIdeationStore((s) => s.nodes)
  const edges = useIdeationStore((s) => s.edges)
  const openInspector = useIdeationStore((s) => s.openInspector)

  const result = useMemo(() => mapIdeationToBmc(nodes, edges), [nodes, edges])
  const totalNodeCount = nodes.length

  return (
    <div className="flex h-full w-full flex-col gap-3 overflow-hidden p-4">
      <CoverageScorecard result={result} totalNodeCount={totalNodeCount} />
      {/* The 9-grid */}
      <div
        className="grid min-h-0 flex-1 gap-2"
        style={{
          gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
          gridTemplateRows: 'repeat(3, minmax(0, 1fr))'
        }}
      >
        {GRID_LAYOUT.map((cell) => (
          <BmcCell
            key={cell.domain}
            cell={cell}
            mapped={result.byDimension[cell.domain]}
            onPillClick={openInspector}
          />
        ))}
      </div>
      {/* Reflections / unmapped strip */}
      {(result.reflections.length > 0 || result.unmapped.length > 0) && (
        <BottomLedger
          reflections={result.reflections}
          unmapped={result.unmapped}
          onPillClick={openInspector}
        />
      )}
    </div>
  )
}

// =============================================================================
// Coverage scorecard — instrument-panel readout above the grid
// =============================================================================

function CoverageScorecard({
  result,
  totalNodeCount
}: {
  result: ReturnType<typeof mapIdeationToBmc>
  totalNodeCount: number
}) {
  const { coverage } = result
  const gapCount = coverage.total - coverage.covered
  const [pngBusy, setPngBusy] = useState(false)

  const handleSvg = () => {
    const svg = buildBmcSvg(result, totalNodeCount)
    downloadSvg(svg)
  }
  const handlePng = async () => {
    if (pngBusy) return
    setPngBusy(true)
    try {
      const svg = buildBmcSvg(result, totalNodeCount)
      await downloadPng(svg)
    } catch (err) {
      console.error('[bmc-export] PNG render failed', err)
      // Fall back to SVG so the user always gets something
      const svg = buildBmcSvg(result, totalNodeCount)
      downloadSvg(svg)
    } finally {
      setPngBusy(false)
    }
  }
  const exportDisabled = totalNodeCount === 0

  return (
    <div className="flex shrink-0 items-center gap-4 rounded-lg border border-white/[0.08] bg-slate-950/40 px-4 py-2.5">
      <div className="flex flex-col leading-tight">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-slate-500">
          9-DIM Coverage
        </p>
        <p className="font-mono text-[12px] tabular-nums text-white">
          <span className="text-cyan-300">{coverage.covered}</span>
          <span className="mx-1 text-slate-700">/</span>
          {coverage.total}
          <span className="ml-3 text-slate-500">covered</span>
          <span className="mx-2 text-slate-700">·</span>
          <span className={gapCount > 0 ? 'text-amber-300/80' : 'text-emerald-300/80'}>
            {gapCount}
          </span>
          <span className="ml-1 text-slate-500">gaps</span>
        </p>
      </div>
      {/* LED dot row — one per dim, in canonical reading order */}
      <div className="flex items-center gap-2">
        {coverage.perDimension.map((d) => (
          <span
            key={d.domain}
            className="flex flex-col items-center gap-0.5"
            title={`${d.domain} · ${d.count} 个节点`}
          >
            <span
              className={`block h-1.5 w-1.5 rounded-full ${
                d.covered ? 'bg-cyan-300' : 'bg-slate-700 ring-1 ring-slate-600'
              }`}
              aria-hidden
            />
            <span
              className={`font-mono text-[9px] uppercase tracking-[0.16em] tabular-nums ${
                d.covered ? 'text-cyan-300/70' : 'text-slate-600'
              }`}
            >
              {BMC_ABBR[d.domain]}
            </span>
          </span>
        ))}
      </div>
      {/* Export cluster — paper-figure exporter */}
      <div className="ml-auto flex items-center gap-1">
        <button
          type="button"
          onClick={handleSvg}
          disabled={exportDisabled}
          className={`${TOKENS.button.ghost} disabled:opacity-40 disabled:cursor-not-allowed`}
          aria-label="导出 SVG（论文用矢量）"
          title="导出 SVG · 用于 LaTeX / Inkscape / 矢量编辑"
        >
          <FileImage className="h-3.5 w-3.5" strokeWidth={1.75} />
          SVG
        </button>
        <button
          type="button"
          onClick={handlePng}
          disabled={exportDisabled || pngBusy}
          className={`${TOKENS.button.primary} disabled:opacity-50 disabled:cursor-not-allowed`}
          aria-label="导出 PNG（演示 / 博客）"
          title="导出 PNG @2x · 用于幻灯片 / 博客 / 文档"
        >
          {pngBusy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
          ) : (
            <Download className="h-3.5 w-3.5" strokeWidth={2} />
          )}
          PNG
        </button>
      </div>
    </div>
  )
}

// =============================================================================
// 9-grid cell
// =============================================================================

function BmcCell({
  cell,
  mapped,
  onPillClick
}: {
  cell: CellLayout
  mapped: MappedNode[]
  onPillClick: (id: string) => void
}) {
  const isCovered = mapped.length > 0
  return (
    <section
      className={`flex min-h-0 flex-col gap-1.5 overflow-hidden rounded-xl border bg-slate-900/40 p-2.5 transition-colors ${
        isCovered ? 'border-white/[0.10]' : 'border-white/[0.05] bg-slate-900/20'
      }`}
      style={{ gridRow: cell.row, gridColumn: cell.col }}
    >
      <header className="flex shrink-0 items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-2 min-w-0">
          <span
            className={`font-mono text-[9px] uppercase tracking-[0.22em] ${
              isCovered ? 'text-cyan-300/80' : 'text-slate-600'
            }`}
          >
            {BMC_ABBR[cell.domain]}
          </span>
          <h3 className="truncate text-[12px] font-semibold text-white">
            {cell.label}
          </h3>
        </div>
        <span
          className={`shrink-0 font-mono text-[10px] tabular-nums ${
            isCovered ? 'text-white/70' : 'text-slate-600'
          }`}
        >
          {mapped.length.toString().padStart(2, '0')}
        </span>
      </header>
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
        {isCovered ? (
          mapped
            .slice() // don't mutate caller
            .sort((a, b) => b.weight - a.weight)
            .map((m) => (
              <NodePill key={`${m.id}-${cell.domain}`} node={m} onClick={() => onPillClick(m.id)} />
            ))
        ) : (
          <EmptyGap />
        )}
      </div>
    </section>
  )
}

function NodePill({ node, onClick }: { node: MappedNode; onClick: () => void }) {
  const hue = IDEATION_HUE[node.kind] ?? IDEATION_HUE['core-idea']
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-start gap-1.5 rounded-md border border-white/[0.06] bg-slate-950/50 p-1.5 text-left transition-colors hover:border-white/[0.16] hover:bg-slate-950/70"
      style={{ borderLeft: `2px solid ${hue.hex}` }}
      aria-label={`${node.label} - 打开编辑器`}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] font-medium text-white">{node.label}</p>
        {node.content && (
          <p className="line-clamp-2 text-[10px] leading-snug text-slate-400">
            {node.content}
          </p>
        )}
      </div>
      {node.weight < 0.7 && (
        <span
          className="shrink-0 font-mono text-[9px] uppercase tracking-[0.16em] text-slate-500"
          title={`置信度 ${Math.round(node.weight * 100)}%`}
        >
          ~
        </span>
      )}
    </button>
  )
}

function EmptyGap() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1 py-2 text-center">
      <span className="font-mono text-[20px] leading-none text-slate-700">—</span>
      <span className="font-mono text-[9px] uppercase tracking-[0.22em] text-amber-300/50">
        gap
      </span>
    </div>
  )
}

// =============================================================================
// Bottom ledger — reflections + unmapped nodes (strip beneath the grid)
// =============================================================================

function BottomLedger({
  reflections,
  unmapped,
  onPillClick
}: {
  reflections: MappedNode[]
  unmapped: MappedNode[]
  onPillClick: (id: string) => void
}) {
  return (
    <div className={`shrink-0 ${TOKENS.surface.panel} px-3 py-2`}>
      <div className="flex items-start gap-4">
        {reflections.length > 0 && (
          <LedgerColumn
            kicker="Reflections (off-grid)"
            count={reflections.length}
            nodes={reflections}
            onPillClick={onPillClick}
          />
        )}
        {unmapped.length > 0 && (
          <LedgerColumn
            kicker="Unlinked"
            count={unmapped.length}
            nodes={unmapped}
            onPillClick={onPillClick}
            warning
          />
        )}
      </div>
    </div>
  )
}

function LedgerColumn({
  kicker,
  count,
  nodes,
  onPillClick,
  warning
}: {
  kicker: string
  count: number
  nodes: MappedNode[]
  onPillClick: (id: string) => void
  warning?: boolean
}) {
  return (
    <div className="min-w-0 flex-1">
      <p className="mb-1 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em]">
        <span className={warning ? 'text-amber-300/80' : 'text-slate-500'}>
          {kicker}
        </span>
        <span className="tabular-nums text-slate-500">{count.toString().padStart(2, '0')}</span>
      </p>
      <div className="flex flex-wrap gap-1">
        {nodes.slice(0, 6).map((n) => (
          <button
            key={n.id}
            type="button"
            onClick={() => onPillClick(n.id)}
            className="rounded border border-white/[0.06] bg-slate-950/50 px-1.5 py-0.5 text-[10px] text-slate-300 transition-colors hover:border-white/[0.16] hover:text-white"
          >
            {n.label.slice(0, 16)}
          </button>
        ))}
      </div>
    </div>
  )
}
