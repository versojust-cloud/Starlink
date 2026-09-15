'use client'

import { memo, useState, useCallback } from 'react'
import { Handle, Position, type NodeProps } from 'reactflow'
import { useComfyStore } from '../../store'
import { CC_BMC_DOMAINS, type CCBMCDomain, type MacraNodeData } from '@/types/macra'
import { Edit3, Check, X, Info, ChevronDown, Maximize2, Minimize2 } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { CitationBadge } from '../citation-badge'
import { useCardHighlightClass } from '../../hooks/use-citation-highlight'

// Editorial Boardroom v2 visual scheme (2026-05-01).
// Replaces the previous 9-color "Tech-Luxe Gradient" palette (emoji
// icons + amber/emerald/cyan/violet/pink gradients) with a 3-owner
// byline system: each BMC dimension maps to whichever agent owns it
// (market / product / finance), and the visual cue is a single
// Fraunces letter byline + a muted byline-color edge — NOT a 9-color
// rainbow that read as decoration. Press-red is reserved elsewhere
// for HITL / debate active and never appears here.
type BylineKey = 'market' | 'product' | 'finance'

interface DimByline {
  /** Single Fraunces letter — M / P / F. */
  glyph: string
  /** Tailwind class for byline-tinted text. */
  tintClass: string
  /** Hex for the 3px inset edge bar (low-saturation, muted). */
  edgeHex: string
  /** Owner agent role (matches byline-{role} colors in tailwind config). */
  byline: BylineKey
}

const BYLINE: Record<BylineKey, DimByline> = {
  market:  { glyph: 'M', tintClass: 'text-byline-market',  edgeHex: '#9B8E70', byline: 'market'  },
  product: { glyph: 'P', tintClass: 'text-byline-product', edgeHex: '#7A8B7E', byline: 'product' },
  finance: { glyph: 'F', tintClass: 'text-byline-finance', edgeHex: '#6E7A8C', byline: 'finance' },
}

// 9 BMC dims → 3 owners. The mapping mirrors agentNodeForBmcDomain
// in business-langgraph.ts so the front-of-page byline matches the
// agent that actually authored the cell.
const DOMAIN_TO_BYLINE: Record<CCBMCDomain, DimByline> = {
  [CC_BMC_DOMAINS.CUSTOMER_SEGMENTS]:        BYLINE.market,
  [CC_BMC_DOMAINS.CUSTOMER_RELATIONSHIPS]:   BYLINE.market,
  [CC_BMC_DOMAINS.CHANNELS]:                 BYLINE.market,
  [CC_BMC_DOMAINS.VALUE_PROPOSITIONS]:       BYLINE.product,
  [CC_BMC_DOMAINS.KEY_RESOURCES]:            BYLINE.product,
  [CC_BMC_DOMAINS.KEY_ACTIVITIES]:           BYLINE.product,
  [CC_BMC_DOMAINS.KEY_PARTNERSHIPS]:         BYLINE.product,
  [CC_BMC_DOMAINS.REVENUE_STREAMS]:          BYLINE.finance,
  [CC_BMC_DOMAINS.COST_STRUCTURE]:           BYLINE.finance,
}

