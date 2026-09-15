'use client'

/**
 * CCBMCDetailDrawer — Editorial Boardroom v2 (2026-05-02).
 *
 * Right-side drawer that opens when the user clicks "详情" on a BMC
 * card node. v1 was glass + amber gradients + Sparkles icon + amber
 * shadow glow; v2 is brutalist 1.5px paper border on ink-ash1 with
 * mono kicker section heads and Fraunces titles.
 *
 * Functional surface unchanged: 4 tabs (overview / quiz / edit /
 * resources), Quiz API integration with mock fallback, store-bound
 * open/close. Only visual chrome was rewritten.
 */

import { useState } from 'react'
import { useComfyStore } from '../store'
import { X, FileText, MessageSquare, Edit3, Link2 } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { QuizPanel, type QuizQuestion } from './quiz-panel'
import { renderAgentOutput } from '../registries/agent-output-renderer-registry'
import { useResizableDrawer, ResizeHandle } from '@/shared/hooks/use-resizable-drawer'

/**
 * Map a node's `metadata.agent_signature` (e.g. 'Market_Agent',
 * 'Adversarial_Critic') to the kebab-case agentId the renderer
 * registry uses (e.g. 'market-agent', 'critic-agent'). Returns
 * undefined for unknown signatures — the registry then falls back
 * to default markdown.
 */
function agentSignatureToId(sig: string | undefined): string | undefined {
  if (!sig) return undefined
  const s = sig.toLowerCase()
  if (s === 'market_agent' || s === 'market-agent' || s === 'market') return 'market-agent'
  if (s === 'product_agent' || s === 'product-agent' || s === 'product') return 'product-agent'
  if (s === 'finance_agent' || s === 'finance-agent' || s === 'finance') return 'finance-agent'
  if (s.includes('critic')) return 'critic-agent'
  if (s.includes('synthesi')) return 'synthesizer'
  if (s.includes('moderator')) return 'moderator'
  if (s.includes('opponent')) {
    if (s.includes('market')) return 'market-opponent'
    if (s.includes('product')) return 'product-opponent'
    if (s.includes('finance')) return 'finance-opponent'
  }
  if (s.includes('research')) return 'deep-research'
  if (s.includes('general') || s.includes('responder')) return 'general-responder'
  return undefined
}

type TabType = 'overview' | 'quiz' | 'edit' | 'resources'

// 9 BMC domains → 3 owner bylines (mirrors business-langgraph
// agentNodeForBmcDomain). Used to tint the kicker glyph in the
// drawer header.
const BYLINE_BY_DOMAIN: Record<string, { glyph: string; tint: string }> = {
  '客户细分':       { glyph: 'M', tint: 'text-byline-market' },
  '客户关系':       { glyph: 'M', tint: 'text-byline-market' },
  '渠道通路':       { glyph: 'M', tint: 'text-byline-market' },
  '价值主张':       { glyph: 'P', tint: 'text-byline-product' },
  '核心资源':       { glyph: 'P', tint: 'text-byline-product' },
  '关键业务':       { glyph: 'P', tint: 'text-byline-product' },
  '重要合作':       { glyph: 'P', tint: 'text-byline-product' },
  '收入来源':       { glyph: 'F', tint: 'text-byline-finance' },
  '成本结构':       { glyph: 'F', tint: 'text-byline-finance' },
}

const TAB_BASE =
  'inline-flex items-center gap-1.5 px-3 py-1.5 font-instr text-[10px] uppercase tracking-kicker transition-colors'
const TAB_ACTIVE = 'bg-stratum-navy text-white'
const TAB_IDLE   = 'bg-transparent text-stratum-muted hover:text-stratum-navy'

