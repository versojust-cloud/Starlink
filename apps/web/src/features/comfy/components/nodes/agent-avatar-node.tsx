'use client'

import { memo, useState, useCallback } from 'react'
import { Handle, Position, type NodeProps } from 'reactflow'
import { useComfyStore } from '../../store'
import { AGENT_TYPES, type AgentType, type MacraNodeData } from '@/types/macra'
import { MessageCircle, X, Send, Loader2, Sparkles } from 'lucide-react'

// Editorial Boardroom v2 agent config (2026-05-01).
// Collapses the previous 16-type emoji+gradient palette to a 5-byline
// system (market / product / finance / critic / synthesizer). Each
// agent gets a Fraunces letter glyph + a muted byline-tinted class
// instead of an emoji on a gradient. Names + descriptions stay
// identical so chat copy reads the same.
type BylineKey = 'market' | 'product' | 'finance' | 'critic' | 'synthesizer'

interface AgentEntry {
  /** Single Fraunces letter — typeset mark in lieu of the old emoji. */
  glyph: string
  byline: BylineKey
  /** Tailwind class for the byline-tinted text/glyph. */
  tintClass: string
  /** Hex for inset 3px edge bar (muted, NOT the press accent). */
  edgeHex: string
  name: string
  description: string
}

const BYLINE_TINT: Record<BylineKey, string> = {
  market:      'text-byline-market',
  product:     'text-byline-product',
  finance:     'text-byline-finance',
  critic:      'text-byline-critic',
  synthesizer: 'text-byline-synthesizer',
}

const BYLINE_HEX: Record<BylineKey, string> = {
  market:      '#9B8E70',
  product:     '#7A8B7E',
  finance:     '#6E7A8C',
  critic:      '#8C6E6E',
  synthesizer: '#6B6B7C',
}

function entry(byline: BylineKey, glyph: string, name: string, description: string): AgentEntry {
  return { glyph, byline, tintClass: BYLINE_TINT[byline], edgeHex: BYLINE_HEX[byline], name, description }
}

const AGENT_CONFIG: Record<AgentType, AgentEntry> = {
  // Market family — customer-facing dimensions
  [AGENT_TYPES.MARKET]:                  entry('market',      'M', '市场分析专家', '客户、渠道、关系分析'),
  [AGENT_TYPES.CUSTOMER_SEGMENTS]:       entry('market',      'M', '客户细分专家', '目标客户与画像分析'),
  [AGENT_TYPES.CUSTOMER_RELATIONSHIPS]:  entry('market',      'M', '客户关系专家', '关系维护与用户粘性'),
  [AGENT_TYPES.CHANNELS]:                entry('market',      'M', '渠道通路专家', '触达与分发策略'),

  // Product family — value + operations
  [AGENT_TYPES.PRODUCT]:                 entry('product',     'P', '产品策略专家', '价值主张、关键业务'),
  [AGENT_TYPES.VALUE_PROPOSITIONS]:      entry('product',     'P', '价值主张专家', '核心价值与差异化'),
  [AGENT_TYPES.KEY_ACTIVITIES]:          entry('product',     'P', '关键业务专家', '核心活动与流程'),
  [AGENT_TYPES.KEY_RESOURCES]:           entry('product',     'P', '核心资源专家', '关键资产与能力'),
  [AGENT_TYPES.KEY_PARTNERSHIPS]:        entry('product',     'P', '重要合作专家', '合作伙伴与协同'),

  // Finance family
  [AGENT_TYPES.FINANCE]:                 entry('finance',     'F', '财务分析专家', '收入、成本结构'),
  [AGENT_TYPES.REVENUE_STREAMS]:         entry('finance',     'F', '收入来源专家', '商业模式与定价'),
  [AGENT_TYPES.COST_STRUCTURE]:          entry('finance',     'F', '成本结构专家', '成本构成与优化'),

  // Critic family — adversarial review
  [AGENT_TYPES.CRITIC]:                  entry('critic',      'C', '对抗性评论者', '检测逻辑漏洞和冲突'),
  [AGENT_TYPES.COMPLIANCE]:              entry('critic',      'C', '合规法务专家', '合规、法律风险'),

  // Synthesizer / orchestrator family — meta agents
  [AGENT_TYPES.ORCHESTRATOR]:            entry('synthesizer', 'S', '中央编排器',     '协调所有 Agent 工作'),
  [AGENT_TYPES.SEMANTIC_PLAN]:           entry('synthesizer', 'S', '语义确认专家',   '需求理解与确认'),
  [AGENT_TYPES.CULTURAL_CONTEXT]:        entry('synthesizer', 'S', '文化情境专家',   '文化背景与适配'),
  [AGENT_TYPES.CULTURAL_SIMULATION]:     entry('synthesizer', 'S', '跨文化演练专家', '沟通模拟与策略'),
  [AGENT_TYPES.CULTURAL_REPORT]:         entry('synthesizer', 'S', '跨文化报告专家', '策略报告与落地'),
}

