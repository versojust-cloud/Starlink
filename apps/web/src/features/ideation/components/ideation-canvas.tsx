'use client'

import { type DragEvent, useCallback, useRef } from 'react'
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  type ReactFlowInstance
} from 'reactflow'
import 'reactflow/dist/style.css'
import { useIdeationStore } from '../store/ideation-store'
import { ideationNodeTypes } from '../registries/ideation-node-registry'
import type { IdeationNodeKind } from '../types/ideation-types'

/**
 * The React Flow canvas itself. Hosts node-types from the registry and
 * accepts drag-drop payloads from the palette.
 */
export function IdeationCanvas() {
  const nodes = useIdeationStore((s) => s.nodes)
  const edges = useIdeationStore((s) => s.edges)
  const onNodesChange = useIdeationStore((s) => s.onNodesChange)
  const onEdgesChange = useIdeationStore((s) => s.onEdgesChange)
  const onConnect = useIdeationStore((s) => s.onConnect)
  const addNodeAt = useIdeationStore((s) => s.addNodeAt)

  const openInspector = useIdeationStore((s) => s.openInspector)
  const reactFlowInstance = useRef<ReactFlowInstance | null>(null)
  const wrapperRef = useRef<HTMLDivElement | null>(null)

  const onDragOver = useCallback((event: DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }, [])

  const onDrop = useCallback(
    (event: DragEvent) => {
      event.preventDefault()
      const kind = event.dataTransfer.getData(
        'application/starlink-ideation-kind'
      ) as IdeationNodeKind | ''
      if (!kind) return
      const bounds = wrapperRef.current?.getBoundingClientRect()
      if (!bounds || !reactFlowInstance.current) return

      const position = reactFlowInstance.current.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY
      })

      addNodeAt(kind, position)
    },
    [addNodeAt]
  )

  return (
    <div ref={wrapperRef} className="relative h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={ideationNodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onNodeDoubleClick={(_, node) => openInspector(node.id)}
        onInit={(instance) => {
          reactFlowInstance.current = instance
        }}
        defaultEdgeOptions={{
          type: 'default',
          animated: true,
          style: { stroke: 'rgba(148, 163, 184, 0.5)', strokeWidth: 1 }
        }}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        proOptions={{ hideAttribution: true }}
        className="bg-slate-950"
      >
        <Background
          variant={BackgroundVariant.Dots}
          color="rgba(148, 163, 184, 0.18)"
          gap={24}
          size={1}
        />
        <MiniMap
          maskColor="rgba(2, 6, 23, 0.6)"
          nodeColor={(node) => {
            const kind = node.data?.kind ?? 'core-idea'
            // Hex hardcoded so MiniMap (rendered via canvas) doesn't depend on Tailwind
            const hexMap: Record<string, string> = {
              'core-idea': '#67e8f9',
              'customer-pain': '#fda4af',
              'value-angle': '#fcd34d',
              hypothesis: '#c4b5fd',
              'validation-channel': '#7dd3fc',
              revenue: '#6ee7b7',
              risk: '#fdba74',
              evidence: '#cbd5e1',
              reflection: '#a5b4fc'
            }
            return hexMap[kind] ?? '#cbd5e1'
          }}
          className="rounded-md border border-white/[0.08] bg-slate-950/60 backdrop-blur-xl"
          pannable
          zoomable
        />
        <Controls
          className="rounded-md border border-white/[0.08] bg-slate-950/60 backdrop-blur-xl [&>button]:border-white/[0.06] [&>button]:bg-transparent [&>button:hover]:bg-white/[0.06]"
          showInteractive={false}
        />
      </ReactFlow>
    </div>
  )
}
