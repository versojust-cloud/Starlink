'use client'

/**
 * CanvasFlow — ReactFlow surface with Editorial Boardroom v2 visual
 * polish (2026-05-02).
 *
 * What's tuned vs the v1 amber-glow version:
 *  - Edges: ash-3 1.5 px static (no amber yellow + no pulse animation)
 *  - Background: 3 layers — ink solid + paper-grain noise (multiply
 *    blend) + 24 px ash dot grid (was 48 px amber dots)
 *  - Controls: brutalist 1.5 px paper border on ink-ash1; no glass
 *  - MiniMap: same brutalist edge; ink-ash2 mask, paper node tint
 *  - Bottom hint: editorial mono kicker; no glow card
 *  - Snap-to-grid: 8 px on x+y, so nodes align to the dot grid
 *
 * All functional code (selection, undo/redo, multi-select, delete) is
 * preserved verbatim.
 */

import { useEffect } from 'react'
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  type OnSelectionChangeParams
} from 'reactflow'
import 'reactflow/dist/style.css'
import { CanvasRegions } from './canvas-regions'
import { comfyNodeTypes } from './canvas-config'
import type { Edge, Node } from 'reactflow'
import type { NodeChange, EdgeChange, Connection } from 'reactflow'
import { useComfyStore } from '../store/comfy-store'

type CanvasFlowProps = {
  nodes: Node[]
  edges: Edge[]
  onNodesChange: (changes: NodeChange[]) => void
  onEdgesChange: (changes: EdgeChange[]) => void
  onConnect: (connection: Connection) => void
  /** Optional: fired when user clicks an edge. Used by the conflict-edge
   *  flow to open the Insight Panel · 审查 tab and expand the picked
   *  conflict. */
  onEdgeClick?: (event: React.MouseEvent, edge: Edge) => void
  isAnimating: boolean
}

export function CanvasFlow({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onEdgeClick,
  isAnimating,
}: CanvasFlowProps) {
  const setSelectedNodeIds = useComfyStore((s) => s.setSelectedNodeIds)
  const undo = useComfyStore((s) => s.undo)
  const redo = useComfyStore((s) => s.redo)

  const handleSelectionChange = (params: OnSelectionChangeParams): void => {
    setSelectedNodeIds(params.nodes.map((n) => n.id))
  }

  // cmd+z / ctrl+z to undo, cmd+shift+z / ctrl+shift+z (or cmd+y) to redo.
  // Skip when focus is in a text input/textarea so chat typing isn't hijacked.
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement | null
      if (target) {
        const tag = target.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) return
      }
      const meta = e.metaKey || e.ctrlKey
      if (!meta) return
      if (e.key === 'z' || e.key === 'Z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
      } else if (e.key === 'y' || e.key === 'Y') {
        e.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [undo, redo])
  return (
    <main
      className={`flex-1 relative overflow-hidden bg-stratum-surface ${
        isAnimating ? 'opacity-0' : 'animate-fade-in-up'
      }`}
      style={{ animationDelay: '0.3s' }}
    >

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onEdgeClick={onEdgeClick}
        onSelectionChange={handleSelectionChange}
        nodeTypes={comfyNodeTypes}
        nodesDraggable
        nodesConnectable
        elementsSelectable
        // Multi-select: shift-click for additive selection, drag-rectangle
        // for box select. Backspace/Delete fire `remove` changes through
        // onNodesChange — the store cascades to macraNodes + edges.
        multiSelectionKeyCode={['Shift', 'Meta']}
        deleteKeyCode={['Backspace', 'Delete']}
        // Snap to the 8 px ash dot grid so nodes align to the editorial
        // baseline. Avoids the "pixel-jitter" feel after multi-drag.
        snapToGrid
        snapGrid={[8, 8]}
        defaultEdgeOptions={{
          type: 'smoothstep',
          animated: false,
          style: {
            stroke: '#C6C6CD',     // outline-variant — perspective line on light
            strokeWidth: 1.25,
            strokeDasharray: '4 4',
          },
          labelStyle: {
            fontFamily: 'var(--font-jetbrains-mono)',
            fontSize: 10,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            fill: '#6B7280',       // stratum-muted
          },
          labelBgStyle: { fill: '#FFFFFF' },              // surface-raised
          labelBgPadding: [6, 4],
          labelBgBorderRadius: 4,
        }}
        className="canvas-flow-surface relative z-[1]"
        fitView
        fitViewOptions={{
          padding: 0.2,
          includeHiddenNodes: false,
        }}
        minZoom={0.1}
        maxZoom={2}
        onlyRenderVisibleElements
        proOptions={{ hideAttribution: true }}
      >
        <CanvasRegions />
        <Background
          variant={BackgroundVariant.Dots}
          gap={24}
          size={1}
          color="#C6C6CD"
          style={{ background: 'transparent' }}
        />
        <Controls
          className="!shadow-md !border !border-stratum-line !bg-white !rounded-full !overflow-hidden [&>button]:!bg-transparent [&>button]:!border-0 [&>button]:!border-b [&>button]:!border-stratum-line [&>button:last-child]:!border-b-0 [&>button]:!text-stratum-ink [&>button:hover]:!text-stratum-blue [&>button:hover]:!bg-stratum-surface-low"
          showInteractive={false}
        />
        <MiniMap
          className="!shadow-md !border !border-stratum-line !rounded-xl !overflow-hidden"
          nodeColor="#89CEFF"
          nodeStrokeColor="#131B2E"
          nodeStrokeWidth={1.5}
          maskColor="rgba(19, 27, 46, 0.08)"
          style={{ background: '#FFFFFF' }}
          pannable
          zoomable
        />
      </ReactFlow>

      {/* Bottom keyboard hint — moved out of bottom-left corner because
          the floating KB / Memory / Wizard buttons (bottom-6 left-6 in
          comfy-canvas-page.tsx) sit there at z-20 and were covering this
          hint. Now positioned bottom-2 right-1/2 +translate-x-1/2 (just
          above minimap which sits at bottom-right). Hidden on very small
          viewports where space is tight. */}
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-[2] hidden md:flex items-center gap-3 bg-white/80 backdrop-blur-md border border-stratum-line rounded-full px-4 py-1.5 pointer-events-none shadow-sm">
        <span className="font-instr text-[10px] uppercase tracking-[0.18em] text-stratum-muted">
          按住 <kbd className="font-instr text-[10px] text-stratum-ink bg-stratum-surface-low border border-stratum-line rounded px-1.5 py-0.5 mx-1">SPACE</kbd> 拖动 · 滚轮缩放 · ⌘<kbd className="font-instr text-[10px] text-stratum-ink bg-stratum-surface-low border border-stratum-line rounded px-1.5 py-0.5 mx-1">Z</kbd>撤销
        </span>
      </div>
    </main>
  )
}

export const ComfyCanvasFlow = CanvasFlow
