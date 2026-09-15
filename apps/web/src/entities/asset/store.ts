'use client'

import { create } from 'zustand'
import type { AssetEntity } from './types'

type AssetStoreState = {
  byWorkspace: Record<string, AssetEntity[]>
  setWorkspaceAssets: (workspaceId: string, assets: AssetEntity[]) => void
  clearWorkspaceAssets: (workspaceId: string) => void
}

export const useAssetStore = create<AssetStoreState>((set) => ({
  byWorkspace: {},
  setWorkspaceAssets: (workspaceId, assets) =>
    set((state) => ({
      byWorkspace: {
        ...state.byWorkspace,
        [workspaceId]: assets
      }
    })),
  clearWorkspaceAssets: (workspaceId) =>
    set((state) => {
      const next = { ...state.byWorkspace }
      delete next[workspaceId]
      return { byWorkspace: next }
    })
}))

export function selectWorkspaceAssets(workspaceId: string) {
  return (state: AssetStoreState) => state.byWorkspace[workspaceId] ?? []
}
