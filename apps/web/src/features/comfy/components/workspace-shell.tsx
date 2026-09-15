'use client'

import type { ReactNode } from 'react'
import { useMemo } from 'react'
import { useComfyStore } from '../store'
import { getPanelsForSlot, type PanelDescriptor, type PanelSlot } from '../registries/panel-registry'
import { ComfyShellContextProvider, type ComfyShellContextValue } from './workspace-shell-context'

function useSlotPanels({
  slot,
  viewMode,
  hasPendingInterrupt
}: {
  slot: PanelSlot
  viewMode: 'freeform' | 'bmc'
  hasPendingInterrupt: boolean
}): PanelDescriptor[] {
  const stage = useComfyStore((state) => state.workflowStage)
  const nodes = useComfyStore((state) => state.nodes)
  const activeToolId = useComfyStore((state) => state.activeToolId)

  const selectedNodeIds = useMemo(
    () => nodes.filter((node) => node.selected).map((node) => node.id),
    [nodes]
  )

  const panels = useMemo(
    () =>
      getPanelsForSlot(slot, {
        stage,
        viewMode,
        activeToolId,
        hasPendingInterrupt,
        selectedNodeIds
      }),
    [activeToolId, hasPendingInterrupt, selectedNodeIds, slot, stage, viewMode]
  )

  return panels
}

function PanelRenderer({ panels }: { panels: PanelDescriptor[] }) {
  return (
    <>
      {panels.map((descriptor) => {
        const Component = descriptor.component
        return <Component key={descriptor.id} />
      })}
    </>
  )
}

function PanelColumn({
  slot,
  viewMode,
  hasPendingInterrupt,
  className,
  animationDelay
}: {
  slot: Extract<PanelSlot, 'left-rail' | 'right-rail'>
  viewMode: 'freeform' | 'bmc'
  hasPendingInterrupt: boolean
  className: string
  animationDelay: string
}) {
  const panels = useSlotPanels({ slot, viewMode, hasPendingInterrupt })
  if (panels.length === 0) return null

  return (
    <aside className={className} style={{ animationDelay }}>
      <PanelRenderer panels={panels} />
    </aside>
  )
}

function OverlayPanels({
  viewMode,
  hasPendingInterrupt
}: {
  viewMode: 'freeform' | 'bmc'
  hasPendingInterrupt: boolean
}) {
  const panels = useSlotPanels({ slot: 'overlay', viewMode, hasPendingInterrupt })
  if (panels.length === 0) return null

  return <PanelRenderer panels={panels} />
}

function BottomTrayPanels({
  viewMode,
  hasPendingInterrupt,
  isAnimating
}: {
  viewMode: 'freeform' | 'bmc'
  hasPendingInterrupt: boolean
  isAnimating: boolean
}) {
  const panels = useSlotPanels({ slot: 'bottom-tray', viewMode, hasPendingInterrupt })
  if (panels.length === 0) return null

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-5 z-30 flex justify-center px-6">
      <div
        className={`pointer-events-auto w-[min(760px,calc(100vw-3rem))] ${
          isAnimating ? 'opacity-0' : 'animate-fade-in-up'
        }`}
        style={{ animationDelay: '0.5s' }}
      >
        <PanelRenderer panels={panels} />
      </div>
    </div>
  )
}

type WorkspaceShellProps = {
  context: ComfyShellContextValue
  header: ReactNode
  main: ReactNode
  persistentOverlay?: ReactNode
}

export function WorkspaceShell({
  context,
  header,
  main,
  persistentOverlay
}: WorkspaceShellProps) {
  return (
    <ComfyShellContextProvider value={context}>
      <div
        className="canvas-page-shell relative flex h-screen w-screen flex-col overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, #0c1428 0%, #1e293b 50%, #0f172a 100%)'
        }}
      >
        {header}

        <div className="relative flex flex-1 overflow-hidden">
          <PanelColumn
            slot="left-rail"
            viewMode={context.viewMode}
            hasPendingInterrupt={Boolean(context.pendingDecisionRequest)}
            className={`z-10 flex w-80 flex-col gap-4 overflow-y-auto border-r border-white/10 bg-slate-950/45 p-4 shadow-2xl shadow-black/20 backdrop-blur-2xl ${
              context.isAnimating ? 'opacity-0' : 'animate-fade-in-up'
            }`}
            animationDelay="0.2s"
          />
          {main}
          <PanelColumn
            slot="right-rail"
            viewMode={context.viewMode}
            hasPendingInterrupt={Boolean(context.pendingDecisionRequest)}
            className={`z-10 flex w-96 flex-col gap-4 overflow-y-auto border-l border-white/10 bg-slate-950/45 p-4 shadow-2xl shadow-black/20 backdrop-blur-2xl ${
              context.isAnimating ? 'opacity-0' : 'animate-fade-in-up'
            }`}
            animationDelay="0.4s"
          />
          <BottomTrayPanels
            viewMode={context.viewMode}
            hasPendingInterrupt={Boolean(context.pendingDecisionRequest)}
            isAnimating={context.isAnimating}
          />
          <OverlayPanels
            viewMode={context.viewMode}
            hasPendingInterrupt={Boolean(context.pendingDecisionRequest)}
          />
        </div>

        {persistentOverlay}
      </div>
    </ComfyShellContextProvider>
  )
}
