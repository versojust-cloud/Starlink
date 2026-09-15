'use client'

import { ExternalLink, FileText } from 'lucide-react'
import type { NodeProps } from 'reactflow'
import { BaseIdeationNode, MarkdownBody, MetaChip } from './base-ideation-node'
import type { EvidenceNodeData } from '../../types/ideation-types'
import { useIdeationStore } from '../../store/ideation-store'

const SOURCE_LABEL = {
  interview: '一手访谈',
  paper: '文献',
  data: '数据',
  observation: '观察',
  web: '网络',
  other: '其他'
} as const

export function EvidenceNode({ id, data }: NodeProps<EvidenceNodeData>) {
  const removeNode = useIdeationStore((s) => s.removeNode)
  const openInspector = useIdeationStore((s) => s.openInspector)
  return (
    <BaseIdeationNode
      kind="evidence"
      kindLabel="Evidence"
      label={data.label || '证据'}
      icon={<FileText className="h-3.5 w-3.5" strokeWidth={1.75} />}
      onEdit={() => openInspector(id)}
      onDelete={() => removeNode(id)}
      body={<MarkdownBody content={data.content} placeholder="支撑某个假设的事实 / 数据 / 引述。" />}
      metaSlot={
        (data.source || data.citationUrl) && (
          <div className="flex flex-wrap items-center gap-1.5">
            {data.source && (
              <MetaChip kind="evidence">来源·{SOURCE_LABEL[data.source]}</MetaChip>
            )}
            {data.citationUrl && (
              <a
                href={data.citationUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded border border-white/[0.08] bg-white/[0.03] px-1.5 py-0.5 text-[10px] font-medium text-slate-300 transition-colors hover:border-white/[0.16] hover:text-white"
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink className="h-2.5 w-2.5" strokeWidth={1.75} />
                打开
              </a>
            )}
          </div>
        )
      }
    />
  )
}
