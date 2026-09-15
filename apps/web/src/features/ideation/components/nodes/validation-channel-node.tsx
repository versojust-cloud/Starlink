'use client'

import { Compass } from 'lucide-react'
import type { NodeProps } from 'reactflow'
import { BaseIdeationNode, MarkdownBody, MetaChip } from './base-ideation-node'
import type { ValidationChannelNodeData } from '../../types/ideation-types'
import { useIdeationStore } from '../../store/ideation-store'

const METHOD_LABEL = {
  interview: '用户访谈',
  'landing-page': '落地页测试',
  mvp: 'MVP 实验',
  'desk-research': '桌面调研',
  other: '其他'
} as const

export function ValidationChannelNode({ id, data }: NodeProps<ValidationChannelNodeData>) {
  const removeNode = useIdeationStore((s) => s.removeNode)
  const openInspector = useIdeationStore((s) => s.openInspector)
  return (
    <BaseIdeationNode
      kind="validation-channel"
      kindLabel="Validation"
      label={data.label || '验证渠道'}
      icon={<Compass className="h-3.5 w-3.5" strokeWidth={1.75} />}
      onEdit={() => openInspector(id)}
      onDelete={() => removeNode(id)}
      body={<MarkdownBody content={data.content} placeholder="用什么方式 / 在哪里 / 找谁来验证假设？" />}
      metaSlot={
        (data.method || data.costTime || data.costMoney) && (
          <div className="flex flex-wrap items-center gap-1.5">
            {data.method && (
              <MetaChip kind="validation-channel">{METHOD_LABEL[data.method]}</MetaChip>
            )}
            {data.costTime && (
              <MetaChip kind="validation-channel">⏱ {data.costTime}</MetaChip>
            )}
            {data.costMoney && (
              <MetaChip kind="validation-channel">¥ {data.costMoney}</MetaChip>
            )}
          </div>
        )
      }
    />
  )
}
