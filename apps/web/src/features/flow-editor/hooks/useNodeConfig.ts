'use client'

import { useCallback, useMemo } from 'react'
import { useFlowStore, type NodeConfig } from '../store/flow-store'

/**
 * Hook for reading and updating the configuration of the currently selected
 * node in the flow editor.
 */
export function useNodeConfig() {
  const nodes = useFlowStore((s) => s.nodes)
  const selectedNodeId = useFlowStore((s) => s.selectedNodeId)
  const updateNodeConfig = useFlowStore((s) => s.updateNodeConfig)

  const node = useMemo(
    () => nodes.find((n) => n.id === selectedNodeId) ?? null,
    [nodes, selectedNodeId],
  )

  const config: NodeConfig = useMemo(
    () => (node?.data?.config as NodeConfig) ?? {},
    [node],
  )

  const updateConfig = useCallback(
    (key: string, value: unknown) => {
      if (!selectedNodeId) return
      updateNodeConfig(selectedNodeId, { [key]: value })
    },
    [selectedNodeId, updateNodeConfig],
  )

  const resetConfig = useCallback(() => {
    if (!selectedNodeId) return
    // Replace the entire config with an empty object
    useFlowStore.setState((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === selectedNodeId
          ? { ...n, data: { ...n.data, config: {} } }
          : n,
      ),
      isDirty: true,
    }))
  }, [selectedNodeId])

  return { node, config, updateConfig, resetConfig } as const
}
