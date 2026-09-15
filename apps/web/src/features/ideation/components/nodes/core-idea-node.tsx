'use client'

import { Sparkles } from 'lucide-react'
import type { NodeProps } from 'reactflow'
import { BaseIdeationNode, MarkdownBody } from './base-ideation-node'
import type { CoreIdeaNodeData } from '../../types/ideation-types'
import { useIdeationStore } from '../../store/ideation-store'

export function CoreIdeaNode({ id, data }: NodeProps<CoreIdeaNodeData>) {
  const removeNode = useIdeationStore((s) => s.removeNode)
  const openInspector = useIdeationStore((s) => s.openInspector)
  return (
    <BaseIdeationNode
      kind="core-idea"
      kindLabel="Core Idea"
      label={data.label || '核心想法'}
      icon={<Sparkles className="h-3.5 w-3.5" strokeWidth={1.75} />}
      width={360}
      onEdit={() => openInspector(id)}
      onDelete={() => removeNode(id)}
      body={
        <>
          {data.pitch && (
            <p className="rounded-md border border-cyan-300/15 bg-cyan-400/[0.06] px-2.5 py-1.5 text-[12px] italic text-cyan-100/90">
              {data.pitch}
            </p>
          )}
          <MarkdownBody content={data.content} placeholder="一句话描述你的核心想法（pitch）。" />
        </>
      }
    />
  )
}
