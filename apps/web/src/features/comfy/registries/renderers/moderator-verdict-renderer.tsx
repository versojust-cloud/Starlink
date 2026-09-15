/**
 * Moderator verdict renderer — structured display for moderator's
 * adjudication output. Per the @-mention path the moderator returns
 * a balanced reading; the renderer presents it as an editorial
 * "verdict card":
 *
 *   ┌───────────────────────────────────────┐
 *   │ JUDGE · 平衡评议                       │
 *   │ ┌─────────┐                           │
 *   │ │  J  •   │  辩论裁决者评议             │
 *   │ └─────────┘                           │
 *   │ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─    │
 *   │ {markdown reasoning}                  │
 *   └───────────────────────────────────────┘
 *
 * Note: this matches the @-moderator standalone path. The richer
 * full-debate verdict (DebateVerdict with outcome enum + nodeOutcomes
 * table) is currently not surfaced via mention — it lives in the
 * debate orchestrator's handoff log. If/when DebateVerdict starts
 * flowing into chat, extend this renderer to read metadata.outcome
 * and metadata.nodeOutcomes.
 */

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Scale } from 'lucide-react'
import type { AgentOutputRenderer, AgentOutputContext } from '../agent-output-renderer-registry'

const MODERATOR_TINT = '#5C5C6E'

function shouldHandle(ctx: AgentOutputContext): boolean {
  if (ctx.agentId === 'moderator') return true
  return false
}

export const ModeratorVerdictRenderer: AgentOutputRenderer = {
  id: 'moderator-verdict',
  match: shouldHandle,
  render: (ctx) => {
    // Optional: future DebateVerdict shape — outcome / nodeOutcomes
    const meta = ctx.metadata ?? {}
    const outcome = meta.outcome as { kind?: string; reasoning?: string } | undefined
    const outcomeKind = outcome?.kind

    const proseClass =
      ctx.surface === 'drawer'
        ? 'prose prose-sm max-w-none break-words text-[13px] leading-[1.7] [&_p]:my-1.5'
        : 'prose prose-sm max-w-none break-words text-[12px] leading-[1.65] [&_p]:my-1'

    return (
      <div
        className="border-[1px] border-stratum-line bg-white"
        style={{ boxShadow: `inset 3px 0 0 0 ${MODERATOR_TINT}` }}
      >
        {/* Kicker row — JUDGE 标识 + Fraunces title */}
        <div className="flex items-center gap-2 px-3 py-2 border-b-[0.5px] border-stratum-line">
          <Scale className="h-3.5 w-3.5 text-stratum-muted" strokeWidth={1.75} />
          <span className="font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-stratum-muted">
            JUDGE · 平衡评议
          </span>
          {outcomeKind ? (
            <>
              <span className="text-stratum-muted">·</span>
              <span
                className="font-mono text-[9px] uppercase tracking-[0.18em]"
                style={{ color: MODERATOR_TINT }}
              >
                {OUTCOME_LABEL[outcomeKind] ?? outcomeKind}
              </span>
            </>
          ) : null}
        </div>

        {/* Body — moderator prose */}
        <div className="px-3 py-2.5">
          <div className={proseClass}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{ctx.content || '(无评议内容)'}</ReactMarkdown>
          </div>
        </div>
      </div>
    )
  },
}

const OUTCOME_LABEL: Record<string, string> = {
  consensus:           '共识达成',
  'opponent-wins':     '对手胜出',
  escalate:            '升级',
  'max-rounds-reached':'轮次用尽',
}
