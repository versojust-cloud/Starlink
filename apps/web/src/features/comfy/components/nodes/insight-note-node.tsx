'use client'

/**
 * InsightNoteNode — Editorial Boardroom v2 (2026-05-02).
 *
 * The synthesizer's cross-dimension observations land here. Visually
 * a "leader column" — Fraunces title + Geist body, byline-tinted
 * synthesizer glyph (S) instead of the v1 blue Lightbulb icon. No
 * gradients, no glass, no blue glow.
 *
 * Inline edit (label + content) is preserved verbatim from v1; only
 * the input/textarea chrome is restyled.
 */

import { memo, useState, useCallback } from 'react'
import { Handle, Position, type NodeProps } from 'reactflow'
import { useComfyStore } from '../../store'
import { type MacraNodeData } from '@/types/macra'
import { Edit3, Check, X } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

const HANDLE_BASE =
  'h-2 w-2 !border-[0.5px] !border-stratum-blue/60 !bg-stratum-surface-low'

const CONFIDENCE_BAND: Record<'high' | 'medium' | 'low', string> = {
  high:   '100%',
  medium: '66%',
  low:    '33%',
}

export const InsightNoteNode = memo(function InsightNoteNode({ id, data }: NodeProps) {
  const macraNode = useComfyStore((state) => state.macraNodes.get(id))
  const updateMacraNode = useComfyStore((state) => state.updateMacraNode)
  const nodeData = macraNode || (data as MacraNodeData)

  const [isEditing, setIsEditing] = useState(false)
  const [editedContent, setEditedContent] = useState(nodeData?.content || '')
  const [editedLabel, setEditedLabel] = useState(nodeData?.label || '')

  const handleSave = useCallback(() => {
    updateMacraNode(id, {
      content: editedContent,
      label: editedLabel
    })
    setIsEditing(false)
  }, [editedContent, editedLabel, id, updateMacraNode])

  const handleCancel = useCallback(() => {
    setEditedContent(nodeData?.content || '')
    setEditedLabel(nodeData?.label || '')
    setIsEditing(false)
  }, [nodeData])

  const confidence = nodeData?.metadata?.confidence as 'high' | 'medium' | 'low' | undefined

  return (
    <>
      <Handle type="target" position={Position.Left} className={HANDLE_BASE} />

      <article
        className="relative w-[360px] bg-white border-[1px] border-stratum-line hover:border-stratum-blue/40 transition-colors"
        style={{ boxShadow: 'inset 3px 0 0 0 #6B6B7C' /* synthesizer byline edge */ }}
      >
        {/* Header — synthesizer glyph + agent + edit/save buttons */}
        <header className="flex items-baseline gap-3 px-4 pt-3 pb-2 border-b-[0.5px] border-stratum-line">
          <span
            aria-hidden="true"
            className="font-display font-[700] text-[20px] leading-none text-byline-synthesizer shrink-0"
          >
            S
          </span>
          {isEditing ? (
            <input
              type="text"
              value={editedLabel}
              onChange={(e) => setEditedLabel(e.target.value)}
              className="flex-1 font-display font-[700] text-[15px] tracking-[0.02em] bg-stratum-surface-low px-2 py-1 border-[1px] border-stratum-blue/40 focus:outline-none focus:border-stratum-blue text-stratum-navy placeholder:text-stratum-muted"
              placeholder="洞察标题"
              autoFocus
            />
          ) : (
            <div className="flex-1 min-w-0">
              <h3 className="font-display font-[700] text-[15px] tracking-[0.02em] text-stratum-navy truncate">
                {nodeData?.label || '洞察便签'}
              </h3>
              {nodeData?.metadata?.agent_signature ? (
                <p className="font-instr text-[10px] uppercase tracking-kicker text-stratum-muted mt-0.5">
                  来自 <span className="text-byline-synthesizer">{nodeData.metadata.agent_signature}</span>
                </p>
              ) : null}
            </div>
          )}

          <div className="flex shrink-0 items-center gap-1">
            {!isEditing ? (
              <button
                onClick={() => setIsEditing(true)}
                className="flex h-7 w-7 items-center justify-center text-stratum-muted transition-colors hover:bg-stratum-surface-low hover:text-stratum-navy"
                aria-label="编辑"
              >
                <Edit3 className="h-3.5 w-3.5" strokeWidth={1.5} />
              </button>
            ) : (
              <>
                <button
                  onClick={handleSave}
                  className="flex h-7 w-7 items-center justify-center text-stratum-navy transition-colors hover:bg-stratum-navy/10"
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
        </header>

        {/* Body */}
        <div className="px-4 py-3 space-y-3">
          {isEditing ? (
            <textarea
              value={editedContent}
              onChange={(e) => setEditedContent(e.target.value)}
              placeholder="输入洞察内容（支持 Markdown）..."
              className="block h-40 w-full resize-none bg-stratum-surface-low border-[1px] border-stratum-blue/40 px-3 py-2 font-body text-[13px] leading-[1.5] text-stratum-navy placeholder:text-stratum-muted outline-none focus:border-stratum-blue"
            />
          ) : (
            <div className="prose prose-sm font-body text-[13px] leading-[1.55] text-stratum-ink max-w-measure-cell max-h-64 min-h-[80px] overflow-y-auto">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {nodeData?.content || '*这里将展示 AI 生成的洞察和建议*'}
              </ReactMarkdown>
            </div>
          )}

          {/* Confidence */}
          {confidence ? (
            <div className="flex items-center gap-2 font-instr text-[10px] uppercase tracking-kicker text-stratum-muted">
              <span className="text-stratum-muted">CONF</span>
              <div className="flex-1 h-1 bg-stratum-surface-low overflow-hidden">
                <div
                  className="h-full bg-byline-synthesizer transition-all"
                  style={{ width: CONFIDENCE_BAND[confidence] }}
                />
              </div>
              <span className="text-stratum-muted">{confidence}</span>
            </div>
          ) : null}

          {/* Source */}
          {nodeData?.metadata?.source ? (
            <div className="font-instr text-[10px] text-stratum-muted border-l-[1.5px] border-stratum-line px-2 py-1">
              <span className="uppercase tracking-kicker text-stratum-muted">SOURCE</span>
              <span className="ml-2 text-stratum-navy">{nodeData.metadata.source}</span>
            </div>
          ) : null}

          {/* Tags */}
          {nodeData?.metadata?.tags && nodeData.metadata.tags.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {nodeData.metadata.tags.map((tag, idx) => (
                <span
                  key={idx}
                  className="border-[0.5px] border-stratum-line px-1.5 py-0.5 font-instr text-[10px] uppercase tracking-kicker text-stratum-muted"
                >
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </article>

      <Handle type="source" position={Position.Right} className={HANDLE_BASE} />
    </>
  )
})
