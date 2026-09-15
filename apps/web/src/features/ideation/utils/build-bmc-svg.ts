/**
 * Build a paper-ready SVG of the BMC 9-grid from a mapping result.
 *
 * Independent from the React UI — produces a self-contained 1280×720 SVG
 * suitable for pasting into LaTeX figures or slide decks. The SVG includes
 * a footer with timestamp + provenance ("generated heuristically") so a
 * reviewer can tell at a glance:
 *   - which date the snapshot is from
 *   - whether the mapping was LLM- or rule-based (currently rule-based only)
 *
 * Why we hand-build SVG rather than DOM-screenshot via html-to-image:
 *   - Matrix output: paper figures must be vector (SVG/PDF), not raster
 *   - Tailwind has rendering quirks under html-to-image (custom utility
 *     classes don't always inline cleanly)
 *   - Predictable layout decoupled from the live UI
 *   - Zero new dependencies
 *
 * Color tokens are hard-coded as hex / rgba so the SVG renders identically
 * regardless of where it's loaded.
 */

import { CC_BMC_DOMAINS, type CCBMCDomain } from '@/types/macra'
import { IDEATION_HUE } from '@/features/comfy/components/canvas-design-tokens'
import {
  BMC_ABBR,
  type BmcMappingResult,
  type MappedNode
} from './ideation-to-bmc-mapping'

// =============================================================================
// Layout constants — fixed canvas, fixed cells (no responsive math)
// =============================================================================

const CANVAS_W = 1280
const CANVAS_H = 720
const PAD = 24
const HEADER_H = 60
const FOOTER_H = 56
const GAP = 8

// Grid bounds: between the header and footer
const GRID_X = PAD
const GRID_Y = PAD + HEADER_H + 16
const GRID_W = CANVAS_W - PAD * 2
const GRID_H = CANVAS_H - GRID_Y - FOOTER_H - PAD

// 5×3 layout. Each cell width/height in grid units.
const COL_W = (GRID_W - GAP * 4) / 5
const ROW_H = (GRID_H - GAP * 2) / 3

interface CellSpec {
  domain: CCBMCDomain
  label: string
  /** column 1-5 */
  col: number
  /** row 1-3 */
  row: number
  /** 1 = single, 2 = rowspan, 'wide-2' / 'wide-3' = colspan */
  span: 1 | 'rowspan' | 'col-2' | 'col-3'
}

const CELLS: CellSpec[] = [
  { domain: CC_BMC_DOMAINS.KEY_PARTNERSHIPS, label: '重要合作', col: 1, row: 1, span: 'rowspan' },
  { domain: CC_BMC_DOMAINS.KEY_ACTIVITIES, label: '关键业务', col: 2, row: 1, span: 1 },
  { domain: CC_BMC_DOMAINS.KEY_RESOURCES, label: '核心资源', col: 2, row: 2, span: 1 },
  { domain: CC_BMC_DOMAINS.VALUE_PROPOSITIONS, label: '价值主张', col: 3, row: 1, span: 'rowspan' },
  { domain: CC_BMC_DOMAINS.CUSTOMER_RELATIONSHIPS, label: '客户关系', col: 4, row: 1, span: 1 },
  { domain: CC_BMC_DOMAINS.CHANNELS, label: '渠道通路', col: 4, row: 2, span: 1 },
  { domain: CC_BMC_DOMAINS.CUSTOMER_SEGMENTS, label: '客户细分', col: 5, row: 1, span: 'rowspan' },
  { domain: CC_BMC_DOMAINS.COST_STRUCTURE, label: '成本结构', col: 1, row: 3, span: 'col-2' },
  { domain: CC_BMC_DOMAINS.REVENUE_STREAMS, label: '收入来源', col: 3, row: 3, span: 'col-3' }
]

function cellRect(cell: CellSpec): { x: number; y: number; w: number; h: number } {
  const x = GRID_X + (cell.col - 1) * (COL_W + GAP)
  const y = GRID_Y + (cell.row - 1) * (ROW_H + GAP)
  let w = COL_W
  let h = ROW_H
  if (cell.span === 'rowspan') h = ROW_H * 2 + GAP
  if (cell.span === 'col-2') w = COL_W * 2 + GAP
  if (cell.span === 'col-3') w = COL_W * 3 + GAP * 2
  return { x, y, w, h }
}

