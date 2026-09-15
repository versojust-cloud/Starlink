'use client'

import { AlertTriangle } from 'lucide-react'
import type { NodeProps } from 'reactflow'
import { BaseIdeationNode, MarkdownBody, MetaChip } from './base-ideation-node'
import type { RiskNodeData } from '../../types/ideation-types'
import { useIdeationStore } from '../../store/ideation-store'

const SEVERITY_LABEL = {
  low: '低',
  medium: '中',
  high: '高'
} as const

const SEVERITY_COLOR = {
  low: 'bg-slate-400/15 text-slate-200',
  medium: 'bg-orange-400/15 text-orange-200',
  high: 'bg-rose-400/20 text-rose-200'
} as const

const CATEGORY_LABEL = {
  market: '市场',
  tech: '技术',
  regulatory: '合规',
  team: '团队',
  finance: '财务'
} as const

export function RiskNode({ id, data }: NodeProps<RiskNodeData>) {
  const removeNode = useIdeationStore((s) => s.removeNode)
  const openInspector = useIdeationStore((s) => s.openInspector)
  const severity = data.severity ?? 'medium'
  return (
    <BaseIdeationNode
      kind="risk"
      kindLabel="Risk"
      label={data.label || '风险'}
      icon={<AlertTriangle className="h-3.5 w-3.5" strokeWidth={1.75} />}
      onEdit={() => openInspector(id)}
      onDelete={() => removeNode(id)}
      badgeSlot={
        <span
          className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] ${SEVERITY_COLOR[severity]}`}
        >
          {SEVERITY_LABEL[severity]}
        </span>
      }
      body={<MarkdownBody content={data.content} placeholder="什么会让这个想法走不下去？" />}
      metaSlot={
        data.category && (
          <div className="flex flex-wrap items-center gap-1.5">
            <MetaChip kind="risk">类别·{CATEGORY_LABEL[data.category]}</MetaChip>
          </div>
        )
      }
    />
  )
}
