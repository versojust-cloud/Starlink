import type { ComponentType } from 'react'
import type { WorkflowStage } from '../store/workflow-stage'
import { createRegistry } from './base-registry'

export type PanelSlot = 'left-rail' | 'right-rail' | 'bottom-tray' | 'overlay'

export type PanelVisibilityContext = {
  stage: WorkflowStage
  viewMode: 'freeform' | 'bmc'
  activeToolId: string | null
  hasPendingInterrupt: boolean
  selectedNodeIds: string[]
}

export type PanelDescriptor = {
  id: string
  slot: PanelSlot
  order: number
  component: ComponentType
  visibleWhen: (context: PanelVisibilityContext) => boolean
  defaultCollapsed?: boolean
}

export const panelRegistry = createRegistry<PanelDescriptor>()

export function registerPanel(descriptor: PanelDescriptor) {
  panelRegistry.register(descriptor)
}

export function getPanelsForSlot(slot: PanelSlot, context: PanelVisibilityContext) {
  return panelRegistry
    .all()
    .filter((descriptor) => descriptor.slot === slot && descriptor.visibleWhen(context))
    .sort((left, right) => left.order - right.order)
}