// =============================================================================
// Color tokens (hex/rgba — Tailwind classes don't apply inside an SVG)
// =============================================================================

const COLORS = {
  bgGradientFrom: '#020617',
  bgGradientTo: '#0F172A',
  cellFillCovered: 'rgba(15, 23, 42, 0.55)',
  cellFillEmpty: 'rgba(15, 23, 42, 0.32)',
  cellStrokeCovered: 'rgba(255, 255, 255, 0.10)',
  cellStrokeEmpty: 'rgba(255, 255, 255, 0.05)',
  textWhite: '#FFFFFF',
  textSlate200: '#E2E8F0',
  textSlate400: '#94A3B8',
  textSlate500: '#64748B',
  textSlate600: '#475569',
  textSlate700: '#334155',
  cyan300: '#67E8F9',
  cyan300_a80: 'rgba(103, 232, 249, 0.80)',
  cyan300_a60: 'rgba(103, 232, 249, 0.60)',
  amber300_a50: 'rgba(252, 211, 77, 0.50)',
  amber300_a80: 'rgba(252, 211, 77, 0.80)',
  emerald300_a80: 'rgba(110, 231, 183, 0.80)'
}

// =============================================================================
// SVG primitives
// =============================================================================

/** Escape XML special chars in user-supplied text. */
function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** Truncate a string to N chars with an ellipsis. */
function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s
}

// =============================================================================
// Cell rendering
// =============================================================================

function renderCell(cell: CellSpec, mapped: MappedNode[]): string {
  const { x, y, w, h } = cellRect(cell)
  const isCovered = mapped.length > 0
  const stroke = isCovered ? COLORS.cellStrokeCovered : COLORS.cellStrokeEmpty
  const fill = isCovered ? COLORS.cellFillCovered : COLORS.cellFillEmpty
  const headerColor = isCovered ? COLORS.cyan300_a80 : COLORS.textSlate600
  const titleColor = isCovered ? COLORS.textWhite : COLORS.textSlate500
  const countColor = isCovered ? 'rgba(255, 255, 255, 0.70)' : COLORS.textSlate600

  const inner = renderCellBody({ x, y, w, h, mapped, isCovered })

  return `
  <g class="bmc-cell">
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" ry="12"
          fill="${fill}" stroke="${stroke}" stroke-width="1" />
    <text x="${x + 12}" y="${y + 22}" font-family="ui-monospace, Menlo, monospace"
          font-size="10" font-weight="500" fill="${headerColor}"
          letter-spacing="2.2px">${BMC_ABBR[cell.domain]}</text>
    <text x="${x + 36}" y="${y + 22}" font-size="13" font-weight="600"
          fill="${titleColor}">${xmlEscape(cell.label)}</text>
    <text x="${x + w - 12}" y="${y + 22}" font-family="ui-monospace, Menlo, monospace"
          font-size="11" fill="${countColor}" text-anchor="end">
      ${mapped.length.toString().padStart(2, '0')}
    </text>
    ${inner}
  </g>`
}

function renderCellBody({
  x,
  y,
  w,
  h,
  mapped,
  isCovered
}: {
  x: number
  y: number
  w: number
  h: number
  mapped: MappedNode[]
  isCovered: boolean
}): string {
  if (!isCovered) {
    return `
    <text x="${x + w / 2}" y="${y + h / 2 + 4}" font-size="22"
          fill="${COLORS.textSlate700}" text-anchor="middle">—</text>
    <text x="${x + w / 2}" y="${y + h / 2 + 22}" font-family="ui-monospace, Menlo, monospace"
          font-size="9" letter-spacing="2.2px"
          fill="${COLORS.amber300_a50}" text-anchor="middle">GAP</text>`
  }

  // Sort by weight desc, take up to N pills based on cell height
  const maxPills = Math.max(2, Math.floor((h - 36) / 28))
  const sorted = [...mapped].sort((a, b) => b.weight - a.weight)
  const visible = sorted.slice(0, maxPills)
  const overflow = sorted.length - visible.length

  const pillX = x + 8
  const pillW = w - 16
  let pillY = y + 36

  let pillsSvg = ''
  for (const m of visible) {
    pillsSvg += renderPill({ x: pillX, y: pillY, w: pillW, node: m })
    pillY += 26
  }
  if (overflow > 0) {
    pillsSvg += `
    <text x="${x + w - 12}" y="${y + h - 8}" font-family="ui-monospace, Menlo, monospace"
          font-size="9" letter-spacing="1.6px" fill="${COLORS.textSlate500}"
          text-anchor="end">+${overflow} more</text>`
  }
  return pillsSvg
}

