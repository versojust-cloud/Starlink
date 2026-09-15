'use client'

import { memo } from 'react'
import { getBezierPath, type EdgeProps } from 'reactflow'

export interface DataEdgeData {
  dataType?: string
}

function DataEdgeInner({
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
}: EdgeProps<DataEdgeData>) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  })

  const dataType = data?.dataType

  return (
    <>
      <path
        id={id}
        className="react-flow__edge-path"
        d={edgePath}
        style={{ stroke: '#94a3b8', strokeWidth: 2, fill: 'none', ...style }}
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
            <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[10px] font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300">
              {dataType}
            </span>
          </div>
        </foreignObject>
      )}
    </>
  )
}

export const DataEdge = memo(DataEdgeInner)
