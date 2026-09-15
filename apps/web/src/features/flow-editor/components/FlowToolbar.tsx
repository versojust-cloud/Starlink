'use client'

import { useCallback, useMemo, useRef } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { Edge, Node } from 'reactflow'
import { useReactFlow } from 'reactflow'
import { useFlowStore } from '../store/flow-store'

interface ToolbarButtonProps {
  label: string
  onClick: () => void
  disabled?: boolean
  variant?: 'primary' | 'default'
}

function ToolbarButton({ label, onClick, disabled, variant = 'default' }: ToolbarButtonProps) {
  const base =
    'rounded-md px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50'
  const styles =
    variant === 'primary'
      ? `${base} bg-indigo-600 text-white hover:bg-indigo-700`
      : `${base} border border-gray-300 text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800`

  return (
    <button className={styles} onClick={onClick} disabled={disabled}>
      {label}
    </button>
  )
}

interface FlowToolbarProps {
  flowName?: string
  onFlowNameChange?: Dispatch<SetStateAction<string>> | ((name: string) => void)
  nodes?: Node[]
  edges?: Edge[]
}

export function FlowToolbar({ flowName, onFlowNameChange, nodes, edges }: FlowToolbarProps) {
  const { fitView } = useReactFlow()
  const storeFlowName = useFlowStore((s) => s.flowName)
  const setStoreFlowName = useFlowStore((s) => s.setFlowName)
  const toFlowDefinition = useFlowStore((s) => s.toFlowDefinition)
  const loadFlow = useFlowStore((s) => s.loadFlow)
  const isDirty = useFlowStore((s) => s.isDirty)

  const importRef = useRef<HTMLInputElement>(null)
  const resolvedFlowName = flowName ?? storeFlowName
  const currentDefinition = useMemo(
    () => (
      nodes && edges
        ? { id: null, name: resolvedFlowName, nodes, edges }
        : toFlowDefinition()
    ),
    [edges, nodes, resolvedFlowName, toFlowDefinition],
  )

  const handleSave = useCallback(() => {
    console.log('Save flow:', currentDefinition)
  }, [currentDefinition])

  const handleRun = useCallback(() => {
    // Trigger execution -- integrate with your execution engine
    console.log('Run flow')
  }, [])

  const handleFitView = useCallback(() => {
    fitView({ padding: 0.2, duration: 300 })
  }, [fitView])

  const handleExport = useCallback(() => {
    const blob = new Blob([JSON.stringify(currentDefinition, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${currentDefinition.name || 'flow'}.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [currentDefinition])

  const handleImport = useCallback(() => {
    importRef.current?.click()
  }, [])

  const onFileImport = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = (ev) => {
        try {
          const definition = JSON.parse(ev.target?.result as string)
          loadFlow(definition)
        } catch {
          console.error('Failed to parse flow JSON')
        }
      }
      reader.readAsText(file)
      // Reset input so the same file can be re-imported
      e.target.value = ''
    },
    [loadFlow],
  )

  return (
    <div className="flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-2 dark:border-gray-700 dark:bg-gray-900">
      {/* Flow name */}
      <input
        type="text"
        value={resolvedFlowName}
        onChange={(e) => {
          if (onFlowNameChange) {
            onFlowNameChange(e.target.value)
            return
          }
          setStoreFlowName(e.target.value)
        }}
        className="w-48 rounded-md border border-gray-300 bg-transparent px-2 py-1 text-sm font-medium text-gray-800 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-300 dark:border-gray-600 dark:text-gray-200"
      />
      {isDirty && <span className="text-xs text-amber-500">Unsaved</span>}

      <div className="mx-2 h-5 w-px bg-gray-300 dark:bg-gray-600" />

      {/* Actions */}
      <ToolbarButton label="Save" onClick={handleSave} variant="primary" />
      <ToolbarButton label="Run" onClick={handleRun} variant="primary" />

      <div className="mx-2 h-5 w-px bg-gray-300 dark:bg-gray-600" />

      <ToolbarButton label="Undo" onClick={() => console.log('undo')} />
      <ToolbarButton label="Redo" onClick={() => console.log('redo')} />

      <div className="mx-2 h-5 w-px bg-gray-300 dark:bg-gray-600" />

      <ToolbarButton label="Auto-Layout" onClick={() => console.log('auto-layout')} />
      <ToolbarButton label="Fit View" onClick={handleFitView} />

      <div className="mx-2 h-5 w-px bg-gray-300 dark:bg-gray-600" />

      <ToolbarButton label="Export JSON" onClick={handleExport} />
      <ToolbarButton label="Import JSON" onClick={handleImport} />

      {/* Hidden file input for import */}
      <input
        ref={importRef}
        type="file"
        accept=".json"
        onChange={onFileImport}
        className="hidden"
      />
    </div>
  )
}