function renderPill({
  x,
  y,
  w,
  node
}: {
  x: number
  y: number
  w: number
  node: MappedNode
}): string {
  const hue = IDEATION_HUE[node.kind] ?? IDEATION_HUE['core-idea']
  const lowConfidence = node.weight < 0.7

  // Approximate char-fitting: 11px font ≈ 7px per latin / 11px per CJK
  // Conservative truncate at (w - 24) / 7 latin OR (w - 24) / 11 CJK
  const charBudget = Math.max(8, Math.floor((w - 24) / 9))
  const labelText = truncate(node.label, charBudget)

  return `
  <g>
    <rect x="${x}" y="${y}" width="${w}" height="22" rx="6" ry="6"
          fill="rgba(2, 6, 23, 0.50)" stroke="rgba(255, 255, 255, 0.06)" stroke-width="1" />
    <rect x="${x}" y="${y}" width="2" height="22" fill="${hue.hex}" />
    <text x="${x + 8}" y="${y + 14}" font-size="11" font-weight="500"
          fill="${COLORS.textWhite}">${xmlEscape(labelText)}</text>
    ${
      lowConfidence
        ? `<text x="${x + w - 8}" y="${y + 14}" font-family="ui-monospace, Menlo, monospace"
                font-size="10" fill="${COLORS.textSlate500}" text-anchor="end">~</text>`
        : ''
    }
  </g>`
}

// =============================================================================
// Header + footer
// =============================================================================

function renderHeader(result: BmcMappingResult): string {
  const { coverage } = result
  const gaps = coverage.total - coverage.covered

  // Brand cluster on the left
  const brandX = PAD
  const brandY = PAD + 32
  // Coverage cluster on the right
  const covX = CANVAS_W - PAD
  const covY = brandY

  const dotsX = covX - 200
  const dotsY = covY - 20

  // 9 LEDs
  let dotsSvg = ''
  coverage.perDimension.forEach((d, i) => {
    const dotX = dotsX + i * 20
    const fill = d.covered ? COLORS.cyan300 : 'transparent'
    const stroke = d.covered ? COLORS.cyan300 : COLORS.textSlate700
    dotsSvg += `<circle cx="${dotX}" cy="${dotsY}" r="3" fill="${fill}" stroke="${stroke}" stroke-width="1" />`
    dotsSvg += `<text x="${dotX}" y="${dotsY + 14}" font-family="ui-monospace, Menlo, monospace"
                  font-size="8" letter-spacing="1.4px"
                  fill="${d.covered ? COLORS.cyan300_a80 : COLORS.textSlate600}"
                  text-anchor="middle">${BMC_ABBR[d.domain]}</text>`
  })

  return `
  <g class="bmc-header">
    <text x="${brandX}" y="${brandY - 14}" font-family="ui-monospace, Menlo, monospace"
          font-size="9" letter-spacing="2.4px" fill="${COLORS.textSlate500}">
      STARLINK · IDEATION
    </text>
    <text x="${brandX}" y="${brandY + 8}" font-size="20" font-weight="600" fill="${COLORS.textWhite}">
      BMC Projection
    </text>
    <text x="${covX}" y="${brandY - 14}" font-family="ui-monospace, Menlo, monospace"
          font-size="9" letter-spacing="2.4px" fill="${COLORS.textSlate500}"
          text-anchor="end">9-DIM Coverage</text>
    <text x="${covX}" y="${brandY + 8}" font-family="ui-monospace, Menlo, monospace"
          font-size="13" fill="${COLORS.textWhite}" text-anchor="end">
      <tspan fill="${COLORS.cyan300}">${coverage.covered}</tspan>
      <tspan fill="${COLORS.textSlate700}"> / </tspan>
      <tspan>${coverage.total}</tspan>
      <tspan fill="${COLORS.textSlate500}"> covered  ·  </tspan>
      <tspan fill="${gaps > 0 ? COLORS.amber300_a80 : COLORS.emerald300_a80}">${gaps}</tspan>
      <tspan fill="${COLORS.textSlate500}"> gaps</tspan>
    </text>
    ${dotsSvg}
    <line x1="${PAD}" y1="${PAD + HEADER_H}" x2="${CANVAS_W - PAD}" y2="${PAD + HEADER_H}"
          stroke="rgba(255, 255, 255, 0.06)" stroke-width="1" />
  </g>`
}

