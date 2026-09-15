'use client'

import { Gem } from 'lucide-react'
import type { NodeProps } from 'reactflow'
import { BaseIdeationNode, MarkdownBody, MetaChip } from './base-ideation-node'
import type { ValueAngleNodeData } from '../../types/ideation-types'
import { useIdeationStore } from '../../store/ideation-store'

export function ValueAngleNode({ id, data }: NodeProps<ValueAngleNodeData>) {
  const removeNode = useIdeationStore((s) => s.removeNode)
  const openInspector = useIdeationStore((s) => s.openInspector)
  return (
    <BaseIdeationNode
      kind="value-angle"
      kindLabel="Value Angle"
      label={data.label || '价值角度'}
      icon={<Gem className="h-3.5 w-3.5" strokeWidth={1.75} />}
      onEdit={() => openInspector(id)}
      onDelete={() => removeNode(id)}
      body={<MarkdownBody content={data.content} placeholder="对客户的具体价值是什么？为什么是你而不是别人？" />}
      metaSlot={
        data.axis && (
          <div className="flex flex-wrap items-center gap-1.5">
            <MetaChip kind="value-angle">差异化·{data.axis}</MetaChip>
          </div>
        )
      }
    />
  )
}
