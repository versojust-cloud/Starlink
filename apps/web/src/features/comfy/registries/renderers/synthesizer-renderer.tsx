/**
 * Synthesizer renderer — for the synthesizer agent's cross-dimension
 * insights + suggested edges.
 *
 * Reply shape from mention-router (see `handleAdvisor` in mention-router.ts):
 *
 *   ## 跨维度洞察
 *   - {insight 1}
 *   - {insight 2}
 *
 *   ## 建议连线
 *   - {from} → {to}：{label}
 *   - ...
 *
 * Visual: two stacked sections, each with a kicker header. Insights as
 * bullet list with synthesizer byline tint; edges as `chip-A → chip-B`
 * pairs to make the relationship visually concrete.
 */

import { Sparkles, ArrowRight } from 'lucide-react'
import type { AgentOutputRenderer, AgentOutputContext } from '../agent-output-renderer-registry'
import { bylineAccent } from '@/shared/design-system/tokens-v2'

const SYNTH_TINT = bylineAccent.synthesizer

function shouldHandle(ctx: AgentOutputContext): boolean {
  return ctx.agentId === 'synthesizer'
}

/** Splits the synthesizer reply into the two known sections. Returns
 *  empty arrays if a section is missing. */
function parseSynth(content: string): {
  insights: string[]
  edges: Array<{ from: string; to: string; label: string }>
} {
  const insightsBlock = content.match(/##\s*跨维度洞察\s*\n([\s\S]*?)(?=\n##\s|$)/)?.[1] ?? ''
  const edgesBlock = content.match(/##\s*建议连线\s*\n([\s\S]*?)(?=\n##\s|$)/)?.[1] ?? ''

  const insights = insightsBlock
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.startsWith('- ') || l.startsWith('* '))
    .map((l) => l.replace(/^[-*]\s+/, '').trim())
    .filter(Boolean)

  const edges: Array<{ from: string; to: string; label: string }> = []
  for (const line of edgesBlock.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('-') && !trimmed.startsWith('*')) continue
    // Accept "- A → B：label" or "- A -> B: label"
    const m = trimmed.match(/^[-*]\s+(.+?)\s*(?:→|->)\s*(.+?)\s*[:：]\s*(.*)$/)
    if (m) edges.push({ from: m[1], to: m[2], label: m[3] })
  }

  return { insights, edges }
}

export const SynthesizerRenderer: AgentOutputRenderer = {
  id: 'synthesizer',
  match: shouldHandle,
  render: (ctx) => {
    const { insights, edges } = parseSynth(ctx.content)
    const empty = insights.length === 0 && edges.length === 0
    if (empty) {
      return (
        <div className="border-[1px] border-stratum-line bg-white px-3 py-2.5"
             style={{ boxShadow: `inset 3px 0 0 0 ${SYNTH_TINT}` }}>
          <p className="font-body text-[12px] leading-[1.65] text-stratum-ink whitespace-pre-wrap">
            {ctx.content || '暂未发现新的跨维度洞察。'}
          </p>
        </div>
      )
    }
    return (
      <div className="border-[1px] border-stratum-line bg-white"
           style={{ boxShadow: `inset 3px 0 0 0 ${SYNTH_TINT}` }}>
        <div className="flex items-center gap-2 px-3 py-2 border-b-[0.5px] border-stratum-line">
          <Sparkles className="h-3.5 w-3.5" strokeWidth={1.75} style={{ color: SYNTH_TINT }} />
          <span className="font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-stratum-muted">
            SYNTHESIS · {insights.length} 洞察 · {edges.length} 连线
          </span>
        </div>

        {insights.length > 0 ? (
          <section className="px-3 py-2.5 border-b-[0.5px] border-stratum-line">
            <p className="font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-stratum-muted mb-1.5">
              跨维度洞察
            </p>
            <ul className="space-y-1">
              {insights.map((insight, i) => (
                <li key={i} className="flex items-start gap-2 font-body text-[12px] leading-[1.6] text-stratum-ink">
                  <span className="mt-1 h-1 w-1 rounded-full shrink-0" style={{ backgroundColor: SYNTH_TINT }} />
                  <span>{insight}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {edges.length > 0 ? (
          <section className="px-3 py-2.5">
            <p className="font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-stratum-muted mb-1.5">
              建议连线
            </p>
            <ul className="space-y-1.5">
              {edges.map((edge, i) => (
                <li key={i} className="flex items-center gap-1.5 flex-wrap text-[11px]">
                  <span className="px-2 py-0.5 font-display font-[700] text-stratum-navy bg-white border border-stratum-line">
                    {edge.from}
                  </span>
                  <ArrowRight className="h-3 w-3 shrink-0" strokeWidth={1.75} style={{ color: SYNTH_TINT }} />
                  <span className="px-2 py-0.5 font-display font-[700] text-stratum-navy bg-white border border-stratum-line">
                    {edge.to}
                  </span>
                  <span className="font-body text-[11px] text-stratum-muted ml-1">
                    {edge.label}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    )
  },
}