function renderFooter(result: BmcMappingResult, totalNodeCount: number): string {
  const y = CANVAS_H - PAD - FOOTER_H + 24
  const dateStr = new Date()
    .toISOString()
    .replace('T', ' ')
    .replace(/:\d{2}\..*$/, '')
  const reflectionsCount = result.reflections.length
  const unmappedCount = result.unmapped.length

  return `
  <g class="bmc-footer">
    <line x1="${PAD}" y1="${y - 12}" x2="${CANVAS_W - PAD}" y2="${y - 12}"
          stroke="rgba(255, 255, 255, 0.06)" stroke-width="1" />
    <text x="${PAD}" y="${y + 8}" font-family="ui-monospace, Menlo, monospace"
          font-size="10" letter-spacing="1.6px" fill="${COLORS.textSlate500}">
      <tspan fill="${COLORS.textSlate400}">STARLINK · IDEATION</tspan>
      <tspan fill="${COLORS.textSlate700}">  ·  </tspan>
      <tspan>${dateStr} UTC</tspan>
      <tspan fill="${COLORS.textSlate700}">  ·  </tspan>
      <tspan>${totalNodeCount} nodes</tspan>
      ${reflectionsCount > 0 ? `<tspan fill="${COLORS.textSlate700}">  ·  </tspan><tspan>${reflectionsCount} reflections (off-grid)</tspan>` : ''}
      ${unmappedCount > 0 ? `<tspan fill="${COLORS.textSlate700}">  ·  </tspan><tspan fill="${COLORS.amber300_a80}">${unmappedCount} unlinked</tspan>` : ''}
    </text>
    <text x="${CANVAS_W - PAD}" y="${y + 8}" font-family="ui-monospace, Menlo, monospace"
          font-size="10" letter-spacing="1.6px"
          fill="${COLORS.textSlate600}" text-anchor="end">
      generated heuristically · v1
    </text>
  </g>`
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Render a paper-ready SVG of the BMC view.
 *
 * @param result   the heuristic mapping result computed by `mapIdeationToBmc`
 * @param totalNodeCount  total number of ideation nodes (passed separately
 *                 because `result` doesn't know unmapped vs. excluded counts)
 * @returns        a complete `<svg>...</svg>` string suitable for inline
 *                 embedding or download
 */
export function buildBmcSvg(
  result: BmcMappingResult,
  totalNodeCount: number
): string {
  const cellsSvg = CELLS.map((c) =>
    renderCell(c, result.byDimension[c.domain])
  ).join('')

  // Page background uses a subtle radial — defined once, applied as fill
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS_W}" height="${CANVAS_H}"
viewBox="0 0 ${CANVAS_W} ${CANVAS_H}" font-family="-apple-system, system-ui, 'Segoe UI', sans-serif">
  <defs>
    <linearGradient id="bmc-bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${COLORS.bgGradientFrom}" />
      <stop offset="50%" stop-color="${COLORS.bgGradientTo}" />
      <stop offset="100%" stop-color="${COLORS.bgGradientFrom}" />
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#bmc-bg)" />
  ${renderHeader(result)}
  ${cellsSvg}
  ${renderFooter(result, totalNodeCount)}
</svg>`
}
