/**
 * BMC generator renderer — market / product / finance-agent.
 *
 * The mention-router wraps the generated cards into a markdown summary like:
 *
 *   生成 3 张 market 维度卡片：
 *
 *   - **欧洲外贸客群细分**：## 欧洲外贸公司客户细分分析 ...
 *   - **决策链画像**：...
 *
 * That formatting is fine for plaintext but loses the cell-by-cell
 * structure. This renderer parses the bullet list into rows, each
 * showing:
 *   - byline-tinted glyph (M/P/F)
 *   - cell label as Fraunces title
 *   - first-paragraph preview (line-clamped)
 *   - "open detail" affordance for future detail-drawer wiring
 */

import { ChevronRight } from 'lucide-react'
import type { AgentOutputRenderer, AgentOutputContext } from '../agent-output-renderer-registry'
import { getAgent } from '../agent-registry'
import { bylineAccent } from '@/shared/design-system/tokens-v2'
import { EditorialProse } from './editorial-prose'

const BMC_AGENTS = new Set(['market-agent', 'product-agent', 'finance-agent'])

function shouldHandle(ctx: AgentOutputContext): boolean {
  return Boolean(ctx.agentId && BMC_AGENTS.has(ctx.agentId))
}

/** Parse "- **Label**: body..." bullet rows out of the mention reply. */
function parseCardRows(content: string): Array<{ label: string; body: string }> {
  const rows: Array<{ label: string; body: string }> = []
  // Split by lines, look for "- **<label>**:" pattern. Body is everything
  // after the colon up to the next bullet or blank line.
  const lines = content.split(/\r?\n/)
  let current: { label: string; body: string } | null = null
  for (const raw of lines) {
    const line = raw.trimEnd()
    const m = line.match(/^[-*]\s+\*\*(.+?)\*\*\s*[:：]\s*(.*)$/)
    if (m) {
      if (current) rows.push(current)
      current = { label: m[1], body: m[2] }
      continue
    }
    if (current && line.trim().length > 0 && !line.startsWith('- ')) {
      current.body += (current.body ? '\n' : '') + line
    } else if (current && line.trim().length === 0 && current.body.length > 0) {
      // blank line ends a row
      rows.push(current)
      current = null
    }
  }
  if (current) rows.push(current)
  return rows
}

/** Strip leading markdown fluff so the preview line is readable. */
function previewBody(body: string, max = 120): string {
  const compact = body
    .replace(/^#+\s*/gm, '')
    .replace(/\s+/g, ' ')
    .trim()
  return compact.length > max ? compact.slice(0, max - 1) + '…' : compact
}

export const BmcGeneratorRenderer: AgentOutputRenderer = {
  id: 'bmc-generator',
  match: shouldHandle,
  render: (ctx) => {
    const agent = ctx.agentId ? getAgent(ctx.agentId) : undefined
    const accent = agent ? bylineAccent[agent.byline] : '#9B8E70'

    // P11.4 · drawer surface always renders single-cell agent content as
    // markdown raw via EditorialProse. The card-list path below is for
    // the chat surface where one mention reply contains multiple cells
    // wrapped in "- **Label**: body" bullets — that wrapper does not
    // apply to a single-cell drawer view, so parsing it yields a
    // structured list with literal "##" leaking into the kicker. Force
    // the editorial prose path for drawers regardless of bullet shape.
    const rows = ctx.surface === 'drawer' ? [] : parseCardRows(ctx.content)

    // Pull the leading summary sentence (e.g. "生成 3 张 market 维度卡片：")
    const firstNewline = ctx.content.indexOf('\n')
    const summary = firstNewline > 0 ? ctx.content.slice(0, firstNewline).trim() : ''

    if (rows.length === 0) {
      // Fallback: single-card detail (drawer surface) — there's no
      // multi-row "生成 N 张卡" wrapper, so this is one cell's full
      // content. Render through EditorialProse for proper typography.
      // For chat surface keep the simpler prose. The byline accent stripe
      // is preserved via inset shadow so the agent ownership reads clearly.
      const useEditorial = ctx.surface === 'drawer'
      return (
        <div
          className="border-[1px] border-stratum-line bg-white"
          style={{ boxShadow: `inset 3px 0 0 0 ${accent}` }}
        >
          {agent ? (
            <div className="flex items-center gap-2 px-3 py-2 border-b-[0.5px] border-stratum-line">
              <span
                className="flex h-5 w-5 items-center justify-center font-display font-[700] text-[12px] text-white rounded-[2px]"
                style={{ backgroundColor: accent }}
                aria-hidden
              >
                {agent.glyph}
              </span>
              <span className="font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-stratum-muted">
                {agent.displayName} · 详细内容
              </span>
            </div>
          ) : null}
          <div className={useEditorial ? 'px-5 py-4' : 'px-3 py-2.5'}>
            {useEditorial ? (
              <EditorialProse content={ctx.content} density="reading" />
            ) : (
              <p className="font-body text-[12px] leading-[1.65] text-stratum-ink whitespace-pre-wrap">
                {ctx.content}
              </p>
            )}
          </div>
        </div>
      )
    }

    return (
      <div className="border-[1px] border-stratum-line bg-white"
           style={{ boxShadow: `inset 3px 0 0 0 ${accent}` }}>
        <div className="flex items-center gap-2 px-3 py-2 border-b-[0.5px] border-stratum-line">
          <span className="flex h-5 w-5 items-center justify-center font-display font-[700] text-[12px] text-white rounded-[2px]"
                style={{ backgroundColor: accent }}
                aria-hidden>
            {agent?.glyph ?? 'A'}
          </span>
          <span className="font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-stratum-muted">
            {summary || `生成 · ${rows.length} 张卡`}
          </span>
        </div>
        <ul>
          {rows.map((row, i) => (
            <li key={i} className="flex items-start gap-2 px-3 py-2 border-b-[0.5px] border-stratum-line last:border-b-0 hover:bg-stratum-surface-low/40 transition-colors">
              <span className="mt-0.5 font-mono text-[9px] tabular-nums text-stratum-muted shrink-0 w-4">
                {String(i + 1).padStart(2, '0')}
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-display font-[700] text-[13px] tracking-tight text-stratum-navy line-clamp-1">
                  {row.label}
                </p>
                <p className="font-body text-[11px] text-stratum-muted leading-snug line-clamp-2 mt-0.5">
                  {previewBody(row.body)}
                </p>
              </div>
              <ChevronRight className="h-3 w-3 text-stratum-muted shrink-0 mt-1" strokeWidth={1.5} />
            </li>
          ))}
        </ul>
      </div>
    )
  },
}
