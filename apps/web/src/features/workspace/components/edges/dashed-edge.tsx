'use client'

import { memo } from 'react'
import { BaseEdge, getBezierPath, type EdgeProps } from 'reactflow'
import clsx from 'clsx'

export const DashedEdge = memo(function DashedEdge(props: EdgeProps) {
  const { id, sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, markerEnd } = props

  const [path] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition })

  return (
    <g className={clsx('react-flow__edge-dashed')} data-edgeid={id}>
      <BaseEdge
        path={path}
        markerEnd={markerEnd}
        style={{
          stroke: 'hsl(var(--canvas-primary))',
          strokeWidth: 2,
          strokeDasharray: '6 6'
        }}
      />
      <circle cx={sourceX} cy={sourceY} r={4} fill="hsl(var(--canvas-surface))" stroke="hsl(var(--canvas-primary))" strokeWidth={2} />
      <circle cx={targetX} cy={targetY} r={4} fill="hsl(var(--canvas-surface))" stroke="hsl(var(--canvas-primary))" strokeWidth={2} />
    </g>
  )
})
