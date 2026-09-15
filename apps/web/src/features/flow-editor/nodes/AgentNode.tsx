'use client'

import { memo } from 'react'
import type { NodeProps } from 'reactflow'
import { BaseNode, type BaseNodeData } from './BaseNode'

const MODELS = ['gpt-4o', 'gpt-4o-mini', 'claude-3.5-sonnet', 'claude-3-opus', 'gemini-pro']

function AgentNodeInner(props: NodeProps<BaseNodeData>) {
  const { data } = props
  const model = (data.config?.model as string) ?? MODELS[0]
  const temperature = (data.config?.temperature as number) ?? 0.7

  return (
    <div className="flex flex-col">
      <BaseNode {...props} />
      <div className="mt-[-1px] rounded-b-lg border border-t-0 border-gray-300 bg-gray-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-800">
        <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
          <span className="font-medium">Model:</span>
          <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300">
            {model}
          </span>
        </div>
        <div className="mt-1 flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
          <span className="font-medium">Temp:</span>
          <div className="flex-1">
            <div className="h-1 w-full rounded-full bg-gray-200 dark:bg-gray-700">
              <div
                className="h-full rounded-full bg-orange-400"
                style={{ width: `${(temperature / 2) * 100}%` }}
              />
            </div>
          </div>
          <span className="tabular-nums">{temperature}</span>
        </div>
      </div>
    </div>
  )
}

export const AgentNode = memo(AgentNodeInner)
