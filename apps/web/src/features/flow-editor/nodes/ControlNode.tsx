'use client'

import { memo } from 'react'
import type { NodeProps } from 'reactflow'
import { BaseNode, type BaseNodeData } from './BaseNode'

const CONTROL_ICONS: Record<string, string> = {
  router: '\u2442',
  loop: '\u21BB',
  aggregator: '\u2A00',
}

function ControlNodeInner(props: NodeProps<BaseNodeData>) {
  const { data } = props
  const toolName = (data.config?.controlType as string) ?? data.label?.toLowerCase() ?? ''

  let controlIcon = ''
  for (const [key, icon] of Object.entries(CONTROL_ICONS)) {
    if (toolName.includes(key)) {
      controlIcon = icon
      break
    }
  }

  return (
    <div className="flex flex-col">
      <BaseNode {...props} />
      {controlIcon && (
        <div className="mt-[-1px] flex items-center justify-center rounded-b-lg border border-t-0 border-gray-300 bg-gray-50 py-1.5 dark:border-gray-700 dark:bg-gray-800">
          <span className="text-xl text-gray-500 dark:text-gray-400">{controlIcon}</span>
        </div>
      )}
    </div>
  )
}

export const ControlNode = memo(ControlNodeInner)
