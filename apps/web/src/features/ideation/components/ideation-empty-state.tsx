'use client'

import { Wand2, MousePointer2 } from 'lucide-react'
import { StarlinkGlyph } from './starlink-glyph'

/**
 * Empty-state for the ideation canvas.
 *
 * Visual intent: the user is about to chart unknown territory. So this is
 * less "landing page" and more "navigator's startup screen":
 *
 *   - Faint dotted star-field across the whole canvas (pseudo-grid)
 *   - A larger-than-glyph constellation centerpiece, slowly twinkling
 *   - Mono "coordinates" line under the centerpiece — feels like an
 *     instrument readout reporting "you are here" before the journey starts
 *   - Two CTAs framed as expedition styles: "guided expedition" vs
 *     "free exploration", each with a one-line description
 *   - Bottom-edge tip is a navigator's hint, not boilerplate
 *
 * Style budget: zero new dependencies, only existing tokens + small inline
 * SVG. Animations are CSS-keyframe (twinkle + slow drift) defined in
 * apps/web/app/globals.css under `.starlink-twinkle-*`.
 */
export function IdeationEmptyState({
  onSeed,
  onLaunchWizard
}: {
  onSeed: () => void
  onLaunchWizard: () => void
}) {
  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* Star field background — faint dotted pattern with a subtle vignette */}
      <div
        className="absolute inset-0 opacity-50"
        style={{
          backgroundImage:
            'radial-gradient(rgba(148, 163, 184, 0.15) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
          backgroundPosition: '0 0'
        }}
        aria-hidden
      />
      {/* Soft vignette so the center is the focus */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at center, transparent 35%, rgba(2, 6, 23, 0.85) 75%)'
        }}
        aria-hidden
      />

      {/* Centerpiece content */}
      <div className="relative flex h-full flex-col items-center justify-center px-8">
        {/* Decorative top frame: two thin lines + a mono kicker — feels like
            chart header */}
        <div className="mb-12 flex items-center gap-3">
          <div className="h-px w-10 bg-cyan-300/30" />
          <span className="font-mono text-[10px] uppercase tracking-[0.32em] text-cyan-300/80">
            Starlink · Ideation
          </span>
          <div className="h-px w-10 bg-cyan-300/30" />
        </div>

        {/* Constellation centerpiece — bigger glyph + ring, gently twinkling */}
        <div className="relative mb-8 flex h-24 w-24 items-center justify-center">
          {/* outer ring */}
          <div className="absolute inset-0 rounded-full border border-white/[0.08]" />
          <div
            className="absolute inset-2 rounded-full border border-cyan-300/15"
            style={{ animation: 'starlinkRingDrift 14s linear infinite' }}
          />
          {/* glyph */}
          <div className="text-cyan-300">
            <StarlinkGlyph size={48} />
          </div>
        </div>

        {/* Coordinates readout — instrument feel */}
        <div className="mb-6 font-mono text-[10px] uppercase tracking-[0.22em] text-slate-500">
          <span className="text-slate-400">LAT</span>
          <span className="ml-1.5 tabular-nums text-slate-300">00.000</span>
          <span className="mx-3 text-slate-700">·</span>
          <span className="text-slate-400">LON</span>
          <span className="ml-1.5 tabular-nums text-slate-300">00.000</span>
          <span className="mx-3 text-slate-700">·</span>
          <span className="text-cyan-300/80">YOU ARE HERE</span>
        </div>

        {/* Editorial heading */}
        <h2 className="mb-3 text-center text-[24px] font-semibold leading-tight tracking-tight text-white">
          为你的想法
          <br />
          <span className="text-slate-400">绘制一份星图</span>
        </h2>
        <p className="mb-8 max-w-md text-center text-[13px] leading-relaxed text-slate-400">
          从一句话核心想法出发 — 客户痛点、价值角度、假设、验证渠道一步步浮现。
          AI 教练在右侧出反思问题，**不会替你写**，只会帮你看见盲点。
        </p>

        {/* Expedition picker — two paths, each with a one-line frame */}
        <div className="grid w-full max-w-md grid-cols-1 gap-2.5 sm:grid-cols-2">
          <ExpeditionCard
            primary
            onClick={onLaunchWizard}
            kicker="EXPEDITION · 01"
            title="七步引导"
            sub="AI 带你走 7 个核心问题 · 自动落到画布"
            icon={<Wand2 className="h-3.5 w-3.5" strokeWidth={2} />}
          />
          <ExpeditionCard
            onClick={onSeed}
            kicker="EXPEDITION · 02"
            title="自由探索"
            sub="从一个核心想法开始 · 你拖、AI 反思"
            icon={<MousePointer2 className="h-3.5 w-3.5" strokeWidth={1.75} />}
          />
        </div>

        {/* Bottom-edge navigator hint */}
        <p className="mt-10 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-slate-600">
          <span className="inline-block h-px w-6 bg-slate-700" />
          也可以直接从左侧拖一个节点上画布
          <span className="inline-block h-px w-6 bg-slate-700" />
        </p>
      </div>
    </div>
  )
}

interface ExpeditionCardProps {
  kicker: string
  title: string
  sub: string
  icon: React.ReactNode
  onClick: () => void
  primary?: boolean
}

function ExpeditionCard({ kicker, title, sub, icon, onClick, primary }: ExpeditionCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors ${
        primary
          ? 'border-cyan-300/40 bg-cyan-400/[0.06] hover:bg-cyan-400/[0.10]'
          : 'border-white/[0.08] bg-white/[0.02] hover:border-white/[0.16] hover:bg-white/[0.04]'
      }`}
    >
      <p
        className={`font-mono text-[10px] uppercase tracking-[0.22em] ${
          primary ? 'text-cyan-300/80' : 'text-slate-500'
        }`}
      >
        {kicker}
      </p>
      <span className="mt-1 flex items-center gap-1.5 text-[13px] font-semibold text-white">
        <span
          className={`inline-flex h-5 w-5 items-center justify-center rounded ${
            primary ? 'bg-cyan-300/20 text-cyan-200' : 'bg-white/[0.04] text-slate-300'
          }`}
        >
          {icon}
        </span>
        {title}
      </span>
      <p className="text-[11px] leading-relaxed text-slate-400">{sub}</p>
    </button>
  )
}