interface ChatMessage {
  role: 'user' | 'agent'
  content: string
}

export const AgentAvatarNode = memo(function AgentAvatarNode({ id, data }: NodeProps) {
  const macraNode = useComfyStore((state) => state.macraNodes.get(id))
  const nodeData = macraNode || (data as MacraNodeData)

  const [isChatOpen, setIsChatOpen] = useState(false)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [inputMessage, setInputMessage] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)

  const agentType = nodeData?.agentType || AGENT_TYPES.MARKET
  const config = AGENT_CONFIG[agentType]
  const isInteractive = nodeData?.isInteractive ?? true

  // Map AGENT_TYPES enum value (e.g. "Market_Agent") → mention-router id
  // (e.g. "market-agent"). Used to route the avatar's per-node chat to
  // the real backend agent via the mentionAgent GraphQL mutation.
  const agentMentionId = (() => {
    if (agentType === AGENT_TYPES.MARKET) return 'market-agent'
    if (agentType === AGENT_TYPES.PRODUCT) return 'product-agent'
    if (agentType === AGENT_TYPES.FINANCE) return 'finance-agent'
    if (agentType === AGENT_TYPES.CRITIC) return 'critic-agent'
    return null
  })()

  const handleSendMessage = useCallback(async () => {
    if (!inputMessage.trim() || isProcessing) return

    const userMessage = inputMessage.trim()
    setInputMessage('')
    setIsProcessing(true)

    setChatMessages(prev => [...prev, { role: 'user', content: userMessage }])

    try {
      // Real LLM path: call mentionAgent GraphQL mutation against the
      // running backend agent. Replaces the previous mock fallback that
      // returned "API未就绪" copy regardless of actual server state.
      if (!agentMentionId) {
        setChatMessages(prev => [...prev, {
          role: 'agent',
          content: `（${config.name} 未注册到 mention router；请通过画布顶部 chat dock 用 @ 唤起其他 agent）`
        }])
        setIsProcessing(false)
        return
      }
      const workspaceId = useComfyStore.getState().workspaceId
      if (!workspaceId) {
        setChatMessages(prev => [...prev, { role: 'agent', content: '⚠ workspaceId 未设置，无法调用 agent。' }])
        setIsProcessing(false)
        return
      }
      const { getGraphQLClient } = await import('@/shared/lib/graphql-client')
      const data = await getGraphQLClient().request<{
        mentionAgent: { agentId: string; reply: string; refused: boolean; refusalReason: string | null }
      }>(
        /* GraphQL */ `
          mutation AvatarMention($input: MentionAgentInput!) {
            mentionAgent(input: $input) {
              agentId reply refused refusalReason
            }
          }
        `,
        { input: { workspaceId, agentId: agentMentionId, message: userMessage } }
      )
      const m = data.mentionAgent
      const reply = m.reply || (m.refused ? (m.refusalReason ?? '已拒绝') : '(空响应)')
      setChatMessages(prev => [...prev, { role: 'agent', content: reply }])
      setIsProcessing(false)
    } catch (error) {
      console.error('Agent 对话失败:', error)
      setChatMessages(prev => [...prev, {
        role: 'agent',
        content: `⚠ 调用失败：${error instanceof Error ? error.message : String(error)}`
      }])
      setIsProcessing(false)
    }
  }, [inputMessage, isProcessing, config.name, agentMentionId])

  return (
    <>
      <Handle
        type="target"
        position={Position.Left}
        style={{
          width: 8,
          height: 8,
          background: '#FFFFFF',
          border: '1px solid rgba(19,27,46,0.18)'
        }}
      />

      <div
        className="group relative w-[360px] overflow-hidden rounded-xl border border-stratum-line bg-white shadow-md transition-shadow hover:shadow-lg"
        style={{ boxShadow: `inset 4px 0 0 0 ${config.edgeHex}, 0 4px 12px rgba(19,27,46,0.06)` }}
      >
        {/* Header — Fraunces glyph + name */}
        <div className="relative border-b border-stratum-line px-4 py-3">
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className={`shrink-0 font-display font-[700] text-[28px] leading-none ${config.tintClass}`}
            >
              {config.glyph}
            </span>

            <div className="min-w-0 flex-1">
              <h3 className="font-display font-[700] text-[15px] tracking-tight text-stratum-navy truncate">
                {config.name}
              </h3>
              <p className="font-body text-[10px] font-semibold uppercase tracking-[0.18em] text-stratum-blue mt-0.5">
                {config.description}
              </p>
            </div>

            {isInteractive && (
              <button
                onClick={() => setIsChatOpen(!isChatOpen)}
                className={`flex h-7 w-7 items-center justify-center rounded-full transition-colors ${
                  isChatOpen
                    ? 'bg-stratum-navy text-white'
                    : 'text-stratum-muted hover:bg-stratum-surface-low hover:text-stratum-navy'
                }`}
                aria-label={isChatOpen ? '关闭对话' : '打开对话'}
              >
                {isChatOpen ? (
                  <X className="h-3.5 w-3.5" strokeWidth={1.75} />
                ) : (
                  <MessageCircle className="h-3.5 w-3.5" strokeWidth={1.75} />
                )}
              </button>
            )}
          </div>
        </div>

        {/* Chat */}
        {isChatOpen && (
          <div className="relative">
            <div className="h-56 space-y-3 overflow-y-auto bg-stratum-surface p-4">
              {chatMessages.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center text-center">
                  <Sparkles className={`h-5 w-5 mb-2 ${config.tintClass}`} strokeWidth={1.5} />
                  <p className="font-body text-[10px] font-semibold uppercase tracking-[0.18em] text-stratum-muted">
                    向我提问关于
                  </p>
                  <p className="mt-1 font-display font-[700] text-[13px] text-stratum-navy">
                    {config.description}
                  </p>
                </div>
              ) : (
                chatMessages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
                  >
                    <span
                      aria-hidden="true"
                      className={`shrink-0 flex h-6 w-6 items-center justify-center font-display font-[700] text-[14px] leading-none ${
                        msg.role === 'agent' ? config.tintClass : 'text-stratum-muted'
                      }`}
                    >
                      {msg.role === 'agent' ? config.glyph : 'U'}
                    </span>
                    <div
                      className={`max-w-[78%] rounded-lg px-3 py-2 font-body text-[12px] leading-[1.5] ${
                        msg.role === 'agent'
                          ? 'bg-white border border-stratum-line text-stratum-ink shadow-sm'
                          : 'bg-stratum-navy text-white shadow-sm'
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="border-t border-stratum-line bg-white p-3">
              <div className="flex items-end gap-2">
                <textarea
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleSendMessage()
                    }
                  }}
                  placeholder="输入你的问题…"
                  className="flex-1 resize-none rounded-lg border border-stratum-line bg-stratum-surface-low px-3 py-2 font-body text-[12px] text-stratum-navy outline-none transition-colors placeholder:text-stratum-muted focus:border-stratum-blue focus:ring-1 focus:ring-stratum-blue/30"
                  rows={2}
                  disabled={isProcessing}
                />
                <button
                  type="button"
                  onClick={handleSendMessage}
                  disabled={!inputMessage.trim() || isProcessing}
                  className="flex h-9 w-9 items-center justify-center rounded-lg bg-stratum-navy text-white transition-colors disabled:opacity-30 hover:bg-stratum-navy-soft"
                  aria-label="发送"
                >
                  {isProcessing ? (
                    <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
                  ) : (
                    <Send className="h-4 w-4" strokeWidth={2} />
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Right}
        style={{
          width: 8,
          height: 8,
          background: '#FFFFFF',
          border: '1px solid rgba(19,27,46,0.18)'
        }}
      />
    </>
  )
})
