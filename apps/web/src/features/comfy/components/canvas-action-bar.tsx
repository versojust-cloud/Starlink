'use client'

/**
 * Bottom-center floating action bar — AI Synthesis primary + Re-Calculate
 * secondary, plus a separate Layers button to the right.
 *
 * Visual spec: navy pill container with backdrop-blur, white primary
 * button with sky-blue Sparkles icon (mirrors the Stratum reference),
 * transparent secondary, dropped 24/48 navy shadow.
 *
 * Disabled state binds to the orchestrator processing flag so the user
 * can't double-fire while the agent pipeline is running.
 */

import { Sparkles, RefreshCw, Layers } from 'lucide-react'
import { useComfyStore } from '../store'

type Props = {
  onSynthesize?: () => void
  onRecalculate?: () => void
  onToggleLayers?: () => void
}

export function CanvasActionBar({ onSynthesize, onRecalculate, onToggleLayers }: Props) {
  const isProcessing = useComfyStore((state) => state.isOrchestratorProcessing)

  return (
    <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 pointer-events-auto">
      <div className="flex items-center bg-stratum-navy/95 backdrop-blur-md p-1.5 rounded-2xl shadow-[0_24px_48px_-16px_rgba(19,27,46,0.45)] border border-white/10">
        <button
          type="button"
          onClick={onSynthesize}
          disabled={isProcessing}
          className="flex items-center gap-2 whitespace-nowrap rounded-xl bg-white px-5 py-2.5 font-body text-[12px] font-bold text-stratum-navy transition-transform hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
        >
          <Sparkles className="h-4 w-4 text-stratum-blue" strokeWidth={2} fill="#89CEFF" />
          {isProcessing ? '正在合成…' : 'AI Synthesis'}
        </button>
        <span aria-hidden="true" className="mx-1.5 h-7 w-px bg-white/15" />
        <button
          type="button"
          onClick={onRecalculate}
          disabled={isProcessing}
          className="flex items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2.5 font-body text-[12px] font-semibold text-white transition-colors hover:bg-white/5 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RefreshCw className={`h-4 w-4 ${isProcessing ? 'animate-spin' : ''}`} strokeWidth={2} />
          Re-Calculate
        </button>
      </div>
      <button
        type="button"
        onClick={onToggleLayers}
        aria-label="Layer overview"
        className="flex h-12 w-12 items-center justify-center rounded-2xl border border-stratum-line bg-white text-stratum-navy shadow-xl transition-colors hover:text-stratum-blue"
      >
        <Layers className="h-5 w-5" strokeWidth={1.75} />
      </button>
    </div>
  )
}
