'use client'

import { useEffect } from 'react'
import { useComfyStore } from '../store'

/**
 * Hook that binds keyboard-escape and canvas-click to clear the
 * reverse-highlight triggered by EvidenceDrawer's "定位相关卡片".
 *
 * Mount once in the canvas page root.
 */
export function useCitationHighlight() {
  const highlightedCardIds = useComfyStore(
    (state) => state.evidenceDrawer.highlightedCardIds
  )
  const clearHighlight = useComfyStore((state) => state.clearCitationHighlight)

  useEffect(() => {
    if (highlightedCardIds.length === 0) return
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') clearHighlight()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [highlightedCardIds, clearHighlight])
}

/**
 * Derive a className suffix for a given BMC card ID based on the current
 * reverse-highlight state. Emits:
 *   - '' when no highlight active
 *   - 'ring-4 ring-rose-400 ring-offset-2 ...' when the card is highlighted
 *   - 'opacity-40' when highlight is active but this card is NOT in the set
 */
export function useCardHighlightClass(cardId: string): string {
  const highlightedCardIds = useComfyStore(
    (state) => state.evidenceDrawer.highlightedCardIds
  )
  if (highlightedCardIds.length === 0) return ''
  if (highlightedCardIds.includes(cardId)) {
    return 'ring-4 ring-rose-400/80 ring-offset-2 ring-offset-slate-950 transition-all duration-300'
  }
  return 'opacity-40 transition-opacity duration-300'
}
