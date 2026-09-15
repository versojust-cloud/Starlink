'use client'

import { createContext, useContext, type ReactNode } from 'react'

export type PendingDecisionRequest = {
  conversationId: string
  payload: {
    decision: string
    occurredAt: string
  }
}

export type ComfyShellContextValue = {
  workspaceId: string
  isAnimating: boolean
  viewMode: 'freeform' | 'bmc'
  seedInput: string
  onSeedInputChange: (value: string) => void
  onAddNode: (type: string) => void
  onSeedGeneration: () => void
  onRunCritic: () => void
  onSendChat: () => void
  pendingDecisionRequest: PendingDecisionRequest | null
  hitlInput: string
  onHitlInputChange: (value: string) => void
  onApproveAutoRevise: () => Promise<void>
  onApproveCustomDecision: () => Promise<void>
  onAcceptCurrentDecision: () => Promise<void>
}

const ComfyShellContext = createContext<ComfyShellContextValue | null>(null)

export function ComfyShellContextProvider({
  value,
  children
}: {
  value: ComfyShellContextValue
  children: ReactNode
}) {
  return <ComfyShellContext.Provider value={value}>{children}</ComfyShellContext.Provider>
}

export function useComfyShellContext() {
  const context = useContext(ComfyShellContext)
  if (!context) {
    throw new Error('useComfyShellContext must be used inside ComfyShellContextProvider')
  }
  return context
}
