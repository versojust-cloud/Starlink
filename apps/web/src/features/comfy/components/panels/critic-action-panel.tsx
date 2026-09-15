'use client'

import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react'
import { useComfyStore } from '../../store'
import { useComfyShellContext } from '../workspace-shell-context'
import { TOKENS } from '../canvas-design-tokens'

/**
 * Critic action panel (refresh-2026-04).
 *
 * Refresh notes:
 *  - Dropped pink-400 panel-wide tint; the panel now uses the neutral panel
 *    surface and ONLY the alert count chip carries hue (rose when > 0).
 *  - Run-critic button switched to ghost-style; we let the alert count be
 *    the visual focus, not the button.
 */
export function CriticActionPanel() {
  const { onRunCritic } = useComfyShellContext()
  const isProcessing = useComfyStore((state) => state.isCriticProcessing)
  const nodeCount = useComfyStore((state) => state.nodes.length)
  const conflictCount = useComfyStore(
    (state) =>
      Array.from(state.macraNodes.values()).filter(
        (node) => node.type === 'conflict-alert'
      ).length
  )

  // Hide until we have enough nodes to be worth scanning.
  if (nodeCount <= 3) return null

  const hasConflicts = conflictCount > 0
  const Icon = isProcessing ? Loader2 : hasConflicts ? CheckCircle2 : AlertTriangle
  const label = isProcessing ? '扫描中…' : hasConflicts ? '重新扫描' : '冲突检测'

  return (
    <section className={`${TOKENS.surface.panel} p-3`}>
      <header className="mb-3 flex items-center justify-between">
        <div>
          <p className={TOKENS.text.kicker}>Review</p>
          <h3 className={TOKENS.text.h2}>冲突检测</h3>
        </div>
        <div
          className={`flex h-7 min-w-[2.25rem] items-center justify-center rounded-md px-1.5 text-[12px] font-semibold tabular-nums ${
            hasConflicts ? 'bg-rose-400/15 text-rose-300' : 'bg-white/[0.04] text-slate-400'
          }`}
          aria-label={`${conflictCount} alerts`}
        >
          {conflictCount}
        </div>
      </header>

      <p className={`mb-3 ${TOKENS.text.meta} leading-relaxed`}>
        对当前画布进行一致性扫描，严重冲突时进入 HITL 决策态。
      </p>

      <button
        type="button"
        onClick={onRunCritic}
        disabled={isProcessing}
        className={`w-full ${TOKENS.button.ghost} disabled:opacity-50`}
      >
        <Icon className={`h-3.5 w-3.5 ${isProcessing ? 'animate-spin' : ''}`} strokeWidth={1.75} />
        {label}
      </button>
    </section>
  )
}
