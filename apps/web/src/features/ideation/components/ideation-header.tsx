'use client'

import { LayoutGrid, PanelsTopLeft, Sparkles, Trash2, Undo2 } from 'lucide-react'
import { TOKENS } from '@/features/comfy/components/canvas-design-tokens'
import { useIdeationStore } from '../store/ideation-store'
import { StarlinkGlyph } from './starlink-glyph'

/**
 * Top header — "navigator's instrument panel" treatment.
 *
 *   ┌─[GLYPH]─ STARLINK / IDEATION ─────────  N · 0   L · 0   ──── [CTA] ┐
 *   │         CANVAS · MODE — COACH                                       │
 *
 *   - Brand glyph = constellation SVG that twinkles (defined in
 *     starlink-glyph.tsx + globals.css keyframes)
 *   - Title uses mono "/" separator → product feels like a system path
 *   - Subline becomes a "MODE · STATUS" status strip in mono
 *   - Counters become tabular-num readouts with small mono "·" separators
 *   - "AI 反思" header CTA stays as the primary entry point but
 *     animates a tiny cyan dot when it would have something to say
 *     (Stage C; for now it's static)
 */
export function IdeationHeader() {
  const nodeCount = useIdeationStore((s) => s.nodes.length)
  const edgeCount = useIdeationStore((s) => s.edges.length)
  const reset = useIdeationStore((s) => s.reset)
  const mode = useIdeationStore((s) => s.mode)
  const viewMode = useIdeationStore((s) => s.viewMode)
  const setViewMode = useIdeationStore((s) => s.setViewMode)
  const coachThinking = useIdeationStore((s) => s.coachThinking)
  const requestManualReflection = useIdeationStore((s) => s.requestManualReflection)
  const reflectDisabled = nodeCount === 0 || mode === 'wizard' || coachThinking

  return (
    <header
      className={`relative z-20 flex shrink-0 items-center justify-between px-6 py-3 ${TOKENS.surface.bar}`}
    >
      {/* Brand cluster ----------------------------------------------------- */}
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.02] text-cyan-300">
          <StarlinkGlyph size={16} />
        </div>
        <div className="flex flex-col leading-tight">
          {/* Mono "/" separator — gives the title a system-path feel */}
          <h1 className="flex items-baseline gap-1.5 text-[15px] font-semibold tracking-tight text-white">
            STARLINK
            <span className="font-mono text-[12px] font-normal text-slate-600">/</span>
            <span className="text-slate-300">Ideation</span>
          </h1>
          {/* Status strip — feels like an instrument readout */}
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">
            <span className="text-slate-600">CANVAS · MODE</span>{' '}
            <span className="text-cyan-300/80">{mode === 'wizard' ? 'WIZARD' : 'COACH'}</span>
          </p>
        </div>
      </div>

      {/* Right cluster ----------------------------------------------------- */}
      <div className="flex items-center gap-2">
        {/* View segmented control — Canvas vs BMC 9-grid output */}
        <div
          role="group"
          aria-label="切换视图"
          className="flex items-center gap-0.5 rounded-lg border border-white/[0.06] bg-slate-950/50 p-1"
        >
          <button
            type="button"
            onClick={() => setViewMode('canvas')}
            aria-pressed={viewMode === 'canvas'}
            className={
              viewMode === 'canvas' ? TOKENS.button.segmentActive : TOKENS.button.segmentIdle
            }
          >
            <PanelsTopLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
            画布
          </button>
          <button
            type="button"
            onClick={() => setViewMode('bmc')}
            aria-pressed={viewMode === 'bmc'}
            className={
              viewMode === 'bmc' ? TOKENS.button.segmentActive : TOKENS.button.segmentIdle
            }
          >
            <LayoutGrid className="h-3.5 w-3.5" strokeWidth={1.75} />
            BMC 9 宫格
          </button>
        </div>

        {/* Chart stats — tabular-num readouts */}
        <div className="flex items-center gap-3 whitespace-nowrap rounded-lg border border-white/[0.06] bg-slate-950/50 px-3 py-1.5">
          <Stat label="N" value={nodeCount} />
          <span className="text-slate-700">·</span>
          <Stat label="L" value={edgeCount} />
        </div>

        <button
          type="button"
          className={TOKENS.button.ghost}
          onClick={() => {
            if (nodeCount === 0) return
            const ok = window.confirm('清空画布上所有节点？此操作不可撤销。')
            if (ok) reset()
          }}
          aria-label="清空画布"
        >
          <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
          清空
        </button>

        <button type="button" className={TOKENS.button.ghost} aria-label="撤销" disabled>
          <Undo2 className="h-3.5 w-3.5" strokeWidth={1.75} />
          撤销
        </button>

        <button
          type="button"
          onClick={requestManualReflection}
          disabled={reflectDisabled}
          className={`${TOKENS.button.primary} disabled:cursor-not-allowed disabled:opacity-40`}
          aria-label={
            nodeCount === 0
              ? '请先在画布上添加节点'
              : mode === 'wizard'
                ? '引导模式中无法手动反思'
                : '让 AI 现在反思一下当前画布'
          }
          title={
            nodeCount === 0
              ? '需要先在画布上添加至少一个节点'
              : mode === 'wizard'
                ? '退出引导模式后可手动反思'
                : '让 AI 立即对当前画布给出一条反思（绕过去重）'
          }
        >
          <Sparkles className="h-3.5 w-3.5" strokeWidth={2} />
          AI 反思
        </button>
      </div>
    </header>
  )
}

/** Tiny mono-readout stat — N · 0 / L · 0 style. */
function Stat({ label, value }: { label: string; value: number }) {
  return (
    <span className="inline-flex items-baseline gap-1">
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-cyan-300/80">{label}</span>
      <span className="font-mono text-[12px] font-medium tabular-nums text-white">
        {value.toString().padStart(2, '0')}
      </span>
    </span>
  )
}
