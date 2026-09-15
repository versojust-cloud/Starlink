'use client'

import { TrendingUp } from 'lucide-react'
import type { NodeProps } from 'reactflow'
import { BaseIdeationNode, MarkdownBody, MetaChip } from './base-ideation-node'
import type { RevenueNodeData } from '../../types/ideation-types'
import { useIdeationStore } from '../../store/ideation-store'

const MODEL_LABEL = {
  subscription: '订阅',
  transaction: '交易抽成',
  license: '授权',
  ads: '广告',
  service: '服务',
  other: '其他'
} as const

export function RevenueNode({ id, data }: NodeProps<RevenueNodeData>) {
  const removeNode = useIdeationStore((s) => s.removeNode)
  const openInspector = useIdeationStore((s) => s.openInspector)
  return (
    <BaseIdeationNode
      kind="revenue"
      kindLabel="Revenue"
      label={data.label || '收入流'}
      icon={<TrendingUp className="h-3.5 w-3.5" strokeWidth={1.75} />}
      onEdit={() => openInspector(id)}
      onDelete={() => removeNode(id)}
      body={<MarkdownBody content={data.content} placeholder="如何收钱？谁付钱？付多少？" />}
      metaSlot={
        (data.model || data.unitEconomics) && (
          <div className="flex flex-wrap items-center gap-1.5">
            {data.model && (
              <MetaChip kind="revenue">模式·{MODEL_LABEL[data.model]}</MetaChip>
            )}
            {data.unitEconomics && (
              <MetaChip kind="revenue">单位·{data.unitEconomics}</MetaChip>
            )}
          </div>
        )
      }
    />
  )
}
