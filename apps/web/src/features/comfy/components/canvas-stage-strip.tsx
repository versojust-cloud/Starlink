'use client'

/**
 * P13 · CanvasStageStrip — 5-stage pipeline progress strip.
 *
 * Sits directly below CanvasHeader, surfacing the current execution
 * stage (input → generate BMC → review → synthesize → report) with
 * status icon + label + output count + current-action one-liner. Solves
 * the "thinking overlay is a black box" problem without taking up
 * canvas real-estate (40-56px tall, auto-hides 10s after pipeline
 * completes).
 *
 * Pure UI — all derivation logic lives in derive-pipeline-status.ts.
 */

import { useEffect, useState } from 'react'
import { Check, Hourglass, Loader2, Minus, AlertTriangle } from 'lucide-react'
import { useComfyStore } from '../store'
import {
  derivePipelineStatus,
  isPipelineTerminal,
  type PipelineStage,
  type StageStatus
} from '../lib/derive-pipeline-status'

const HIDE_AFTER_TERMINAL_MS = 10_000

export function CanvasStageStrip() {
  const lastPhase = useComfyStore((s) => s.lastPhase)
  const hasStreamFailed = useComfyStore((s) => s.hasStreamFailed)
  const isOrchestratorProcessing = useComfyStore((s) => s.isOrchestratorProcessing)
  const wizardChat = useComfyStore((s) => s.wizardChat)
  const macraNodes = useComfyStore((s) => s.macraNodes)
  const subAgentActivity = useComfyStore((s) => s.subAgentActivity)

  // Re-render every 1s while a stream is running so the staleness check on
  // subAgentActivity (4s freshness window) flips correctly. Cheap — 5 dom
  // diffs per second on a < 200 LOC component.
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!isOrchestratorProcessing) return
    const id = setInterval(() => setTick((n) => (n + 1) % 1000), 1000)
    return () => clearInterval(id)
  }, [isOrchestratorProcessing])

  // P13 · derive on every render. Cheap (single map iteration over
  // ≤30 macra nodes); the 1Hz `tick` setState in the effect above is
  // what drives the subAgentActivity 4s freshness window to flip
  // between fresh and stale without needing a useMemo dep on `tick`.
  const stages = derivePipelineStatus({
    lastPhase,
    isOrchestratorProcessing,
    hasFailed: hasStreamFailed,
    wizardChat: { active: wizardChat.active, stepIndex: wizardChat.stepIndex, totalSteps: 7 },
    macraNodes,
    subAgentActivity,
    now: Date.now()
  })
  void tick

  const terminal = isPipelineTerminal(stages)

  // Auto-hide: once the whole pipeline is at terminal AND the stream is
  // no longer processing, fade out after HIDE_AFTER_TERMINAL_MS.
  const [hidden, setHidden] = useState(false)
  useEffect(() => {
    if (!terminal || isOrchestratorProcessing) {
      setHidden(false)
      return
    }
    const id = setTimeout(() => setHidden(true), HIDE_AFTER_TERMINAL_MS)
    return () => clearTimeout(id)
  }, [terminal, isOrchestratorProcessing])

  // Strip is for LIVE pipeline tracking. Show only when there's at least
  // one live signal: a running stream, a phase event already received, a
  // failure flag, or an active wizard. On a hydrated canvas with no
  // active stream (user just loaded an existing workspace), the strip
  // stays hidden — the canvas content is the source of truth, not a
  // misleading "stages" indicator about an inert pipeline.
  const hasLiveSignal =
    isOrchestratorProcessing ||
    lastPhase !== null ||
    hasStreamFailed ||
    wizardChat.active
  if (!hasLiveSignal) return null
  if (hidden) return null

  // Whether at least one stage exposes a currentAction — reserve the
  // 16px sub-row in that case. Otherwise compact.
  const hasCurrentAction = stages.some((s) => s.currentAction)

  return (
    <div
      className={`relative z-10 hidden sm:flex items-stretch border-b border-stratum-line bg-stratum-surface-low transition-opacity duration-500 ${
        hidden ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
      role="status"
      aria-label="BMC pipeline progress"
      aria-live="polite"
    >
      {stages.map((stage, idx) => (
        <StageCell
          key={stage.id}
          stage={stage}
          showCurrentAction={hasCurrentAction}
          isLast={idx === stages.length - 1}
        />
      ))}
    </div>
  )
}

function StageCell({
  stage,
  showCurrentAction,
  isLast
}: {
  stage: PipelineStage
  showCurrentAction: boolean
  isLast: boolean
}) {
  const tone = STATUS_TONE[stage.status]
  const Icon = STATUS_ICON[stage.status]

  return (
    <div
      className={`flex-1 flex flex-col px-3 py-2 ${
        !isLast ? 'border-r border-stratum-line/40' : ''
      } ${tone.container}`}
      title={
        stage.currentAction
          ? `${stage.kicker} · ${stage.currentAction}`
          : `${stage.kicker} · ${STATUS_LABEL[stage.status]}`
      }
    >
      <div className="flex items-center gap-2 min-w-0">
        <Icon
          className={`h-3.5 w-3.5 shrink-0 ${tone.icon} ${
            stage.status === 'running' ? 'animate-spin' : ''
          }`}
          strokeWidth={2}
        />
        <span
          className={`font-instr text-[9px] uppercase tracking-[0.18em] shrink-0 ${tone.kicker}`}
        >
          {stage.kicker}
        </span>
        <span className={`font-body text-[12px] font-medium truncate ${tone.label}`}>
          {stage.label}
        </span>
        {stage.count !== undefined ? (
          <span
            className={`font-instr text-[10px] tabular-nums shrink-0 ml-auto ${tone.count}`}
          >
            {stage.count}
            {stage.countLabel ? ` ${stage.countLabel}` : ''}
          </span>
        ) : null}
      </div>
      {showCurrentAction ? (
        <span
          className={`mt-0.5 font-body text-[10px] truncate ${
            stage.currentAction ? 'text-stratum-blue' : 'text-transparent'
          }`}
        >
          {stage.currentAction ?? '—'}
        </span>
      ) : null}
    </div>
  )
}

// =====================================================================
// Status → visual tone map
// =====================================================================

const STATUS_TONE: Record<
  StageStatus,
  {
    container: string
    icon: string
    kicker: string
    label: string
    count: string
  }
> = {
  pending: {
    container: '',
    icon: 'text-stratum-muted/60',
    kicker: 'text-stratum-muted/70',
    label: 'text-stratum-muted/80',
    count: 'text-stratum-muted/60'
  },
  running: {
    container: 'bg-white shadow-[inset_0_-2px_0_0_var(--stratum-navy,#131b2e)]',
    icon: 'text-stratum-navy',
    kicker: 'text-stratum-blue',
    label: 'text-stratum-navy',
    count: 'text-stratum-navy'
  },
  done: {
    container: '',
    icon: 'text-stratum-navy',
    kicker: 'text-stratum-muted',
    label: 'text-stratum-navy',
    count: 'text-stratum-muted'
  },
  skipped: {
    container: '',
    icon: 'text-stratum-muted/40',
    kicker: 'text-stratum-muted/50',
    label: 'text-stratum-muted/50',
    count: 'text-stratum-muted/40'
  },
  failed: {
    container: 'bg-stratum-danger/5',
    icon: 'text-stratum-danger',
    kicker: 'text-stratum-danger',
    label: 'text-stratum-danger',
    count: 'text-stratum-danger'
  }
}

const STATUS_ICON: Record<StageStatus, typeof Check> = {
  pending: Hourglass,
  running: Loader2,
  done: Check,
  skipped: Minus,
  failed: AlertTriangle
}

const STATUS_LABEL: Record<StageStatus, string> = {
  pending: '待开始',
  running: '进行中',
  done: '已完成',
  skipped: '未触发',
  failed: '失败'
}
