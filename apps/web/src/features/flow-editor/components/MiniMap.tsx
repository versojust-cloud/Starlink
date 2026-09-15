'use client'

import { MiniMap as ReactFlowMiniMap } from 'reactflow'

export function FlowMiniMap() {
  return (
    <ReactFlowMiniMap
      nodeColor={(node) => {
        const color = node.data?.color ?? node.data?.toolDef?.color
        if (color) return color
        switch (node.type) {
          case 'input':
            return '#22c55e'
          case 'output':
            return '#3b82f6'
          default:
            return '#6366f1'
        }
      }}
      nodeStrokeWidth={3}
      maskColor="rgba(15, 23, 42, 0.7)"
      style={{
        backgroundColor: '#1e293b',
        borderRadius: 8,
      }}
      className="!bottom-14 !right-2"
    />
  )
}

export { FlowMiniMap as MiniMap }
