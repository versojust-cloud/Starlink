'use client'

import { useCallback } from 'react'
import type { Node } from 'reactflow'
import { useFlowStore } from '../store/flow-store'

interface SchemaProperty {
  type?: string
  enum?: string[]
  description?: string
  default?: unknown
  title?: string
}

interface InputSchema {
  properties?: Record<string, SchemaProperty>
}

interface ConfigPanelProps {
  node?: Node | null
  onUpdateConfig?: (key: string, value: unknown) => void
  onClose?: () => void
}

export function ConfigPanel({ node, onUpdateConfig, onClose }: ConfigPanelProps) {
  const nodes = useFlowStore((s) => s.nodes)
  const selectedNodeId = useFlowStore((s) => s.selectedNodeId)
  const updateNodeConfig = useFlowStore((s) => s.updateNodeConfig)

  const selectedNode = node ?? nodes.find((n) => n.id === selectedNodeId) ?? null

  const handleChange = useCallback(
    (key: string, value: unknown) => {
      if (selectedNode?.id && onUpdateConfig) {
        onUpdateConfig(key, value)
        return
      }

      if (!selectedNodeId) return
      updateNodeConfig(selectedNodeId, { [key]: value })
    },
    [onUpdateConfig, selectedNode?.id, selectedNodeId, updateNodeConfig],
  )

  if (!selectedNode) {
    return (
      <div className="flex h-full w-72 items-center justify-center border-l border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
        <p className="text-sm text-gray-400">Select a node to configure</p>
      </div>
    )
  }

  const { data } = selectedNode
  const toolDef = data.toolDef ?? data
  const inputSchema = (toolDef.inputSchema as InputSchema | undefined) ?? {}
  const properties = inputSchema.properties ?? {}
  const config = (data.config as Record<string, unknown>) ?? {}

  return (
    <div className="flex h-full w-72 flex-col border-l border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
      {/* Header */}
      <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-700">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
              {toolDef.label ?? 'Node Config'}
            </h3>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              {toolDef.category ?? 'General'}
            </p>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="text-xs text-gray-400 transition-colors hover:text-gray-200"
            >
              Close
            </button>
          )}
        </div>
      </div>

      {/* Fields */}
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {Object.keys(properties).length === 0 && (
          <p className="text-xs text-gray-400">No configurable properties</p>
        )}

        {Object.entries(properties).map(([key, prop]) => {
          const label = prop.title ?? key
          const value = config[key] ?? prop.default ?? ''

          // Select with enum
          if (prop.enum && prop.enum.length > 0) {
            return (
              <div key={key}>
                <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                  {label}
                </label>
                {prop.description && (
                  <p className="mb-1 text-[10px] text-gray-400">{prop.description}</p>
                )}
                <select
                  value={String(value)}
                  onChange={(e) => handleChange(key, e.target.value)}
                  className="w-full rounded-md border border-gray-300 bg-gray-50 px-2 py-1.5 text-sm text-gray-800 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
                >
                  {prop.enum.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
            )
          }

          // Boolean
          if (prop.type === 'boolean') {
            return (
              <div key={key} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id={`config-${key}`}
                  checked={Boolean(value)}
                  onChange={(e) => handleChange(key, e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <label
                  htmlFor={`config-${key}`}
                  className="text-xs font-medium text-gray-600 dark:text-gray-400"
                >
                  {label}
                </label>
                {prop.description && (
                  <span className="text-[10px] text-gray-400" title={prop.description}>
                    ?
                  </span>
                )}
              </div>
            )
          }

          // Number
          if (prop.type === 'number' || prop.type === 'integer') {
            return (
              <div key={key}>
                <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                  {label}
                </label>
                {prop.description && (
                  <p className="mb-1 text-[10px] text-gray-400">{prop.description}</p>
                )}
                <input
                  type="number"
                  value={value === '' ? '' : Number(value)}
                  onChange={(e) =>
                    handleChange(key, e.target.value === '' ? '' : Number(e.target.value))
                  }
                  className="w-full rounded-md border border-gray-300 bg-gray-50 px-2 py-1.5 text-sm text-gray-800 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
                />
              </div>
            )
          }

          // Default: string input
          return (
            <div key={key}>
              <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                {label}
              </label>
              {prop.description && (
                <p className="mb-1 text-[10px] text-gray-400">{prop.description}</p>
              )}
              <input
                type="text"
                value={String(value)}
                onChange={(e) => handleChange(key, e.target.value)}
                className="w-full rounded-md border border-gray-300 bg-gray-50 px-2 py-1.5 text-sm text-gray-800 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
