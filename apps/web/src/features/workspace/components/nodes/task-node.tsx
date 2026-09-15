'use client'

import type { NodeProps } from 'reactflow'
import type { CanvasNodeData } from '@/types/graph'
import { NodeCard } from './node-card'

type TaskNodeData = Extract<CanvasNodeData, { type: 'task' }>

const STATUS_MAP: Record<TaskNodeData['status'], { label: string; color: string }> = {
  todo: { label: '待开始', color: 'hsl(var(--canvas-subtle))' },
  'in-progress': { label: '进行中', color: 'hsl(var(--canvas-primary))' },
  done: { label: '已完成', color: '#34D399' }
}

export function TaskNode({ data }: NodeProps<TaskNodeData>) {
  const statusConfig = STATUS_MAP[data.status]
  return (
    <div data-testid="canvas-node-task">
      <NodeCard
        icon="✅"
        title={data.title}
        subtitle={data.assignee ? `负责人：${data.assignee}` : '行动项'}
        accent
        width={340}
        footer={<span className="text-xs text-canvas-subtle">拖动到时间线以安排执行</span>}
      >
        <div className="flex items-center justify-between rounded-2xl border border-canvas-border bg-canvas-panel px-4 py-3 text-xs text-canvas-text">
          <span className="font-medium" style={{ color: statusConfig.color }}>
            {statusConfig.label}
          </span>
          {data.dueDate ? <span>截止：{data.dueDate}</span> : <span>尚未安排截止</span>}
        </div>
      </NodeCard>
    </div>
  )
}