export const CCBMCCardNode = memo(function CCBMCCardNode({ id, data }: NodeProps) {
  const macraNode = useComfyStore((state) => state.macraNodes.get(id))
  const updateMacraNode = useComfyStore((state) => state.updateMacraNode)
  const openDetailPanel = useComfyStore((state) => state.openDetailPanel)
  const nodeData = macraNode || (data as MacraNodeData)

  const [isEditing, setIsEditing] = useState(false)
  const [editedContent, setEditedContent] = useState(nodeData?.content || '')
  const [editedLabel, setEditedLabel] = useState(nodeData?.label || '')
  const [showMetadata, setShowMetadata] = useState(false)
  const [showDomainSelector, setShowDomainSelector] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false) // 展开/折叠状态

  const domain = nodeData?.domain || CC_BMC_DOMAINS.VALUE_PROPOSITIONS
  const byline = DOMAIN_TO_BYLINE[domain]
  const rawData = data as Record<string, unknown>
  const meta = rawData.meta as { summary?: string; fullContent?: string } | undefined

  // Citation 相关
  const cardCitations = useComfyStore((state) => state.citations[id])
  const knowledgeEvidence = useComfyStore((state) => state.knowledgeEvidence)
  const openEvidenceDrawer = useComfyStore((state) => state.openEvidenceDrawer)
  const highlightClass = useCardHighlightClass(id)
  const contentCitation = cardCitations?.find((c) => c.fieldName === 'content')
  const metaForCitation = rawData.meta as
    | { citations?: unknown; noRefRanges?: unknown[]; groundingRate?: number; invalidRefs?: unknown[] }
    | undefined
  const groundingRate = metaForCitation?.groundingRate
  const noRefCount = Array.isArray(metaForCitation?.noRefRanges) ? metaForCitation!.noRefRanges.length : 0

  // 从 meta 中获取 summary 和 fullContent
  const summary = meta?.summary || nodeData?.content || ''
  const fullContent = meta?.fullContent || nodeData?.content || ''
  const hasExtendedContent = summary !== fullContent && fullContent.length > summary.length

  const handleSave = useCallback(() => {
    updateMacraNode(id, {
      content: editedContent,
      label: editedLabel
    })
    setIsEditing(false)
  }, [id, editedContent, editedLabel, updateMacraNode])

  const handleCancel = useCallback(() => {
    setEditedContent(nodeData?.content || '')
    setEditedLabel(nodeData?.label || '')
    setIsEditing(false)
  }, [nodeData])

  const handleDomainChange = useCallback((newDomain: CCBMCDomain) => {
    updateMacraNode(id, { domain: newDomain })
    setShowDomainSelector(false)
  }, [id, updateMacraNode])

  return (
    <>
      <Handle
        type="target"
        position={Position.Top}
        style={{
          width: 8,
          height: 8,
          background: '#2A2826',          // ink-ash2 — quiet handle
          border: '0.5px solid rgba(244,240,232,0.4)' // paper/40
        }}
      />

      <div
        className={`group relative w-[340px] overflow-hidden border-[1px] border-stratum-line bg-white transition-colors hover:border-stratum-blue/40 ${highlightClass}`}
        style={{
          // 3px left edge in muted byline color — semantic at-a-glance
          // owner cue (M/P/F) without the 9-color rainbow.
          boxShadow: `inset 3px 0 0 0 ${byline.edgeHex}`
        }}
      >
        {/* 顶部栏 — Fraunces 标题 + 单字母 byline glyph */}
        <div className="relative border-b-[0.5px] border-stratum-line px-4 py-3">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              {/* Display-serif byline glyph replaces the 9 emoji icons.
                  Single letter, byline-tinted; reads as a printer's mark. */}
              <span
                aria-hidden="true"
                className={`shrink-0 font-display font-[700] text-[24px] leading-none ${byline.tintClass}`}
              >
                {byline.glyph}
              </span>
              {isEditing ? (
                <input
                  type="text"
                  value={editedLabel}
                  onChange={(e) => setEditedLabel(e.target.value)}
                  className="flex-1 font-display font-[700] text-[15px] tracking-[0.02em] bg-stratum-surface-low px-3 py-2 border-[1px] border-stratum-blue/40 focus:outline-none focus:border-stratum-blue text-stratum-navy placeholder-stratum-muted"
                  placeholder="标题"
                  autoFocus
                />
              ) : (
                <h3
                  className="flex-1 font-display font-[700] text-[15px] tracking-[0.02em] text-stratum-navy uppercase truncate"
                  title={nodeData?.label || ''}
                >
                  {nodeData?.label || '未命名'}
                </h3>
              )}
            </div>

            <div className="flex items-center gap-1">
              {!isEditing ? (
                <>
                  <button
                    onClick={() => setShowMetadata(!showMetadata)}
                    className="flex h-7 w-7 items-center justify-center text-stratum-muted transition-colors hover:bg-stratum-surface-low hover:text-stratum-navy"
                    aria-label="切换元信息"
                  >
                    <Info className="h-3.5 w-3.5" strokeWidth={1.5} />
                  </button>
                  <button
                    onClick={() => setIsEditing(true)}
                    className="flex h-7 w-7 items-center justify-center text-stratum-muted transition-colors hover:bg-stratum-surface-low hover:text-stratum-navy"
                    aria-label="编辑卡片"
                  >
                    <Edit3 className="h-3.5 w-3.5" strokeWidth={1.5} />
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={handleSave}
                    className="flex h-7 w-7 items-center justify-center text-stratum-navy transition-colors hover:bg-stratum-blue/10"
                    aria-label="保存"
                  >
                    <Check className="h-3.5 w-3.5" strokeWidth={2} />
                  </button>
                  <button
                    onClick={handleCancel}
                    className="flex h-7 w-7 items-center justify-center text-stratum-muted transition-colors hover:bg-stratum-surface-low hover:text-stratum-navy"
                    aria-label="取消"
                  >
                    <X className="h-3.5 w-3.5" strokeWidth={2} />
                  </button>
                </>
              )}
            </div>
          </div>

          {/* 维度标签 — mono kicker，brutalist 边框，无渐变 */}
          <div className="relative">
            <button
              onClick={() => setShowDomainSelector(!showDomainSelector)}
              className={`flex w-full items-center justify-between border-[0.5px] border-stratum-line bg-stratum-surface-low px-3 py-1.5 font-instr text-[10px] uppercase tracking-kicker transition-colors hover:border-stratum-blue/60 ${byline.tintClass}`}
            >
              <span>{domain}</span>
              <ChevronDown className="h-3.5 w-3.5" strokeWidth={1.5} />
            </button>

            {showDomainSelector && (
              <div className="absolute top-full left-0 right-0 mt-1 z-50 max-h-72 overflow-y-auto bg-white border-[1px] border-stratum-blue/40">
                {Object.values(CC_BMC_DOMAINS).map((d) => {
                  const dByline = DOMAIN_TO_BYLINE[d]
                  return (
                    <button
                      key={d}
                      onClick={() => handleDomainChange(d)}
                      className="w-full px-3 py-2 text-left transition-colors flex items-center gap-3 hover:bg-stratum-surface-low border-b-[0.5px] border-stratum-line last:border-0"
                    >
                      <span
                        aria-hidden="true"
                        className={`shrink-0 font-display font-[700] text-[16px] leading-none ${dByline.tintClass}`}
                      >
                        {dByline.glyph}
                      </span>
                      <span className="flex-1 font-instr text-[10px] uppercase tracking-kicker text-stratum-navy">
                        {d}
                      </span>
                      {d === domain && (
                        <Check className="w-3.5 h-3.5 text-stratum-navy" strokeWidth={1.5} />
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* 内容区 */}
        <div className="relative px-4 py-3">
          {isEditing ? (
            <textarea
              value={editedContent}
              onChange={(e) => setEditedContent(e.target.value)}
              placeholder="输入内容（支持 Markdown）"
              className="w-full h-36 bg-stratum-surface-low border-[1px] border-stratum-blue/40 px-3 py-2 font-body text-[13px] resize-none focus:outline-none focus:border-stratum-blue placeholder-stratum-muted text-stratum-navy"
            />
          ) : (
            <>
              <div
                className={`prose prose-sm max-w-measure-cell font-body text-[13px] leading-[1.55] text-stratum-ink overflow-hidden transition-all duration-300 ${isExpanded ? 'max-h-none' : 'max-h-32'}`}
              >
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{isExpanded ? fullContent : summary || '*暂无内容*'}</ReactMarkdown>
              </div>

              {(contentCitation || noRefCount > 0 || typeof groundingRate === 'number') && (
                <div
                  className="mt-3 flex flex-wrap items-center gap-2 border-t-[0.5px] border-stratum-line pt-2 font-instr text-[10px] text-stratum-muted"
                  data-testid="citation-footer"
                >
                  <span className="uppercase tracking-kicker text-stratum-muted">
                    REFS
                  </span>
                  {contentCitation?.spans.map((span, i) => {
                    const primary = span.refs[0]
                    if (!primary) return null
                    const evidence = knowledgeEvidence.find((e) => {
                      const r = e as { id?: string; docId?: string }
                      return r.id === primary.evidenceId || r.docId === primary.docId
                    })
                    const score = (evidence as { score?: number } | undefined)?.score
                    return (
                      <CitationBadge
                        key={`${primary.evidenceId}-${i}`}
                        variant="ref"
                        index={i + 1}
                        docId={primary.docId}
                        score={score}
                        onClick={() => openEvidenceDrawer(primary.evidenceId, i)}
                      />
                    )
                  })}
                  {noRefCount > 0 && (
                    <span className="inline-flex items-center gap-1 border-[0.5px] border-stratum-danger/40 px-1.5 py-0.5 font-instr text-[9px] tabular-nums text-stratum-danger">
                      <CitationBadge variant="no-ref" className="mx-0 h-3 w-3" />
                      <span>{noRefCount} 无引用</span>
                    </span>
                  )}
                  {typeof groundingRate === 'number' && (() => {
                    // Sprint 3.1 · grounding rate gate.
                    // < 30% = red (low evidence — likely speculation or
                    // out-of-KB claims); 30-60% = amber; >= 60% = neutral.
                    const isLow = groundingRate < 0.3
                    const isMid = !isLow && groundingRate < 0.6
                    const tone = isLow
                      ? 'text-stratum-danger'
                      : isMid
                      ? 'text-stratum-warn'
                      : 'text-stratum-muted'
                    return (
                      <span
                        className={`ml-auto font-instr text-[9px] tabular-nums uppercase tracking-kicker ${tone}`}
                        title={
                          isLow
                            ? '证据率偏低 (<30%) — 这条断言主要靠模型推理，建议补充 KB 资料或核对'
                            : isMid
                            ? '证据率中等 — 部分断言已引用'
                            : '证据率良好 — 多数断言已引用 KB'
                        }
                      >
                        <span className="text-stratum-muted">GROUNDING</span>{' '}
                        {(groundingRate * 100).toFixed(0)}%
                        {isLow && <span className="ml-1">⚠</span>}
                      </span>
                    )
                  })()}
                </div>
              )}

              {/* 展开/折叠按钮.
                  taste-skill Rule 5: tactile press feedback —
                  scale + translate-y on :active. transform-only
                  to stay on GPU. */}
              {hasExtendedContent && (
                <button
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="mt-3 inline-flex items-center gap-1.5 border-[0.5px] border-stratum-line px-2 py-1 font-instr text-[10px] uppercase tracking-kicker text-stratum-muted transition-[color,border-color,transform] duration-150 ease-out hover:border-stratum-blue/60 hover:text-stratum-navy active:scale-[0.97] active:translate-y-px"
                >
                  {isExpanded ? (
                    <>
                      <Minimize2 className="h-3 w-3" strokeWidth={1.5} />
                      收起
                    </>
                  ) : (
                    <>
                      <Maximize2 className="h-3 w-3" strokeWidth={1.5} />
                      展开
                    </>
                  )}
                </button>
              )}
            </>
          )}

          {/* 元数据 — 单色 + mono + brutalist 进度条 */}
          {showMetadata && nodeData?.metadata && (
            <div className="mt-3 pt-3 border-t-[0.5px] border-stratum-line space-y-2.5">
              {nodeData.metadata.agent_signature && (
                <div className="flex items-baseline gap-2 font-instr text-[10px] uppercase tracking-kicker text-stratum-muted">
                  <span className="text-stratum-muted shrink-0">CREATED BY</span>
                  <span className={`font-instr ${byline.tintClass}`}>
                    {nodeData.metadata.agent_signature}
                  </span>
                </div>
              )}

              {nodeData.metadata.confidence && (
                <div className="flex items-center gap-2 font-instr text-[10px] uppercase tracking-kicker text-stratum-muted">
                  <span className="text-stratum-muted shrink-0">CONF</span>
                  <div className="flex-1 h-1 bg-stratum-surface-low overflow-hidden">
                    <div
                      className="h-full transition-all"
                      style={{
                        width: nodeData.metadata.confidence === 'high' ? '100%' :
                               nodeData.metadata.confidence === 'medium' ? '66%' : '33%',
                        background: byline.edgeHex
                      }}
                    />
                  </div>
                </div>
              )}

              {nodeData.metadata.source && (
                <div className="font-instr text-[10px] text-stratum-muted border-l-[1.5px] border-stratum-line px-2 py-1">
                  <span className="uppercase tracking-kicker text-stratum-muted">SOURCE</span>
                  <span className="ml-2 text-stratum-navy">{nodeData.metadata.source}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 底部署名栏 */}
        <div className="flex items-baseline justify-between border-t-[0.5px] border-stratum-line px-4 py-2">
          {/* Agent 署名 */}
          <div className="flex min-w-0 items-baseline gap-2 font-instr text-[10px] uppercase tracking-kicker">
            <span className="text-stratum-muted">BY</span>
            <span className={byline.tintClass}>
              {nodeData?.metadata?.agent_signature || 'AI Agent'}
            </span>
            {nodeData?.metadata?.confidence && (
              <span className="text-stratum-muted">
                · CONF <span className="text-stratum-muted">{nodeData.metadata.confidence}</span>
              </span>
            )}
          </div>

          {/* 查看详情按钮 */}
          <button
            onClick={() => openDetailPanel(id)}
            className="inline-flex items-center gap-1 border-[0.5px] border-stratum-line px-2 py-0.5 font-instr text-[10px] uppercase tracking-kicker text-stratum-muted transition-colors hover:border-stratum-blue/60 hover:text-stratum-navy"
          >
            <Maximize2 className="h-3 w-3" strokeWidth={1.5} />
            详情
          </button>
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        style={{
          width: 8,
          height: 8,
          background: '#2A2826',          // ink-ash2
          border: '0.5px solid rgba(244,240,232,0.4)'  // paper/40
        }}
      />
    </>
  )
})
