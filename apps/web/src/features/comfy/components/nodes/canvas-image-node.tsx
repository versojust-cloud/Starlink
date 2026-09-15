'use client'

import { memo } from 'react'
import Image from 'next/image'
import { Handle, Position, type NodeProps } from 'reactflow'
import { Card, CardHeader, CardTitle, CardContent } from '@/shared/components/ui/card'
import type { CanvasNodeData } from '@/types/graph'

type ImageNodeData = Extract<CanvasNodeData, { type: 'image' }>

export const CanvasImageNode = memo(function CanvasImageNode({ data }: NodeProps<ImageNodeData>) {
  if (data.type !== 'image') return null

  return (
    <>
      <Handle type="target" position={Position.Left} className="h-2.5 w-2.5 rounded-full border-2 border-slate-950 bg-violet-400" />
      <Card className="w-80 bg-graph-node border-graph-nodeBorder shadow-lg canvas-panel-node">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm text-zinc-100">{data.title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-xl border border-zinc-700">
            <Image
              src={data.url}
              alt={data.title}
              width={640}
              height={360}
              className="w-full h-auto object-cover"
              unoptimized
            />
          </div>
          <a
            href={data.url}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-block text-xs text-blue-400 underline"
          >
            打开原图
          </a>
        </CardContent>
      </Card>
      <Handle type="source" position={Position.Right} className="h-2.5 w-2.5 rounded-full border-2 border-slate-950 bg-violet-400" />
    </>
  )
})
