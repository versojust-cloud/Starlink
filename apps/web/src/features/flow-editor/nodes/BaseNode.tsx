'use client'

import { memo } from 'react'
import { Handle, Position, type NodeProps } from 'reactflow'

export interface PortDef {
  name: string
  type: string
  description?: string
  required?: boolean
}

export interface ToolDef {
  label: string
  icon?: string
  color?: string
  inputPorts?: PortDef[]
  outputPorts?: PortDef[]
  category?: string
}

export interface BaseNodeData {
  toolDef?: ToolDef
  label?: string
  icon?: string
  color?: string
  inputPorts?: PortDef[]
  outputPorts?: PortDef[]
  category?: string
  config: Record<string, unknown>
  status?: 'pending' | 'running' | 'completed' | 'failed'
  progress?: number
}

function resolveToolDef(data: BaseNodeData): ToolDef {
  if (data.toolDef) return data.toolDef
  return {
    label: data.label ?? 'Node',
    icon: data.icon,
    color: data.color,
    inputPorts: data.inputPorts,
    outputPorts: data.outputPorts,
    category: data.category,
  }
}

function StatusSection({ status, progress }: { status?: string; progress?: number }) {
  if (!status || status === 'pending') return null

  return (
    <div className="px-3 py-2 border-t border-gray-200 dark:border-gray-700">
      <div className="flex items-center gap-2 text-xs">
        {status === 'running' && (
          <>
            <svg
              className="h-3.5 w-3.5 animate-spin text-blue-500"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
              />
            </svg>
            <span className="text-blue-600 dark:text-blue-400">Running...</span>
          </>
        )}
        {status === 'completed' && (
          <>
            <svg className="h-3.5 w-3.5 text-green-500" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                clipRule="evenodd"
              />
            </svg>
            <span className="text-green-600 dark:text-green-400">Completed</span>
          </>
        )}
        {status === 'failed' && (
          <>
            <svg className="h-3.5 w-3.5 text-red-500" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
            <span className="text-red-600 dark:text-red-400">Failed</span>
          </>
        )}
      </div>
      {typeof progress === 'number' && progress > 0 && (
        <div className="mt-1.5 h-1.5 w-full rounded-full bg-gray-200 dark:bg-gray-700">
          <div
            className="h-full rounded-full bg-blue-500 transition-all duration-300"
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          />
        </div>
      )}
    </div>
  )
}

function BaseNodeInner({ data, selected }: NodeProps<BaseNodeData>) {
  const toolDef = resolveToolDef(data)
  const headerColor = toolDef.color ?? '#6366f1'
  const inputPorts = toolDef.inputPorts ?? []
  const outputPorts = toolDef.outputPorts ?? []

  return (
    <div
      className={`min-w-[180px] rounded-lg border bg-white shadow-md dark:bg-gray-900 ${
        selected
          ? 'border-blue-500 ring-2 ring-blue-300 dark:ring-blue-700'
          : 'border-gray-300 dark:border-gray-700'
      }`}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 rounded-t-lg px-3 py-2 text-white"
        style={{ backgroundColor: headerColor }}
      >
        {toolDef.icon && <span className="text-sm">{toolDef.icon}</span>}
        <span className="truncate text-sm font-medium">{toolDef.label}</span>
      </div>

      {/* Handles + body */}
      <div className="relative">
        {/* Input handles */}
        {inputPorts.map((port, i) => (
          <Handle
            key={`in-${port.name}`}
            id={port.name}
            type="target"
            position={Position.Left}
            className="!h-3 !w-3 !rounded-full !border-2 !border-white !bg-gray-400 dark:!bg-gray-500"
            style={{ top: `${((i + 1) / (inputPorts.length + 1)) * 100}%` }}
            title={port.description ?? port.name}
          />
        ))}

        {/* Output handles */}
        {outputPorts.map((port, i) => (
          <Handle
            key={`out-${port.name}`}
            id={port.name}
            type="source"
            position={Position.Right}
            className="!h-3 !w-3 !rounded-full !border-2 !border-white !bg-indigo-500"
            style={{ top: `${((i + 1) / (outputPorts.length + 1)) * 100}%` }}
            title={port.description ?? port.name}
          />
        ))}

        {/* Port labels */}
        {(inputPorts.length > 0 || outputPorts.length > 0) && (
          <div className="flex justify-between px-3 py-2 text-[10px] text-gray-500 dark:text-gray-400">
            <div className="flex flex-col gap-0.5">
              {inputPorts.map((p) => (
                <span key={p.name}>{p.name}</span>
              ))}
            </div>
            <div className="flex flex-col items-end gap-0.5">
              {outputPorts.map((p) => (
                <span key={p.name}>{p.name}</span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Status */}
      <StatusSection status={data.status} progress={data.progress} />
    </div>
  )
}

export const BaseNode = memo(BaseNodeInner)
