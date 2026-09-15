'use client'

import { AgentRuntimePanel } from '../agent-runtime-panel'
import { useComfyShellContext } from '../workspace-shell-context'

export function ThinkingPanel() {
  const { workspaceId } = useComfyShellContext()

  return <AgentRuntimePanel workspaceId={workspaceId} />
}
