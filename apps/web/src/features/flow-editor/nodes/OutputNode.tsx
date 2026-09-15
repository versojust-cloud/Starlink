'use client'

import { memo } from 'react'
import { Handle, Position, type NodeProps } from 'reactflow'
import type { BaseNodeData } from './BaseNode'

function OutputNodeInner({ data, selected }: NodeProps<BaseNodeData>) {
  const inputPorts = data.toolDef?.inputPorts ?? data.inputPorts ?? [{ name: 'input', type: 'string' }]
  const output = (data.config?.output as string) ?? ''
  const truncated = output.length > 200 ? output.slice(0, 200) + '...' : output

  return (
    <div
      className={`min-w-[200px] rounded-lg border-2 bg-white shadow-md dark:bg-gray-900 ${
        selected
          ? 'border-blue-500 ring-2 ring-blue-300 dark:ring-blue-700'
          : 'border-blue-400 dark:border-blue-600'
      }`}
    >
      {/* Header */}
      <div className="flex items-center gap-2 rounded-t-md bg-blue-500 px-3 py-2 text-white">
        <span className="text-sm">&#9632;</span>
        <span className="text-sm font-medium">Output</span>
      </div>

      {/* Body */}
      <div className="relative px-3 py-2">
        {/* Input handles */}
        {inputPorts.map((port, i) => (
          <Handle
            key={`in-${port.name}`}
            id={port.name}
            type="target"
            position={Position.Left}
            className="!h-3 !w-3 !rounded-full !border-2 !border-white !bg-blue-500"
            style={{ top: `${((i + 1) / (inputPorts.length + 1)) * 100}%` }}
            title={port.description ?? port.name}
          />
        ))}

        {/* Output preview */}
        {truncated ? (
          <div className="rounded bg-gray-50 p-2 text-xs text-gray-700 dark:bg-gray-800 dark:text-gray-300">
            <p className="whitespace-pre-wrap break-words font-mono">{truncated}</p>
          </div>
        ) : (
          <p className="text-xs italic text-gray-400 dark:text-gray-500">
            No output yet
          </p>
        )}
      </div>
    </div>
  )
}

export const OutputNode = memo(OutputNodeInner)
