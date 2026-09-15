'use client'

import { ReactFlowProvider } from 'reactflow'
import type { ReactNode } from 'react'

export function FlowProvider({ children }: { children: ReactNode }) {
  return <ReactFlowProvider>{children}</ReactFlowProvider>
}
