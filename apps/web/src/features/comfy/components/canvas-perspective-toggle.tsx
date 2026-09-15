'use client'

/**
 * Top-left floating perspective switcher — Perspectives / Timeline / Heatmap.
 *
 * Currently only Perspectives is wired (the default canvas view). Timeline
 * and Heatmap are reserved for future analytics overlays; clicking them
 * surfaces a coming-soon hint in the action bar status text. Visual
 * spec follows the Stratum reference: white pill on `bg-stratum-surface`,
 * navy active fill, muted idle text.
 */

import { useState } from 'react'

type Perspective = 'perspectives' | 'timeline' | 'heatmap'

// These labels are functional names with specific semantics:
// - Perspectives: multi-angle view switcher
// - Timeline:     time-axis playback of agent activity
// - Heatmap:      density / activity heatmap overlay
// Don't shorten to single Chinese chars — the meaning gets lost.
const TABS: ReadonlyArray<{ id: Perspective; label: string }> = [
  { id: 'perspectives', label: 'Perspectives' },
  { id: 'timeline',     label: 'Timeline' },
  { id: 'heatmap',      label: 'Heatmap' },
]

export function CanvasPerspectiveToggle() {
  const [active, setActive] = useState<Perspective>('perspectives')

  return (
    <div
      className="absolute top-4 left-1/2 -translate-x-1/2 z-10 pointer-events-auto flex items-center gap-1 bg-white/95 backdrop-blur-md p-1 rounded-full shadow-md border border-stratum-line"
      role="tablist"
      aria-label="Canvas perspective"
    >
      {TABS.map((tab) => {
        const isActive = active === tab.id
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => setActive(tab.id)}
            className={`px-3 py-1 rounded-full font-body text-[11px] font-semibold tracking-tight transition-colors ${
              isActive
                ? 'bg-stratum-navy text-white'
                : 'text-stratum-muted hover:text-stratum-navy'
            }`}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}
