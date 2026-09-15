'use client'

/**
 * Right-side floating insight panel — Live Conflicts + Next Best Action.
 *
 * Two stacked cards in the top-right corner of the canvas:
 *
 *   1. Live Conflicts — pulls conflict-alert nodes from macraNodes,
 *      shows top 5 with severity progress bars. Empty state copy when
 *      no conflicts yet so the panel still feels alive.
 *   2. Next Best Action — deep-navy card with sky-blue blur halo, gives
 *      the user one suggested next step. Mirrors the Stratum reference
 *      "Apply Suggested Hedge" affordance.
 *
 * Pure presentational — wires up reads from the comfy store but does
 * not own any state. Mounting site is comfy-canvas-page (standalone
 * branch) so it overlays the ReactFlow surface in absolute positioning.
 */

import { useMemo } from 'react'
import { Sparkles, ShieldAlert } from 'lucide-react'
import { useComfyStore } from '../store'

type HitlDecision = {
  conversationId: string
  payload: { decision: unknown; occurredAt: unknown }
}

type Severity = 'high' | 'moderate' | 'low'

type ConflictRow = {
  id: string
  title: string
  severity: Severity
  weight: number
}

const SEVERITY_STYLES: Record<Severity, { label: string; bar: string; text: string }> = {
  high:     { label: 'High',     bar: 'bg-stratum-danger',                  text: 'text-stratum-danger' },
  moderate: { label: 'Moderate', bar: 'bg-stratum-blue',                    text: 'text-stratum-blue' },
  low:      { label: 'Low',      bar: 'bg-stratum-ok',                      text: 'text-stratum-ok' },
}

type Props = {
  onSynthesize?: () => void
  pendingDecision?: HitlDecision | null
  onApproveAutoRevise?: () => void
  onAcceptCurrentDecision?: () => void
}

