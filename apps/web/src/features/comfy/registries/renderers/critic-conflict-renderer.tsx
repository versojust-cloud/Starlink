/**
 * Critic conflict renderer — structured display of one critic-detected
 * conflict, exposing severity / conflictType / relatedAgents at a glance.
 *
 * Output structure (per CriticOutputSchema in business-langgraph):
 *   {
 *     label, description, severity ('high'|'medium'|'low'),
 *     conflictType ('resource-goal'|'compliance-business'|'channel-product'|'other'),
 *     relatedAgents: ['Market_Agent', 'Product_Agent', ...]
 *   }
 *
 * Visual:
 *   - Severity stripe (left edge): press-red for high, byline-finance
 *     for moderate, ash-3 for low
 *   - Type badge: mono code badge ('CHANNEL · PRODUCT' etc)
 *   - Related agents: byline-tinted chips, click → focus on canvas
 *   - Description: prose, full markdown
 */

import { AlertTriangle, ArrowRight } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { AgentOutputRenderer, AgentOutputContext } from '../agent-output-renderer-registry'

const SEVERITY_STRIPE: Record<string, string> = {
  high:     '#B33028',   // press red
  moderate: '#9B8E70',   // byline market (warm brown)
  low:      '#4A4744',   // ink ash3 (muted)
}

const SEVERITY_LABEL: Record<string, string> = {
  high:     '严重',
  moderate: '中等',
  low:      '轻微',
}

const TYPE_LABEL: Record<string, string> = {
  'resource-goal':       '资源 ↔ 目标',
  'compliance-business': '合规 ↔ 业务',
  'channel-product':     '渠道 ↔ 产品',
  'other':               '其他',
}

const AGENT_BYLINE_CLASS: Record<string, string> = {
  Market_Agent:  'text-byline-market bg-[#9B8E70]/10 border-[#9B8E70]/40',
  Product_Agent: 'text-byline-product bg-[#7A8B7E]/10 border-[#7A8B7E]/40',
  Finance_Agent: 'text-byline-finance bg-[#6E7A8C]/10 border-[#6E7A8C]/40',
}

function shouldHandle(ctx: AgentOutputContext): boolean {
  if (ctx.macraType === 'conflict-alert') return true
  if (ctx.agentId === 'critic-agent') return true
  return false
}

export const CriticConflictRenderer: AgentOutputRenderer = {
  id: 'critic-conflict',
  match: shouldHandle,
  render: (ctx) => {
    const severity = (ctx.severity ?? 'high').toLowerCase()
    const stripe = SEVERITY_STRIPE[severity] ?? SEVERITY_STRIPE.high
    const meta = ctx.metadata ?? {}
    const conflictType = String(meta.conflictType ?? 'other')
    const relatedAgents = Array.isArray(meta.relatedAgents)
      ? (meta.relatedAgents as string[])
      : []

    return (
      <div
        className="border-[1px] border-stratum-line bg-white"
        style={{ boxShadow: `inset 3px 0 0 0 ${stripe}` }}
      >
        {/* Header row: severity badge + type badge */}
        <div className="flex items-center gap-2 px-3 py-2 border-b-[0.5px] border-stratum-line">
          <AlertTriangle
            className="h-3.5 w-3.5 shrink-0"
            style={{ color: stripe }}
            strokeWidth={1.75}
          />
          <span
            className="font-mono text-[9px] font-bold uppercase tracking-[0.18em]"
            style={{ color: stripe }}
          >
            {SEVERITY_LABEL[severity] ?? severity.toUpperCase()}
          </span>
          <span className="text-stratum-muted">·</span>
          <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-stratum-muted">
            {TYPE_LABEL[conflictType] ?? conflictType}
          </span>
        </div>

        {/* Body: markdown description */}
        <div className="px-3 py-2.5">
          <div className="prose prose-sm max-w-none break-words [&>*]:my-1 [&_p]:leading-[1.6] [&_p]:text-[12px] [&_strong]:font-semibold">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{ctx.content || '(无详细描述)'}</ReactMarkdown>
          </div>
        </div>

        {/* Related agents chips — click navigates to that agent's avatar/cell */}
        {relatedAgents.length > 0 ? (
          <div className="px-3 pb-2.5 flex items-center gap-1.5 flex-wrap">
            <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-stratum-muted shrink-0">
              涉及 →
            </span>
            {relatedAgents.map((agent) => {
              const cls = AGENT_BYLINE_CLASS[agent] ?? 'text-stratum-muted bg-stratum-surface-low border-stratum-line'
              return (
                <button
                  key={agent}
                  type="button"
                  onClick={() => {
                    if (ctx.onFocusNode) {
                      const target = agent === 'Market_Agent' ? 'avatar-market'
                        : agent === 'Product_Agent' ? 'avatar-product'
                        : agent === 'Finance_Agent' ? 'avatar-finance'
                        : ''
                      if (target) ctx.onFocusNode(target)
                    }
                  }}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 border font-display font-[700] text-[10px] tracking-[0.01em] hover:opacity-80 transition-opacity ${cls}`}
                >
                  {agent.replace(/_Agent$/, '')}
                  <ArrowRight className="h-2.5 w-2.5" strokeWidth={2} />
                </button>
              )
            })}
          </div>
        ) : null}
      </div>
    )
  },
}
