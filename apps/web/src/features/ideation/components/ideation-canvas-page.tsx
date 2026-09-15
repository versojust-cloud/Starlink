'use client'

import { ReactFlowProvider } from 'reactflow'
import { IdeationHeader } from './ideation-header'
import { IdeationNodePalette } from './ideation-node-palette'
import { IdeationCanvas } from './ideation-canvas'
import { IdeationChatPanel } from './ideation-chat-panel'
import { IdeationInspectorOverlay } from './ideation-inspector-overlay'
import { IdeationEmptyState } from './ideation-empty-state'
import { IdeationBmcView } from './ideation-bmc-view'
import { useIdeationStore } from '../store/ideation-store'

/**
 * Main page for Starlink Ideation.
 *
 * Layout (Mode 3 — dual-mode hybrid):
 *
 *   ┌─────────────────── Header (instrument panel) ─────────────────────┐
 *   │                                                                   │
 *   │  Palette      │     Canvas              │   AI Coach Chat        │
 *   │  (drag        │  (drag/edit/connect,    │  (default reactive     │
 *   │  source)      │   waypoints in wizard)  │   coach + wizard       │
 *   │               │                          │   waypoint map)        │
 *   │               │                          │                        │
 *   └───────────────────────────────────────────────────────────────────┘
 *
 *   Inspector is a modal overlay (doesn't push chat aside).
 */
export function IdeationCanvasPage() {
  const nodeCount = useIdeationStore((s) => s.nodes.length)
  const addNode = useIdeationStore((s) => s.addNode)
  const startWizard = useIdeationStore((s) => s.startWizard)
  const viewMode = useIdeationStore((s) => s.viewMode)

  // Empty state always wins the center area when there are no nodes — even
  // if the user toggled to BMC view. An empty 9-grid would be useless, and
  // the EmptyState's CTAs steer them back to the canvas mode anyway.
  const renderEmpty = nodeCount === 0

  return (
    <ReactFlowProvider>
      <div
        className="relative flex h-screen w-screen flex-col overflow-hidden"
        style={{
          background:
            'linear-gradient(135deg, #020617 0%, #0f172a 50%, #020617 100%)'
        }}
      >
        <IdeationHeader />

        <div className="relative flex flex-1 overflow-hidden">
          <IdeationNodePalette />

          <div className="relative flex-1">
            {renderEmpty ? (
              <IdeationEmptyState
                onSeed={() => addNode('core-idea')}
                onLaunchWizard={startWizard}
              />
            ) : viewMode === 'bmc' ? (
              <IdeationBmcView />
            ) : (
              <IdeationCanvas />
            )}
          </div>

          <IdeationChatPanel />
        </div>

        <IdeationInspectorOverlay />
      </div>
    </ReactFlowProvider>
  )
}
