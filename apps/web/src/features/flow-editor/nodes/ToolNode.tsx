'use client'

import { memo } from 'react'
import type { NodeProps } from 'reactflow'
import { BaseNode, type BaseNodeData } from './BaseNode'

function ToolNodeInner(props: NodeProps<BaseNodeData>) {
  return <BaseNode {...props} />
}

export const ToolNode = memo(ToolNodeInner)
