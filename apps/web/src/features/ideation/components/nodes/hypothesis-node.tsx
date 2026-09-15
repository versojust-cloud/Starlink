'use client'

import { FlaskConical } from 'lucide-react'
import type { NodeProps } from 'reactflow'
import { BaseIdeationNode, MarkdownBody, MetaChip } from './base-ideation-node'
import type { HypothesisNodeData } from '../../types/ideation-types'
import { useIdeationStore } from '../../store/ideation-store'

const STATUS_LABEL = {
  unverified: '未验证',
  'in-progress': '验证中',
  verified: '已验证',
  falsified: '已证伪'
} as const

const STATUS_COLOR = {
  unverified: 'bg-slate-400/15 text-slate-200',
  'in-progress': 'bg-violet-400/15 text-violet-200',
  verified: 'bg-emerald-400/15 text-emerald-200',
  falsified: 'bg-rose-400/15 text-rose-200'
} as const

export function HypothesisNode({ id, data }: NodeProps<HypothesisNodeData>) {
  const removeNode = useIdeationStore((s) => s.removeNode)
  const openInspector = useIdeationStore((s) => s.openInspector)
  const status = data.status ?? 'unverified'
  return (
    <BaseIdeationNode
      kind="hypothesis"
      kindLabel="Hypothesis"
      label={data.label || '假设'}
      icon={<FlaskConical className="h-3.5 w-3.5" strokeWidth={1.75} />}
      onEdit={() => openInspector(id)}
      onDelete={() => removeNode(id)}
      badgeSlot={
        <span
          className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] ${STATUS_COLOR[status]}`}
        >
          {STATUS_LABEL[status]}
        </span>
      }
      body={
        <>
          {data.claim && (
            <p className="rounded-md border border-violet-300/15 bg-violet-400/[0.06] px-2.5 py-1.5 text-[12px] font-medium text-violet-100/90">
              {data.claim}
            </p>
          )}
          <MarkdownBody
            content={data.content}
            placeholder="一条可证伪的具体假设：X 用户在 Y 情境下，会愿意为 Z 付 W 元。"
          />
          <p className="text-[10px] text-slate-500">
            提示：好的假设是可证伪的、可量化的、可在 1-2 周内 cheap 验证。
          </p>
        </>
      }
      metaSlot={
        <MetaChip kind="hypothesis">状态·{STATUS_LABEL[status]}</MetaChip>
      }
    />
  )
}
