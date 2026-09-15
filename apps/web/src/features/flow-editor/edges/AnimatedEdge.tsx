'use client'

import { memo } from 'react'
import { getBezierPath, type EdgeProps } from 'reactflow'

export interface AnimatedEdgeData {
  dataType?: string
  animated?: boolean
}

function AnimatedEdgeInner({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd,
  data,
}: EdgeProps<AnimatedEdgeData>) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  })

  const isAnimated = data?.animated ?? false
  const dataType = data?.dataType

  return (
    <>
      <path
        id={id}
        className="react-flow__edge-path"
        d={edgePath}
        style={{
          stroke: isAnimated ? '#6366f1' : '#94a3b8',
          strokeWidth: 2,
          fill: 'none',
          strokeDasharray: isAnimated ? '6 3' : 'none',
          animation: isAnimated ? 'dashmove 0.5s linear infinite' : 'none',
          ...style,
        }}
        markerEnd={markerEnd}
      />
      {dataType && (
        <foreignObject
          x={labelX - 30}
          y={labelY - 10}
          width={60}
          height={20}
          requiredExtensions="http://www.w3.org/1999/xhtml"
        >
          <div className="flex items-center justify-center">
            <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-medium text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300">
              {dataType}
            </span>
          </div>
        </foreignObject>
      )}
      {/* Inline keyframes for the dash animation */}
      <style>
        {`
          @keyframes dashmove {
            to { stroke-dashoffset: -9; }
          }
        `}
      </style>
    </>
  )
}

export const AnimatedEdge = memo(AnimatedEdgeInner)
