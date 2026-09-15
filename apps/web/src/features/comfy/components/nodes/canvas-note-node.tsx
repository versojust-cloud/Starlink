'use client'

import { memo } from 'react'
import { Handle, Position, type NodeProps } from 'reactflow'
import ReactMarkdown from 'react-markdown'
import { Card, CardHeader, CardTitle, CardContent } from '@/shared/components/ui/card'
import type { CanvasNodeData } from '@/types/graph'

const renderContent = (data: CanvasNodeData) => {
  switch (data.type) {
    case 'note':
      return (
        <>
          <div className="prose prose-sm max-w-none text-stratum-ink">
            <ReactMarkdown>{data.content}</ReactMarkdown>
          </div>
          {data.bullets && data.bullets.length > 0 && (
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-stratum-ink">
              {data.bullets.map((bullet, index) => (
                <li key={index}>{bullet}</li>
              ))}
            </ul>
          )}
          {data.footerText && <p className="mt-3 text-xs text-stratum-muted">{data.footerText}</p>}
        </>
      )
    case 'document':
      return (
        <>
          <p className="text-sm text-stratum-ink">{data.summary}</p>
          {data.points && data.points.length > 0 && (
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-stratum-ink">
              {data.points.map((point, index) => (
                <li key={index}>{point}</li>
              ))}
            </ul>
          )}
        </>
      )
    case 'task':
      return (
        <div className="space-y-2 text-sm text-stratum-ink">
          <p>状态: {data.status}</p>
          {data.assignee && <p>负责人: {data.assignee}</p>}
          {data.dueDate && <p>截止: {data.dueDate}</p>}
        </div>
      )
    case 'reference':
      return (
        <div className="space-y-2 text-sm text-stratum-ink">
          <p>来源: {data.source}</p>
          <p>位置: {data.location}</p>
        </div>
      )
    case 'web':
      return (
        <div className="space-y-2 text-sm text-stratum-ink">
          {data.description && <p>{data.description}</p>}
          <a
            href={data.url}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-blue-400 underline"
          >
            {data.url}
          </a>
        </div>
      )
    case 'image':
      return (
        <div className="space-y-2 text-sm text-stratum-ink">
          <a href={data.url} target="_blank" rel="noreferrer" className="text-xs text-blue-400 underline">
            查看图片
          </a>
        </div>
      )
    default:
      return null
  }
}

export const CanvasNoteNode = memo(function CanvasNoteNode({ data }: NodeProps<CanvasNodeData>) {
  const title = 'title' in data ? data.title : '画布节点'

  return (
    <>
      <Handle type="target" position={Position.Left} className="h-2.5 w-2.5 rounded-full border border-stratum-line bg-white" />
      {/* P8 anti-overlap: clamp note height to 480px (max). When the root
          note carries the wizard-graduation STRONG seed, the body can grow
          to 550+px and overflow into the BMC top row at y=200. We let
          the user scroll inside the node instead. */}
      <Card className="w-96 max-h-[480px] flex flex-col rounded-xl border border-stratum-line bg-white shadow-md transition-shadow hover:shadow-lg">
        <CardHeader className="pb-3 flex-shrink-0">
          <CardTitle className="text-[13px] font-semibold text-stratum-navy">{title}</CardTitle>
        </CardHeader>
        <CardContent className="overflow-y-auto flex-1">{renderContent(data)}</CardContent>
      </Card>
      <Handle type="source" position={Position.Right} className="h-2.5 w-2.5 rounded-full border border-stratum-line bg-white" />
    </>
  )
})
