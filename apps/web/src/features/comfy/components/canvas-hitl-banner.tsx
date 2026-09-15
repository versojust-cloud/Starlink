'use client'

/**
 * Top-center floating HITL banner — surfaces when supervisor pauses
 * for a human decision (pendingDecisionRequest non-null). Two CTAs:
 *
 *   1. 让 Agent 自行修正  → approveDecision('auto_revise')
 *   2. 接受当前结果       → approveDecision('accept_current')
 *
 * Sits between the canvas header and the working surface so it's
 * impossible to miss but doesn't trap the user inside a modal.
 */

import { ShieldAlert } from 'lucide-react'

type Props = {
  visible: boolean
  onAutoRevise?: () => void
  onAcceptCurrent?: () => void
}

export function CanvasHitlBanner({ visible, onAutoRevise, onAcceptCurrent }: Props) {
  if (!visible) return null

  return (
    <div
      className="absolute top-4 left-1/2 -translate-x-1/2 z-20 max-w-[640px] w-[min(640px,calc(100%-380px))] pointer-events-auto"
      role="alertdialog"
      aria-label="Decision Required"
    >
      <div className="flex items-center gap-3 rounded-2xl border border-stratum-danger/40 bg-stratum-danger-wash/60 backdrop-blur-md px-4 py-3 shadow-lg">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-stratum-danger/15">
          <ShieldAlert className="h-4 w-4 text-stratum-danger" strokeWidth={2} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-body text-[10px] font-bold uppercase tracking-[0.18em] text-stratum-danger">
            DECISION REQUIRED · 等你裁决
          </p>
          <p className="font-body text-[12px] text-stratum-ink leading-snug truncate">
            Critic 检出多 agent 之间的冲突，supervisor 暂停了流程。
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onAcceptCurrent}
            className="rounded-full border border-stratum-line bg-white px-3 py-1.5 font-body text-[11px] font-semibold text-stratum-navy transition-colors hover:border-stratum-blue/40 hover:text-stratum-blue"
          >
            接受当前
          </button>
          <button
            type="button"
            onClick={onAutoRevise}
            className="rounded-full bg-stratum-navy px-3.5 py-1.5 font-body text-[11px] font-bold text-white transition-colors hover:bg-stratum-navy-soft"
          >
            让 Agent 自行修正
          </button>
        </div>
      </div>
    </div>
  )
}
