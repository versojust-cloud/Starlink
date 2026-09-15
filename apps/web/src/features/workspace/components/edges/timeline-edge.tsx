'use client'

import { memo } from 'react'
import { EdgeLabelRenderer, type EdgeProps } from 'reactflow'
import clsx from 'clsx'

export const TimelineEdge = memo(function TimelineEdge(props: EdgeProps) {
  const { id, sourceX, sourceY, targetX, targetY, label } = props

  const path = `M ${sourceX} ${sourceY} L ${targetX} ${targetY}`
  const labelX = (sourceX + targetX) / 2
  const labelY = (sourceY + targetY) / 2

  return (
    <g className={clsx('react-flow__edge-timeline')} data-edgeid={id}>
      <path
        d={path}
        stroke="hsl(var(--canvas-primary))"
        strokeWidth={2}
        fill="none"
        markerEnd={`url(#timeline-arrow-${id})`}
      />
      <defs>
        <marker
          id={`timeline-arrow-${id}`}
          viewBox="0 0 10 10"
          refX="10"
          refY="5"
          markerHeight="6"
          markerWidth="6"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="hsl(var(--canvas-primary))" />
        </marker>
      </defs>
      <circle cx={sourceX} cy={sourceY} r={4} fill="hsl(var(--canvas-surface))" stroke="hsl(var(--canvas-primary))" strokeWidth={2} />
      <circle cx={targetX} cy={targetY} r={4} fill="hsl(var(--canvas-surface))" stroke="hsl(var(--canvas-primary))" strokeWidth={2} />
      {label && (
        <EdgeLabelRenderer>
          <div
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
            className="rounded-full border border-canvas-border bg-canvas-surface/90 px-2 py-1 text-xs font-medium text-canvas-text shadow-sm"
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </g>
  )
})
