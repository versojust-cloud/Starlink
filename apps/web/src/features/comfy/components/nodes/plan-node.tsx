'use client'

import { memo, useCallback, useState } from 'react'
import { Handle, Position, type NodeProps } from 'reactflow'
import ReactMarkdown from 'react-markdown'
import { useComfyStore } from '../../store'
import { type MacraNodeData } from '@/types/macra'
import { ClipboardCheck, CheckCircle2, HelpCircle, ChevronDown, ChevronUp } from 'lucide-react'

const STATUS_STYLES = {
  pending: {
    label: '待确认',
    badge: 'bg-amber-500/15 text-amber-300 border-amber-400/30'
  },
  confirmed: {
    label: '已确认',
    badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-400/30'
  },
  'needs-clarification': {
    label: '需补充',
    badge: 'bg-rose-500/15 text-rose-300 border-rose-400/30'
  }
}

export const PlanNode = memo(function PlanNode({ id, data }: NodeProps) {
  const macraNode = useComfyStore((state) => state.macraNodes.get(id))
  const updateMacraNode = useComfyStore((state) => state.updateMacraNode)
  const nodeData = macraNode || (data as MacraNodeData)
  const [isExpanded, setIsExpanded] = useState(false)

  const metadata = nodeData?.metadata || {}
  const status = metadata.semantic_status || 'pending'
  const statusStyle = STATUS_STYLES[status] ?? STATUS_STYLES.pending
  const label = nodeData?.label || '语义确认'
  const summary = nodeData?.summary || nodeData?.content || ''
  const fullContent = nodeData?.fullContent || summary
  const canExpand = fullContent && fullContent !== summary

  const updateStatus = useCallback((nextStatus: MacraNodeData['metadata']['semantic_status']) => {
    if (!nodeData) return
    updateMacraNode(id, {
      metadata: {
        ...nodeData.metadata,
        semantic_status: nextStatus
      }
    })
  }, [id, nodeData, updateMacraNode])

  return (
    <>
      <Handle
        type="target"
        position={Position.Left}
        style={{
          width: 10,
          height: 10,
          background: '#a78bfa',
          border: '2px solid rgb(2 6 23)'
        }}
      />

      <div
        className="group relative w-[340px] overflow-hidden rounded-xl border border-white/[0.08] bg-slate-900/60 backdrop-blur-xl transition-colors hover:border-white/[0.16]"
        style={{ boxShadow: 'inset 3px 0 0 0 #a78bfa' }}
      >
        <div className="relative border-b border-white/[0.06] bg-violet-400/[0.06] px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-violet-400/15 text-violet-300">
                <ClipboardCheck className="h-4 w-4" strokeWidth={1.75} />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-[13px] font-semibold text-white">{label}</h3>
                <p className="mt-0.5 text-[11px] text-slate-400">语义确认 · 计划节点</p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] ${statusStyle.badge}`}
              >
                {statusStyle.label}
              </span>
              {canExpand && (
                <button
                  onClick={() => setIsExpanded((prev) => !prev)}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-white/[0.06] hover:text-slate-200"
                  title={isExpanded ? '收起' : '展开'}
                >
                  {isExpanded ? (
                    <ChevronUp className="h-3.5 w-3.5" strokeWidth={1.75} />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5" strokeWidth={1.75} />
                  )}
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-3 p-4">
          <div className="prose prose-sm prose-invert max-w-none rounded-md border border-white/[0.06] bg-slate-950/40 p-3 text-slate-200">
            <ReactMarkdown>
              {isExpanded ? fullContent : summary || '*暂无语义确认内容*'}
            </ReactMarkdown>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => updateStatus('confirmed')}
              className="inline-flex items-center gap-1.5 rounded-md border border-emerald-400/30 bg-emerald-500/10 px-2 py-1 text-[11px] font-medium text-emerald-300 transition-colors hover:bg-emerald-500/20"
            >
              <CheckCircle2 className="h-3 w-3" strokeWidth={1.75} />
              确认语义
            </button>
            <button
              onClick={() => updateStatus('needs-clarification')}
              className="inline-flex items-center gap-1.5 rounded-md border border-rose-400/30 bg-rose-500/10 px-2 py-1 text-[11px] font-medium text-rose-300 transition-colors hover:bg-rose-500/20"
            >
              <HelpCircle className="h-3 w-3" strokeWidth={1.75} />
              需要补充
            </button>
          </div>
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        style={{
          width: 10,
          height: 10,
          background: '#a78bfa',
          border: '2px solid rgb(2 6 23)'
        }}
      />
    </>
  )
})