export function CCBMCDetailDrawer() {
  const detailPanel = useComfyStore((state) => state.detailPanel)
  const closeDetailPanel = useComfyStore((state) => state.closeDetailPanel)
  const nodeData = useComfyStore((state) => {
    if (!state.detailPanel?.nodeId) return null
    return state.macraNodes.get(state.detailPanel.nodeId) ?? null
  })
  const [activeTab, setActiveTab] = useState<TabType>('overview')

  // P12 · resizable. Drag the LEFT edge of the right-anchored drawer
  // to widen / narrow it. 380-1100px range; default 500px (the
  // existing baseline). Persisted in localStorage so the user's
  // preferred reading width sticks across reloads. Hooks must run
  // unconditionally before the early-return below — React rules of
  // hooks. The handle JSX is rendered inside the aside so it only
  // mounts when the drawer is actually visible.
  const { width: drawerWidth, startDrag: startDrawerDrag } = useResizableDrawer({
    storageKey: 'starlink:bmcDetailDrawer:width',
    defaultWidth: 500,
    minWidth: 380,
    maxWidth: 1100,
    direction: 'left'
  })

  if (!detailPanel?.isOpen || !detailPanel?.nodeId) {
    return null
  }

  const nodeWithDetails = nodeData as (typeof nodeData & { summary?: string; fullContent?: string }) | null

  if (!nodeData) {
    return null
  }

  const fullContent = nodeWithDetails?.fullContent || nodeData.content || ''
  // P10.7 · derivedSummary 必须真正 SHORT — 之前的版本对 markdown bullet
  // 列表（无句号终止符）只能 fallback 到整段文字，导致摘要 = 详细 全文，
  // 用户看到两段相同内容觉得"反了"。
  // 新策略，按优先级：
  //   1. 服务端 meta.summary（如有，agent 显式产出）
  //   2. 第一行的 markdown 标题（去除 # 前缀），如 "## 核心价值" → "核心价值"
  //   3. 第一个 bullet/list item 的内容
  //   4. 第一句完整句子（。！？.!?）
  //   5. 最后兜底：前 60 字 + …
  // 严格 ≤80 字，保证视觉上"摘要"明显短于"详细内容"。
  const derivedSummary = (() => {
    if (typeof nodeWithDetails?.summary === 'string' && nodeWithDetails.summary.trim().length > 0) {
      // P11.6 · server-supplied summary is now an LLM-distilled structured
      // 3-5 item markdown list (cell-summarizer.ts). Render it in full —
      // the drawer has plenty of vertical room and clipping a structured
      // list to 100 chars produced the trailing "(3…" we shipped before.
      // Preserve raw markdown so <ReactMarkdown> renders proper <ul><li>.
      return nodeWithDetails.summary.trim()
    }
    if (!fullContent) return ''
    const trimmed = fullContent.trim()

    // 2. Markdown heading (## title)
    const headingMatch = trimmed.match(/^#{1,6}\s+(.+?)(?:\n|$)/)
    if (headingMatch?.[1]) {
      const h = headingMatch[1].trim()
      return h.length > 80 ? h.slice(0, 80).trimEnd() + '…' : h
    }

    // 3. First bullet (- item / * item / 1. item / · item)
    const bulletMatch = trimmed.match(/^\s*(?:[-*·]|\d+\.)\s+(.+?)(?:\n|$)/m)
    if (bulletMatch?.[1]) {
      const b = bulletMatch[1].replace(/[*_`]/g, '').trim()
      if (b.length > 0) return b.length > 80 ? b.slice(0, 80).trimEnd() + '…' : b
    }

    // 4. First sentence
    const firstPara = trimmed.split(/\n\s*\n/)[0]?.trim() ?? ''
    const sentenceMatch = firstPara.match(/^[\s\S]+?[。！？.!?](?=\s|$|\n)/)
    if (sentenceMatch?.[0]) {
      const s = sentenceMatch[0].trim()
      return s.length > 80 ? s.slice(0, 80).trimEnd() + '…' : s
    }

    // 5. Hard fallback — first 60 chars
    const flat = trimmed.replace(/\n+/g, ' ').replace(/\s+/g, ' ')
    return flat.length > 60 ? flat.slice(0, 60).trimEnd() + '…' : flat
  })()
  // 摘要永远展示（即使从内容派生），保持双段结构。
  const showSummary = Boolean(derivedSummary && derivedSummary.trim().length > 0)
  const summary = derivedSummary
  const byline = nodeData.domain ? BYLINE_BY_DOMAIN[nodeData.domain] : undefined

  // Quiz 生成处理函数 - 调用真实的 AI API
  const handleGenerateQuiz = async (): Promise<QuizQuestion[]> => {
    try {
      const response = await fetch('/api/quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nodeLabel: nodeData.label,
          nodeDomain: nodeData.domain || '',
          nodeContent: fullContent || summary || nodeData.content || ''
        })
      })

      if (!response.ok) {
        console.error('Quiz API 调用失败:', response.status)
        throw new Error(`Quiz API error: ${response.status}`)
      }

      const questions = await response.json()
      if (!Array.isArray(questions) || questions.length === 0) {
        throw new Error('Invalid quiz response format')
      }
      return questions
    } catch (error) {
      console.error('生成 Quiz 失败:', error)
      // 降级：返回 Mock 数据
      return [
        {
          id: '1',
          question: `关于 ${nodeData.domain} 维度，以下哪个描述最符合 ${nodeData.label} 的核心价值？`,
          options: [
            '通过降低成本提升竞争力',
            '通过创新服务增强客户粘性',
            '通过规模化运营提高效率',
            '通过差异化定位占领市场'
          ],
          correctAnswer: 1,
          explanation: `基于 ${nodeData.label} 的内容分析，该方案的核心在于通过创新服务来增强客户粘性，这与 ${nodeData.domain} 的战略定位高度一致。`,
          difficulty: 'medium'
        },
        {
          id: '2',
          question: `在 ${nodeData.domain} 的实施过程中，最关键的风险因素是什么？`,
          options: ['市场需求不确定性', '技术实现复杂度', '资源投入不足', '竞争对手模仿'],
          correctAnswer: 0,
          explanation: '市场需求的不确定性是该维度最需要关注的风险因素，需要通过持续的市场验证和快速迭代来降低风险。',
          difficulty: 'hard'
        },
        {
          id: '3',
          question: `${nodeData.label} 与哪个 CC-BMC 维度的协同效应最强？`,
          options: [
            '价值主张 (Value Propositions)',
            '客户细分 (Customer Segments)',
            '关键资源 (Key Resources)',
            '成本结构 (Cost Structure)'
          ],
          correctAnswer: 0,
          explanation: '价值主张与该要素之间存在强协同关系，两者相互支撑构成商业模式的核心逻辑。',
          difficulty: 'easy'
        }
      ]
    }
  }

  const tabs: Array<{ id: TabType; label: string; icon: React.ReactNode }> = [
    { id: 'overview',  label: '概览',     icon: <FileText className="w-3 h-3" strokeWidth={1.5} /> },
    { id: 'quiz',      label: 'QUIZ',     icon: <MessageSquare className="w-3 h-3" strokeWidth={1.5} /> },
    { id: 'edit',      label: '编辑',     icon: <Edit3 className="w-3 h-3" strokeWidth={1.5} /> },
    { id: 'resources', label: '资源',     icon: <Link2 className="w-3 h-3" strokeWidth={1.5} /> }
  ]

  return (
    <>
      {/* 遮罩层 — ink at 70% */}
      <div
        className="fixed inset-0 bg-stratum-navy/40 z-40 animate-editorial-swap"
        onClick={closeDetailPanel}
      />

      {/* 抽屉主体 — brutalist 1.5px 边，无阴影无圆角 */}
      <aside
        className="fixed right-0 top-0 bottom-0 max-w-[100vw] bg-white border-l-[1.5px] border-stratum-line z-50 flex flex-col animate-editorial-publish"
        role="dialog"
        aria-modal="true"
        style={{ width: drawerWidth }}
      >
        <ResizeHandle edge="left" onMouseDown={startDrawerDrag} />
        {/* 头部 — byline glyph + Fraunces 标题 + mono 维度 kicker */}
        <header className="flex items-start justify-between gap-3 px-6 py-4 border-b-[1.5px] border-stratum-line shrink-0">
          <div className="flex items-baseline gap-3 min-w-0">
            {byline ? (
              <span
                aria-hidden="true"
                className={`shrink-0 font-display font-[700] text-[28px] leading-none ${byline.tint}`}
              >
                {byline.glyph}
              </span>
            ) : null}
            <div className="min-w-0">
              <p className="font-instr text-[10px] uppercase tracking-kicker text-stratum-muted">
                {nodeData.domain || 'BMC CELL'}
              </p>
              <h2
                className="font-display font-[700] text-[20px] tracking-[0.02em] text-stratum-navy truncate mt-0.5"
                title={nodeData.label}
              >
                {nodeData.label}
              </h2>
            </div>
          </div>
          <button
            onClick={closeDetailPanel}
            className="shrink-0 p-1.5 border-[0.5px] border-stratum-line text-stratum-muted hover:border-stratum-blue/40 hover:text-stratum-navy transition-colors"
            aria-label="关闭"
          >
            <X className="w-4 h-4" strokeWidth={1.5} />
          </button>
        </header>

        {/* 标签栏 — brutalist 1px paper 边的 segmented */}
        <div className="px-6 py-3 border-b-[0.5px] border-stratum-line shrink-0">
          <div className="flex items-stretch border-[1px] border-stratum-line w-fit">
            {tabs.map((tab, idx) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={[
                  TAB_BASE,
                  activeTab === tab.id ? TAB_ACTIVE : TAB_IDLE,
                  idx > 0 ? 'border-l-[1px] border-stratum-line' : '',
                ].join(' ')}
                aria-pressed={activeTab === tab.id}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 内容区 */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {activeTab === 'overview' && (
            <>
              {/* P10.6 · 摘要段（一句话导读，视觉上 LIGHTER than 详细）
                  之前的版本把摘要做成 14px medium + 蓝色立柱，比详细分析
                  还显眼 → 用户觉得"摘要和详细反了"。改回紧凑的 muted
                  导读样式：12px 小字 + 灰色 + 行高 1.5，让人一眼读完
                  就跳到主体。详细分析才是阅读重心。*/}
              {showSummary ? (
                <Section label="核心摘要" sublabel="SUMMARY">
                  {/* P11.6 · summary is now a structured 3-5 item markdown
                      list from the cell-summarizer (deepseek-v4-flash).
                      Custom <li> rendering puts the bold label flush-left
                      with a hairline rule between rows so the structure is
                      visually scannable instead of a wall of comma-prose. */}
                  <div className="max-w-measure-body font-body text-[12.5px] leading-[1.55] text-stratum-ink">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        ul: ({ children }) => (
                          <ul className="m-0 p-0 list-none divide-y-[0.5px] divide-stratum-line border-y-[0.5px] border-stratum-line">
                            {children}
                          </ul>
                        ),
                        li: ({ children }) => (
                          <li className="px-0 py-2 text-stratum-ink [&_strong]:text-stratum-navy [&_strong]:font-display [&_strong]:font-[700] [&_strong]:tracking-tight">
                            {children}
                          </li>
                        ),
                        p: ({ children }) => <span>{children}</span>,
                        strong: ({ children }) => <strong>{children}</strong>,
                      }}
                    >
                      {summary}
                    </ReactMarkdown>
                  </div>
                </Section>
              ) : null}

              {/* 详细分析 — 真正的阅读主体，full prose。Routed through
                  the renderer registry so each agent's output gets its
                  tailored treatment (citations / severity / kind chips). */}
              <Section label="详细分析" sublabel="DETAILED ANALYSIS">
                <div className="max-w-measure-body">
                  {renderAgentOutput({
                    surface: 'drawer',
                    content: fullContent,
                    agentId: agentSignatureToId(nodeData.metadata?.agent_signature as string | undefined),
                    macraType: nodeData.type,
                    // MacraNodeData uses 'medium' but the renderer-registry
                    // context expects the legacy 'moderate'. Normalize inline.
                    severity: nodeData.severity === 'medium' ? 'moderate' : nodeData.severity,
                    domain: nodeData.domain,
                    metadata: {
                      conflictType: nodeData.conflictType,
                      relatedAgents: (nodeData as { relatedAgents?: unknown }).relatedAgents,
                    },
                  })}
                </div>
              </Section>

              {/* 元数据 */}
              {nodeData.metadata && (
                <Section label="元信息" sublabel="METADATA">
                  <dl className="space-y-2.5 font-instr text-[11px] uppercase tracking-kicker">
                    {nodeData.metadata.agent_signature && (
                      <div className="flex items-baseline justify-between gap-3">
                        <dt className="text-stratum-muted">CREATED BY</dt>
                        <dd className={byline?.tint ?? 'text-stratum-navy'}>
                          {nodeData.metadata.agent_signature}
                        </dd>
                      </div>
                    )}
                    {nodeData.metadata.confidence && (
                      <div className="flex items-baseline justify-between gap-3">
                        <dt className="text-stratum-muted">CONF</dt>
                        <dd className="text-stratum-navy">{nodeData.metadata.confidence}</dd>
                      </div>
                    )}
                    {nodeData.metadata.source && (
                      <div className="space-y-1.5">
                        <dt className="text-stratum-muted">SOURCE</dt>
                        <dd className="font-instr text-[11px] tabular-nums text-stratum-navy border-l-[1.5px] border-stratum-line px-2 py-1 normal-case tracking-normal">
                          {nodeData.metadata.source}
                        </dd>
                      </div>
                    )}
                    {nodeData.metadata.cultural_context && (
                      <div className="space-y-1.5">
                        <dt className="text-stratum-muted">CULTURAL CONTEXT</dt>
                        <dd className="font-instr text-[11px] text-stratum-navy border-l-[1.5px] border-stratum-line px-2 py-1 normal-case tracking-normal">
                          {nodeData.metadata.cultural_context}
                        </dd>
                      </div>
                    )}
                    {/* P11.13 / T4.1 · revision badge. BMC cells emerge in
                        round 1 by default; when critic finds high-severity
                        conflicts the supervisor re-runs the relevant agent
                        in round 2 / 3, overwriting the cell in-place via
                        last-write-wins reducer. We surface "this cell was
                        revised in round N" via the round-N tag and the
                        stage='review' field so users see workshop history
                        even though the prior-round content is gone. */}
                    {(() => {
                      const tags = (nodeData.metadata as { tags?: unknown }).tags
                      const roundTag = Array.isArray(tags)
                        ? (tags as string[]).find((t) => /^round-\d+$/.test(t))
                        : undefined
                      const stage = (nodeData.metadata as { stage?: string }).stage
                      if (!roundTag && stage !== 'review') return null
                      const roundNum = roundTag ? roundTag.replace('round-', '') : '?'
                      return (
                        <div className="space-y-1.5 pt-1">
                          <dt className="text-stratum-muted">REVISION · 修订轮次</dt>
                          <dd>
                            <span className="font-instr text-[10px] tabular-nums uppercase tracking-kicker text-white bg-stratum-warn px-1.5 py-0.5 rounded-[1px]">
                              ROUND {roundNum}{stage === 'review' ? ' · 修订' : ''}
                            </span>
                          </dd>
                        </div>
                      )
                    })()}
                    {/* P11.11 · sub-agent provenance. Each BMC cell records
                        which dimension-action sub-agents the parent main
                        agent invoked during its ReAct loop to produce
                        this cell. Renders as a chip list so the user
                        sees the workshop's actual collaboration. */}
                    {Array.isArray((nodeData.metadata as { subAgentsInvoked?: unknown }).subAgentsInvoked)
                      && ((nodeData.metadata as { subAgentsInvoked: string[] }).subAgentsInvoked).length > 0 && (
                      <div className="space-y-1.5 pt-1">
                        <dt className="text-stratum-muted">SUB-AGENTS · 协作子专家</dt>
                        <dd className="flex flex-wrap gap-1">
                          {((nodeData.metadata as { subAgentsInvoked: string[] }).subAgentsInvoked).map((tool) => (
                            <span
                              key={tool}
                              className="font-instr text-[10px] tabular-nums text-stratum-navy border-[0.5px] border-stratum-line px-1.5 py-0.5 normal-case tracking-normal bg-stratum-surface-low/40"
                              title={tool}
                            >
                              {tool}
                            </span>
                          ))}
                        </dd>
                      </div>
                    )}
                  </dl>
                </Section>
              )}
            </>
          )}

          {activeTab === 'quiz' && (
            <QuizPanel
              nodeId={detailPanel.nodeId}
              nodeLabel={nodeData.label}
              domain={nodeData.domain || ''}
              onGenerateQuiz={handleGenerateQuiz}
            />
          )}

          {activeTab === 'edit' && (
            <EditPanel
              nodeId={detailPanel.nodeId}
              label={nodeData.label}
              fullContent={fullContent}
            />
          )}

          {activeTab === 'resources' && (
            <ResourcesPanel
              fullContent={fullContent}
              metadata={nodeData.metadata}
            />
          )}
        </div>
      </aside>
    </>
  )
}

function Section({
  label,
  sublabel,
  children,
}: {
  label: string
  sublabel: string
  children: React.ReactNode
}) {
  return (
    <section>
      <header className="flex items-baseline justify-between mb-2.5 pb-1.5 border-b-[0.5px] border-stratum-line">
        <h3 className="font-display font-[700] text-[13px] tracking-[0.04em] uppercase text-stratum-navy">
          {label}
        </h3>
        <span className="font-instr text-[10px] uppercase tracking-kicker text-stratum-muted">
          {sublabel}
        </span>
      </header>
      <div className="border-[0.5px] border-stratum-line bg-stratum-surface-low px-4 py-3">
        {children}
      </div>
    </section>
  )
}

function Placeholder({
  icon,
  title,
  detail,
}: {
  icon: React.ReactNode
  title: string
  detail: string
}) {
  return (
    <div className="border-[0.5px] border-stratum-line bg-stratum-surface-low px-4 py-8 text-center">
      <div className="flex justify-center mb-3">{icon}</div>
      <p className="font-display font-[700] text-[14px] text-stratum-navy">{title}</p>
      <p className="font-instr text-[10px] uppercase tracking-kicker text-stratum-muted mt-2">
        {detail}
      </p>
    </div>
  )
}

/**
 * P12 · 编辑 tab. Inline edit of label + fullContent. Saves to local
 * comfy-store via updateMacraNode (which propagates to the server-
 * persisted graph on the next applyGraph cycle / explicit re-persist).
 *
 * Edit is local-first: the change shows on the canvas immediately and
 * survives a workspace switch via comfy-store, but does NOT issue an
 * explicit GraphQL mutation to overwrite canvas_graphs. The next BMC
 * pipeline run will overwrite this cell anyway, so persisting an edit
 * across that boundary requires the user to re-trigger generation
 * with the new content as part of seed — out of scope for inline edit.
 */
function EditPanel({
  nodeId,
  label,
  fullContent,
}: {
  nodeId: string
  label: string
  fullContent: string
}) {
  const updateMacraNode = useComfyStore((s) => s.updateMacraNode)
  const [draftLabel, setDraftLabel] = useState(label)
  const [draftContent, setDraftContent] = useState(fullContent)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const dirty = draftLabel !== label || draftContent !== fullContent

  const handleSave = () => {
    updateMacraNode(nodeId, {
      label: draftLabel,
      content: draftContent,
      fullContent: draftContent
    } as Partial<Parameters<typeof updateMacraNode>[1]>)
    setSavedAt(Date.now())
  }
  const handleReset = () => {
    setDraftLabel(label)
    setDraftContent(fullContent)
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block font-instr text-[10px] uppercase tracking-kicker text-stratum-muted mb-1.5">
          标题
        </label>
        <input
          type="text"
          value={draftLabel}
          onChange={(e) => setDraftLabel(e.target.value)}
          className="w-full px-3 py-2 border-[1px] border-stratum-line bg-white text-stratum-ink font-display font-[600] text-[14px] focus:outline-none focus:border-stratum-navy"
          maxLength={120}
        />
      </div>
      <div>
        <label className="block font-instr text-[10px] uppercase tracking-kicker text-stratum-muted mb-1.5">
          完整内容（支持 Markdown）
        </label>
        <textarea
          value={draftContent}
          onChange={(e) => setDraftContent(e.target.value)}
          className="w-full min-h-[260px] px-3 py-2 border-[1px] border-stratum-line bg-white text-stratum-ink font-body text-[12.5px] leading-[1.6] focus:outline-none focus:border-stratum-navy resize-vertical"
          placeholder="支持 Markdown · 引用使用 [[ref:docId#chunkId]] 格式"
        />
        <p className="font-instr text-[9px] uppercase tracking-kicker text-stratum-muted mt-1">
          {draftContent.length} 字 · 修改后只在本地生效，下次 BMC 流程会覆盖
        </p>
      </div>
      <div className="flex items-center gap-2 pt-2 border-t-[0.5px] border-stratum-line">
        <button
          type="button"
          onClick={handleSave}
          disabled={!dirty}
          className="px-3 py-1.5 bg-stratum-navy text-white font-instr text-[10px] uppercase tracking-kicker disabled:opacity-30 disabled:cursor-not-allowed hover:bg-stratum-navy-soft transition-colors"
        >
          保存到画布
        </button>
        <button
          type="button"
          onClick={handleReset}
          disabled={!dirty}
          className="px-3 py-1.5 bg-transparent text-stratum-muted font-instr text-[10px] uppercase tracking-kicker disabled:opacity-30 hover:text-stratum-navy"
        >
          撤销
        </button>
        {savedAt && !dirty ? (
          <span className="ml-auto font-instr text-[9px] uppercase tracking-kicker text-stratum-ok">
            已保存
          </span>
        ) : null}
      </div>
    </div>
  )
}

/**
 * P12 · 资源 tab. Two sources surfaced:
 *   1. KB chunk citations parsed from `[[ref:docId#snippetId]]` patterns
 *      in fullContent. Group by docId, show count of times referenced.
 *   2. Free-text URLs from the cell content (RFC-3986 http(s) only).
 *
 * Click a citation → opens the Evidence drawer (existing surface) so
 * the user can read the underlying KB chunk. URLs open in new tab.
 */
function ResourcesPanel({
  fullContent,
  metadata,
}: {
  fullContent: string
  metadata: Record<string, unknown> | undefined
}) {
  const openEvidenceDrawer = useComfyStore((s) => s.openEvidenceDrawer)
  const closeDetailPanel = useComfyStore((s) => s.closeDetailPanel)
  const [expandedDocId, setExpandedDocId] = useState<string | null>(null)

  // 1. Parse [[ref:docId#snippetId]] citations + capture surrounding
  // context (the sentence/paragraph the citation supports).
  const citations = (() => {
    const re = /\[\[ref:([^\]#]+)#([^\]]+)\]\]/g
    const groups = new Map<string, {
      docId: string
      snippetIds: Set<string>
      count: number
      contexts: string[]
    }>()
    let match
    while ((match = re.exec(fullContent)) !== null) {
      const [, docId, snippetId] = match
      // Capture ~140 chars BEFORE the citation as the supporting context.
      const start = Math.max(0, match.index - 140)
      const end = match.index
      const contextRaw = fullContent
        .slice(start, end)
        .replace(/\n+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
      // Take only the last sentence in that context window.
      const lastSentence = contextRaw.match(/[^。！？.!?]+[。！？.!?]?$/)?.[0]?.trim() ?? contextRaw
      const g = groups.get(docId) ?? { docId, snippetIds: new Set<string>(), count: 0, contexts: [] }
      g.snippetIds.add(snippetId)
      g.count++
      if (lastSentence && g.contexts.length < 3) g.contexts.push(lastSentence)
      groups.set(docId, g)
    }
    return Array.from(groups.values()).sort((a, b) => b.count - a.count)
  })()

  // 2. Extract URLs (markdown link or bare http)
  const urls = (() => {
    const set = new Set<string>()
    // Markdown [text](url)
    for (const m of fullContent.matchAll(/\[[^\]]+\]\((https?:\/\/[^)]+)\)/g)) set.add(m[1])
    // Bare https://...
    for (const m of fullContent.matchAll(/(?<![\(\["])https?:\/\/[^\s)\]\"]+/g)) set.add(m[0])
    return Array.from(set).slice(0, 20)
  })()

  // 3. Optional: any URL stored in metadata.sourceUrl etc.
  const metadataUrls: string[] = []
  if (metadata && typeof metadata === 'object') {
    for (const v of Object.values(metadata)) {
      if (typeof v === 'string' && /^https?:\/\//.test(v)) metadataUrls.push(v)
    }
  }

  if (citations.length === 0 && urls.length === 0 && metadataUrls.length === 0) {
    return (
      <Placeholder
        icon={<Link2 className="w-6 h-6 text-stratum-muted" strokeWidth={1.25} />}
        title="本节点暂无引用资源"
        detail="生成的 BMC 节点会引用 KB 文档；外部链接也会在此列出"
      />
    )
  }

  return (
    <div className="space-y-5">
      {citations.length > 0 ? (
        <div>
          <h4 className="font-instr text-[10px] uppercase tracking-kicker text-stratum-muted mb-2">
            KB 引用 · {citations.length} 篇文档 / {citations.reduce((s, c) => s + c.count, 0)} 处引用
          </h4>
          <ul className="space-y-1.5">
            {citations.map((c) => {
              const isExpanded = expandedDocId === c.docId
              return (
                <li key={c.docId} className="border-[0.5px] border-stratum-line bg-white">
                  <button
                    type="button"
                    onClick={() => setExpandedDocId(isExpanded ? null : c.docId)}
                    className="w-full px-3 py-2 flex items-center justify-between gap-2 hover:bg-stratum-surface-low transition-colors text-left"
                  >
                    <span className="font-mono text-[11px] tabular-nums text-stratum-ink truncate">
                      {c.docId}
                    </span>
                    <span className="font-instr text-[9px] uppercase tracking-kicker text-stratum-muted whitespace-nowrap">
                      {c.count} 处 · {c.snippetIds.size} chunk · {isExpanded ? '收起 ▴' : '展开 ▾'}
                    </span>
                  </button>
                  {isExpanded ? (
                    <div className="border-t-[0.5px] border-stratum-line bg-stratum-surface-low px-3 py-2.5 space-y-2">
                      {c.contexts.length > 0 ? (
                        <div>
                          <p className="font-instr text-[9px] uppercase tracking-kicker text-stratum-muted mb-1">
                            支撑上下文（前 {c.contexts.length} 条）
                          </p>
                          <ul className="space-y-1.5">
                            {c.contexts.map((ctx, i) => (
                              <li key={i} className="text-[12px] leading-[1.55] text-stratum-ink border-l-[2px] border-stratum-blue/40 pl-2">
                                {ctx}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                      <div className="flex items-center gap-2 pt-1.5 border-t-[0.5px] border-stratum-line">
                        <button
                          type="button"
                          onClick={() => {
                            const firstSnippetId = Array.from(c.snippetIds)[0]
                            // Close the BMC drawer first so evidence drawer
                            // isn't overlapped.
                            closeDetailPanel()
                            openEvidenceDrawer(`${c.docId}#${firstSnippetId}`)
                          }}
                          className="font-instr text-[10px] uppercase tracking-kicker text-stratum-blue hover:text-stratum-navy"
                        >
                          在证据抽屉中详读 →
                        </button>
                        <span className="font-instr text-[9px] tracking-kicker text-stratum-muted">
                          ({c.snippetIds.size} 个 chunk)
                        </span>
                      </div>
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}

      {(urls.length > 0 || metadataUrls.length > 0) ? (
        <div>
          <h4 className="font-instr text-[10px] uppercase tracking-kicker text-stratum-muted mb-2">
            外部链接 · {urls.length + metadataUrls.length}
          </h4>
          <ul className="space-y-1">
            {[...urls, ...metadataUrls].map((url, i) => (
              <li key={`${url}-${i}`} className="border-[0.5px] border-stratum-line bg-white px-3 py-1.5">
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block font-mono text-[11px] text-stratum-blue hover:text-stratum-navy break-all"
                >
                  {url}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
