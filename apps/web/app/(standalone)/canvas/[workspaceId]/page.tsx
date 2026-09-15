'use client'

/**
 * Standalone full-viewport canvas for a workspace.
 *
 * /canvas/proj-001  → full-screen comfy canvas, NO StratumAI app shell
 *                     (no top bar / sidebar nav) AND NO WorkspaceShell
 *                     panel rails (no input panel / node library /
 *                     knowledge sidebar). Just the CanvasHeader on top
 *                     + the ReactFlow canvas owning the rest of the
 *                     viewport.
 *
 * Same store, same hooks, same ReactFlow instance as the embedded
 * /workspace/[id]/canvas route — just renders chromeless. Detail
 * drawer + tutorial dialog still surface as overlays so node-detail
 * inspection still works.
 */

import { CanvasPage } from '@/features/comfy/components/comfy-canvas-page'

type PageProps = {
  params: { workspaceId: string }
}

export default function StandaloneWorkspaceCanvasRoute({ params }: PageProps) {
  return <CanvasPage workspaceId={params.workspaceId} standalone />
}
