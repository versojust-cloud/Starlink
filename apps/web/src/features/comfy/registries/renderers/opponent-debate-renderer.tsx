/**
 * OpponentDebateRenderer — single-side critique from market/product/
 * finance-opponent agents (debate-side callability).
 *
 * The mention-router calls LlmDebateInvoker.nextTurn() with
 * priorTurns=[] and disputedNodeIds=[]. The reply is the turn's `.message`
 * field (string), but contextually framed as opposition.
 *
 * Visual: dashed border (mirrors agent-registry's variant='opponent'
 * dashed glyph), darker byline tint (agent-registry uses the matching
 * proponent byline), and an "OPPOSITION · 单边批判" kicker so users see
 * this is adversarial framing not consensus.
 */

import { Swords } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { AgentOutputRenderer, AgentOutputContext } from '../agent-output-renderer-registry'
import { getAgent } from '../agent-registry'
import { bylineAccent } from '@/shared/design-system/tokens-v2'

const OPPONENT_AGENTS = new Set(['market-opponent', 'product-opponent', 'finance-opponent'])

function shouldHandle(ctx: AgentOutputContext): boolean {
  return Boolean(ctx.agentId && OPPONENT_AGENTS.has(ctx.agentId))
}

export const OpponentDebateRenderer: AgentOutputRenderer = {
  id: 'opponent-debate',
  match: shouldHandle,
  render: (ctx) => {
    const agent = ctx.agentId ? getAgent(ctx.agentId) : undefined
    const accent = agent ? bylineAccent[agent.byline] : '#7A4A40'

    return (
      <div
        className="border-[1.5px] border-dashed bg-white"
        style={{
          borderColor: accent,
          boxShadow: `inset 3px 0 0 0 ${accent}`,
        }}
      >
        <div className="flex items-center gap-2 px-3 py-2 border-b-[0.5px] border-stratum-line">
          <Swords className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} style={{ color: accent }} />
          <span
            className="font-mono text-[9px] font-bold uppercase tracking-[0.18em]"
            style={{ color: accent }}
          >
            OPPOSITION · 单边批判
          </span>
          {agent ? (
            <>
              <span className="text-stratum-muted">·</span>
              <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-stratum-muted">
                {agent.displayName}
              </span>
            </>
          ) : null}
        </div>
        <div className="px-3 py-2.5">
          <div className="prose prose-sm max-w-none break-words text-[12px] leading-[1.65] [&>*]:my-1 [&_p]:leading-[1.65] [&_strong]:font-semibold [&_strong]:text-stratum-navy">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{ctx.content || '(无对抗性回复)'}</ReactMarkdown>
          </div>
        </div>
      </div>
    )
  },
}