export function CanvasInsightPanel({
  onSynthesize,
  pendingDecision,
  onApproveAutoRevise,
  onAcceptCurrentDecision,
}: Props) {
  const macraNodes = useComfyStore((state) => state.macraNodes)
  const isProcessing = useComfyStore((state) => state.isOrchestratorProcessing)

  const conflicts: ConflictRow[] = useMemo(() => {
    return Array.from(macraNodes.values())
      .filter((node) => node.type === 'conflict-alert')
      .slice(0, 5)
      .map((node, index) => {
        const title = (node as { title?: string }).title?.toString() ?? `维度冲突 ${index + 1}`
        const severityRaw = ((node as { severity?: string }).severity ?? 'high').toLowerCase()
        const severity: Severity = severityRaw === 'low' ? 'low' : severityRaw === 'moderate' ? 'moderate' : 'high'
        const weight = severity === 'high' ? 0.82 : severity === 'moderate' ? 0.55 : 0.3
        return { id: node.id, title, severity, weight }
      })
  }, [macraNodes])

  return (
    <aside className="absolute top-6 right-6 z-10 w-80 flex flex-col gap-4 pointer-events-auto">
      {/* HITL Decision Required — shown ABOVE conflicts when pending */}
      {pendingDecision ? (
        <section className="rounded-2xl border border-stratum-danger/40 bg-stratum-danger-wash/40 p-5 shadow-lg backdrop-blur-xl">
          <header className="flex items-center gap-2 mb-3">
            <ShieldAlert className="h-4 w-4 text-stratum-danger shrink-0" strokeWidth={2} />
            <span className="font-body text-[10px] font-bold uppercase tracking-[0.18em] text-stratum-danger">
              Decision Required · 等你裁决
            </span>
            <span aria-hidden="true" className="ml-auto h-2 w-2 rounded-full bg-stratum-danger animate-pulse" />
          </header>
          <p className="font-body text-[12px] leading-relaxed text-stratum-ink mb-4">
            Critic 检出多 agent 之间的冲突，supervisor 暂停了流程，等你决定如何继续。
          </p>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={onApproveAutoRevise}
              className="w-full rounded-lg bg-stratum-navy py-2 font-body text-[11px] font-semibold text-white transition-colors hover:bg-stratum-navy-soft"
            >
              让 Agent 自行修正
            </button>
            <button
              type="button"
              onClick={onAcceptCurrentDecision}
              className="w-full rounded-lg border border-stratum-line bg-white py-2 font-body text-[11px] font-semibold text-stratum-navy transition-colors hover:border-stratum-blue/40 hover:text-stratum-blue"
            >
              接受当前结果
            </button>
          </div>
        </section>
      ) : null}

      {/* Live Conflicts */}
      <section className="rounded-2xl bg-white/95 backdrop-blur-xl p-5 shadow-lg border border-stratum-line">
        <header className="flex items-center justify-between mb-4">
          <span className="font-body text-[10px] font-semibold uppercase tracking-[0.18em] text-stratum-muted">
            Live Conflicts · 实时冲突
          </span>
          <span
            aria-hidden="true"
            className={`h-2 w-2 rounded-full ${
              conflicts.length > 0 ? 'bg-stratum-danger animate-pulse' : 'bg-stratum-ok'
            }`}
          />
        </header>

        {conflicts.length > 0 ? (
          <div className="space-y-3">
            {conflicts.map((row) => {
              const style = SEVERITY_STYLES[row.severity]
              return (
                <div key={row.id} className="rounded-lg bg-stratum-surface-low px-3 py-2">
                  <div className="flex items-baseline justify-between gap-2 mb-1.5">
                    <span className="font-body text-[11px] font-medium text-stratum-navy truncate">
                      {row.title}
                    </span>
                    <span className={`font-body text-[10px] font-semibold shrink-0 ${style.text}`}>
                      {style.label}
                    </span>
                  </div>
                  <div className="h-1 w-full overflow-hidden rounded-full bg-white">
                    <div className={`h-full ${style.bar}`} style={{ width: `${Math.round(row.weight * 100)}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="font-body text-[12px] leading-relaxed text-stratum-muted">
            尚未发现 agent 间的维度冲突。运行 critic 或推进自由画布生成后，冲突会实时浮现。
          </p>
        )}
      </section>

      {/* Next Best Action */}
      <section className="relative overflow-hidden rounded-2xl bg-stratum-navy p-5 shadow-xl group">
        <div
          aria-hidden="true"
          className="absolute -top-8 -right-8 h-32 w-32 rounded-full bg-stratum-blue/30 blur-3xl transition-all group-hover:bg-stratum-blue/45"
        />
        <header className="relative z-[1] flex items-center gap-2 mb-2">
          <Sparkles className="h-4 w-4 text-stratum-sky" strokeWidth={2} fill="#89CEFF" />
          <h3 className="font-display font-[700] text-[15px] tracking-tight text-white">
            Next Best Action
          </h3>
        </header>
        <p className="relative z-[1] font-body text-[12px] leading-relaxed text-white/85 mb-4">
          {conflicts.length > 0 ? (
            <>
              Strategy Agent 建议<span className="text-stratum-sky"> Dynamic Hedge </span>
              来缓和 Risk Agent 的反对，同时保持扩张轨迹。
            </>
          ) : (
            <>
              画布尚空。先<span className="text-stratum-sky">运行 AI Synthesis</span>
              生成首轮多 agent 分析，再迭代细化每个商业维度。
            </>
          )}
        </p>
        <button
          type="button"
          onClick={onSynthesize}
          disabled={isProcessing}
          className="relative z-[1] w-full rounded-lg border border-white/20 bg-white/10 py-2.5 font-body text-[11px] font-semibold text-white transition-all hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {conflicts.length > 0 ? 'Apply Suggested Hedge' : '运行 AI Synthesis'}
        </button>
      </section>
    </aside>
  )
}
