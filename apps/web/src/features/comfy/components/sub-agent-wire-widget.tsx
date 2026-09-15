'use client'

/**
 * P11.14 · Sub-agent live activity wire widget.
 *
 * Reads `subAgentActivity` from comfy-store. When an agent's ReAct
 * subgraph emits a tool-call / parse / call-llm internal step, the
 * server emits an `agent/subagent-progress` event over the GraphQL
 * subscription; the comfy-store's onEvent handler stashes the latest
 * here. This widget renders a compact floating chip at the bottom-
 * left of the canvas like:
 *
 *   ┌───────────────────────────────────────────┐
 *   │ M · 市场分析专家 → 调用 web-search…        │
 *   └───────────────────────────────────────────┘
 *
 * Auto-fades after 2.5s of inactivity (handled via state.ts; the chip
 * just renders whatever's in subAgentActivity). When the conversation
 * stream ends (completed / failed), comfy-store nulls the activity so
 * the chip disappears.
 *
 * No new GraphQL subscriptions; pure consumer of the existing wire.
 */

import { useEffect, useState } from 'react'
import { useComfyStore } from '../store'
import { getAgent } from '../registries/agent-registry'
import { bylineAccent } from '@/shared/design-system/tokens-v2'

export function SubAgentWireWidget() {
  const subAgentActivity = useComfyStore((state) => state.subAgentActivity)
  const setSubAgentActivity = useComfyStore((state) => state.setSubAgentActivity)
  const [now, setNow] = useState(() => Date.now())

  // Tick once per second so the auto-hide threshold is reactive.
  useEffect(() => {
    if (!subAgentActivity) return
    const id = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(id)
  }, [subAgentActivity])

  // Auto-clear after 4 seconds of inactivity (no new event arrived).
  useEffect(() => {
    if (!subAgentActivity) return
    if (now - subAgentActivity.ts > 4000) {
      setSubAgentActivity(null)
    }
  }, [now, subAgentActivity, setSubAgentActivity])

  if (!subAgentActivity) return null

  // Map graph-node name (e.g. 'marketAgent') to registry id ('market-agent')
  // so we can pull the display name + byline tint.
  const parentToAgentId: Record<string, string> = {
    marketAgent: 'market-agent',
    productAgent: 'product-agent',
    financeAgent: 'finance-agent',
    critic: 'critic-agent',
    synthesizer: 'synthesizer',
    moderator: 'moderator',
    generalResponder: 'general-responder',
    deepResearchAgent: 'deep-research'
  }
  const agentId = parentToAgentId[subAgentActivity.parentNode]
  const agent = agentId ? getAgent(agentId) : undefined
  const tint = agent ? bylineAccent[agent.byline] : '#4A4744'
  const glyph = agent?.glyph ?? '?'
  const displayName = agent?.displayName ?? subAgentActivity.parentNode

  // Friendly nodeName labels — the LangGraph internal node names
  // ('call-llm' / 'tools' / 'parse' / 'invoke-agent') aren't very
  // user-friendly, so map them to Chinese task descriptions.
  const NODE_LABELS: Record<string, string> = {
    'call-llm': '思考',
    tools: '调用工具',
    parse: '解析输出',
    'invoke-agent': '启动子图',
    synthesize: '跨维度推断',
    'detect-conflicts': '冲突检测'
  }
  const taskLabel = NODE_LABELS[subAgentActivity.nodeName] ?? subAgentActivity.nodeName

  return (
    <div
      className="pointer-events-none absolute bottom-4 left-4 z-30 flex items-center gap-2 rounded-[2px] border-[1px] border-stratum-line bg-white/95 px-3 py-1.5 shadow-[0_2px_8px_rgba(0,0,0,0.06)] backdrop-blur-sm"
      style={{ boxShadow: `inset 3px 0 0 0 ${tint}, 0 2px 8px rgba(0,0,0,0.06)` }}
    >
      <span
        className="flex h-5 w-5 items-center justify-center font-display font-[700] text-[12px] text-white rounded-[2px]"
        style={{ backgroundColor: tint }}
        aria-hidden
      >
        {glyph}
      </span>
      <span className="font-instr text-[10px] uppercase tracking-kicker text-stratum-muted">
        {displayName}
      </span>
      <span className="font-instr text-[10px] tracking-kicker text-stratum-navy">·</span>
      <span className="font-body text-[12px] text-stratum-navy">
        {taskLabel}
      </span>
      {/* Pulsing dot to convey "live" without animation noise. */}
      <span
        className="ml-1 h-1.5 w-1.5 rounded-full"
        style={{
          backgroundColor: tint,
          animation: 'starlinkPulseDot 1.4s ease-in-out infinite'
        }}
      />
    </div>
  )
}
