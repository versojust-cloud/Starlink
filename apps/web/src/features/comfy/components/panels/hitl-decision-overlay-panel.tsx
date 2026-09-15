'use client'

import { AlertTriangle, Check, Send, X } from 'lucide-react'
import { useComfyShellContext } from '../workspace-shell-context'
import { TOKENS } from '../canvas-design-tokens'

/**
 * HITL decision overlay (refresh-2026-04).
 *
 * Refresh notes:
 *  - Modal width unchanged (28 rem) but radius drops 24 → 16; padding 24 → 20.
 *  - Amber-orange gradient alert icon → flat amber-300 chip on neutral surface.
 *  - Three options each as ghost cards with consistent ring; primary "send"
 *    button is the only filled element (cyan accent for action).
 *  - Backdrop dims and blurs but no dramatic gradient — Linear-style modal.
 */
export function HitlDecisionOverlayPanel() {
  const {
    pendingDecisionRequest,
    hitlInput,
    onHitlInputChange,
    onApproveAutoRevise,
    onApproveCustomDecision,
    onAcceptCurrentDecision
  } = useComfyShellContext()

  if (!pendingDecisionRequest) return null

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="hitl-title"
    >
      <div
        className={`w-[28rem] ${TOKENS.surface.panel} p-5`}
        style={{ background: 'rgba(15, 23, 42, 0.94)' }}
      >
        <header className="mb-4 flex items-start gap-3">
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-amber-400/10 text-amber-300"
            aria-hidden
          >
            <AlertTriangle className="h-4 w-4" strokeWidth={1.75} />
          </span>
          <div>
            <h3 id="hitl-title" className={TOKENS.text.h2}>
              Critic 发现高严重度冲突
            </h3>
            <p className={`mt-0.5 ${TOKENS.text.meta}`}>需要你的决策来继续研讨</p>
          </div>
        </header>

        <div className={`mb-4 ${TOKENS.surface.input} px-3 py-2.5`}>
          <p className="text-[12px] leading-relaxed text-slate-300">
            {pendingDecisionRequest.payload.decision}
          </p>
        </div>

        <div className="space-y-1.5">
          {/* Option 1 — auto-revise */}
          <button
            type="button"
            onClick={() => void onApproveAutoRevise()}
            className={`flex w-full items-center gap-2.5 ${TOKENS.surface.card} p-2.5 text-left`}
          >
            <Check className="h-3.5 w-3.5 shrink-0 text-emerald-300" strokeWidth={1.75} />
            <div className="min-w-0 flex-1">
              <p className={TOKENS.text.h2}>让 Agent 自行修正</p>
              <p className={TOKENS.text.meta}>Supervisor 将分派相关 Agent 进行修正</p>
            </div>
          </button>

          {/* Option 2 — custom guidance (input + send) */}
          <div className={`flex items-stretch gap-1.5 ${TOKENS.surface.input} p-1`}>
            <input
              value={hitlInput}
              onChange={(event) => onHitlInputChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && hitlInput.trim()) {
                  event.preventDefault()
                  void onApproveCustomDecision()
                }
              }}
              placeholder="输入你的修正方向…"
              className="flex-1 bg-transparent px-2.5 py-1.5 text-[12px] text-slate-200 outline-none placeholder:text-slate-500"
            />
            <button
              type="button"
              onClick={() => void onApproveCustomDecision()}
              disabled={!hitlInput.trim()}
              className="inline-flex shrink-0 items-center justify-center rounded-md bg-cyan-400 px-2.5 text-slate-950 transition-colors hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-cyan-400"
              aria-label="Send guidance"
            >
              <Send className="h-3.5 w-3.5" strokeWidth={2} />
            </button>
          </div>

          {/* Option 3 — accept current */}
          <button
            type="button"
            onClick={() => void onAcceptCurrentDecision()}
            className={`flex w-full items-center gap-2.5 ${TOKENS.surface.card} p-2.5 text-left`}
          >
            <X className="h-3.5 w-3.5 shrink-0 text-slate-400" strokeWidth={1.75} />
            <div className="min-w-0 flex-1">
              <p className={TOKENS.text.h2}>接受当前结果</p>
              <p className={TOKENS.text.meta}>跳过修正，使用当前分析</p>
            </div>
          </button>
        </div>
      </div>
    </div>
  )
}
