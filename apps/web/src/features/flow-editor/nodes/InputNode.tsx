'use client'

import { memo, useCallback } from 'react'
import { Handle, Position, type NodeProps } from 'reactflow'
import type { BaseNodeData } from './BaseNode'
import { useFlowStore } from '../store/flow-store'

function InputNodeInner({ id, data, selected }: NodeProps<BaseNodeData>) {
  const updateNodeConfig = useFlowStore((s) => s.updateNodeConfig)
  const outputPorts = data.toolDef?.outputPorts ?? data.outputPorts ?? [{ name: 'output', type: 'string' }]
  const userInput = (data.config?.userInput as string) ?? ''

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      updateNodeConfig(id, { userInput: e.target.value })
    },
    [id, updateNodeConfig],
  )

  return (
    <div
      className={`min-w-[200px] rounded-lg border-2 bg-white shadow-md dark:bg-gray-900 ${
        selected
          ? 'border-green-500 ring-2 ring-green-300 dark:ring-green-700'
          : 'border-green-400 dark:border-green-600'
      }`}
    >
      {/* Header */}
      <div className="flex items-center gap-2 rounded-t-md bg-green-500 px-3 py-2 text-white">
        <span className="text-sm">&#9654;</span>
        <span className="text-sm font-medium">Input</span>
      </div>

      {/* Body */}
      <div className="relative px-3 py-2">
        <textarea
          className="w-full resize-none rounded border border-gray-200 bg-gray-50 p-2 text-xs text-gray-800 placeholder-gray-400 focus:border-green-400 focus:outline-none focus:ring-1 focus:ring-green-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
          rows={3}
          placeholder="Enter input..."
          value={userInput}
          onChange={handleChange}
        />

        {/* Output handles */}
        {outputPorts.map((port, i) => (
          <Handle
            key={`out-${port.name}`}
            id={port.name}
            type="source"
            position={Position.Right}
            className="!h-3 !w-3 !rounded-full !border-2 !border-white !bg-green-500"
            style={{ top: `${((i + 1) / (outputPorts.length + 1)) * 100}%` }}
            title={port.description ?? port.name}
          />
        ))}
      </div>
    </div>
  )
}

export const InputNode = memo(InputNodeInner)
