'use client'

import { Loader2, Play, Wand2 } from 'lucide-react'
import { useComfyStore } from '../../store'
import { useComfyShellContext } from '../workspace-shell-context'
import { TOKENS } from '../canvas-design-tokens'

/**
 * Seed input panel (refresh-2026-04).
 *
 * Refresh notes:
 *  - Replaced amber-gradient action button + glow shadow with a flat cyan-300
 *    primary that matches the rest of the canvas.
 *  - Status icon switched from gradient pill to a 24-px hue-tinted square that
 *    only changes color on state transitions (idle/processing/complete) — far
 *    quieter visually.
 *  - Textarea uses focus-within ring on the input wrapper (token), so the
 *    focused state is consistent with chat-input panel.
 */
export function SeedInputPanel() {
  const { seedInput, onSeedInputChange, onSeedGeneration } = useComfyShellContext()
  const isProcessing = useComfyStore((state) => state.isOrchestratorProcessing)
  const stage = useComfyStore((state) => state.workflowStage)
  const isComplete = stage === 'output'

  const statusTone = isProcessing
    ? 'bg-cyan-400/10 text-cyan-300'
    : isComplete
      ? 'bg-emerald-400/10 text-emerald-300'
      : 'bg-white/[0.04] text-slate-400'
  const StatusIcon = isProcessing ? Loader2 : isComplete ? Play : Wand2

  return (
    <section className={`${TOKENS.surface.panel} p-3`}>
      <header className="mb-3 flex items-center justify-between">
        <div>
          <p className={TOKENS.text.kicker}>Input</p>
          <h3 className={TOKENS.text.h2}>业务画布起点</h3>
        </div>
        <span
          className={`flex h-7 w-7 items-center justify-center rounded-md ${statusTone}`}
          aria-label={isProcessing ? 'Generating' : isComplete ? 'Ready' : 'Idle'}
        >
          <StatusIcon
            className={`h-3.5 w-3.5 ${isProcessing ? 'animate-spin' : ''}`}
            strokeWidth={1.75}
          />
        </span>
      </header>

      <div className={`${TOKENS.surface.input} p-1`}>
        <textarea
          value={seedInput}
          onChange={(event) => onSeedInputChange(event.target.value)}
          placeholder="用自然语言描述你的商业想法…"
          className="block h-24 w-full resize-none bg-transparent px-3 py-2 text-[13px] leading-relaxed text-slate-100 outline-none placeholder:text-slate-500"
          disabled={isProcessing}
        />
      </div>

      <button
        type="button"
        onClick={onSeedGeneration}
        disabled={!seedInput.trim() || isProcessing}
        className={`mt-2.5 inline-flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-semibold transition-colors ${
          isProcessing
            ? 'bg-cyan-400/15 text-cyan-200 cursor-wait'
            : !seedInput.trim()
              ? 'bg-white/[0.04] text-slate-500 cursor-not-allowed'
              : 'bg-cyan-400 text-slate-950 hover:bg-cyan-300'
        }`}
      >
        {isProcessing ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
            执行中…
          </>
        ) : isComplete ? (
          <>
            <Play className="h-3.5 w-3.5" strokeWidth={2} />
            继续生成下一轮
          </>
        ) : (
          <>
            <Wand2 className="h-3.5 w-3.5" strokeWidth={2} />
            生成画布
          </>
        )}
      </button>
    </section>
  )
}
