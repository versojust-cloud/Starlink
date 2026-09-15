'use client'

import { Frown } from 'lucide-react'
import type { NodeProps } from 'reactflow'
import { BaseIdeationNode, MarkdownBody, MetaChip } from './base-ideation-node'
import type { CustomerPainNodeData } from '../../types/ideation-types'
import { useIdeationStore } from '../../store/ideation-store'

const FREQUENCY_LABEL = {
  frequent: '频繁',
  occasional: '偶尔',
  rare: '少见'
} as const

const INTENSITY_LABEL = {
  mild: '轻微',
  moderate: '中等',
  severe: '严重'
} as const

export function CustomerPainNode({ id, data }: NodeProps<CustomerPainNodeData>) {
  const removeNode = useIdeationStore((s) => s.removeNode)
  const openInspector = useIdeationStore((s) => s.openInspector)
  return (
    <BaseIdeationNode
      kind="customer-pain"
      kindLabel="Customer Pain"
      label={data.label || '客户痛点'}
      icon={<Frown className="h-3.5 w-3.5" strokeWidth={1.75} />}
      onEdit={() => openInspector(id)}
      onDelete={() => removeNode(id)}
      body={<MarkdownBody content={data.content} placeholder="谁在什么情境下遇到这个痛？" />}
      metaSlot={
        (data.frequency || data.intensity) && (
          <div className="flex flex-wrap items-center gap-1.5">
            {data.frequency && (
              <MetaChip kind="customer-pain">频率·{FREQUENCY_LABEL[data.frequency]}</MetaChip>
            )}
            {data.intensity && (
              <MetaChip kind="customer-pain">强度·{INTENSITY_LABEL[data.intensity]}</MetaChip>
            )}
          </div>
        )
      }
    />
  )
}
