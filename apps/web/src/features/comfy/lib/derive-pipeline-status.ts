/**
 * P13 · Pipeline 阶段进度条 derive function.
 *
 * Pure transformation: comfy-store snapshot → 5 ordered stages with
 * per-stage status / count / current action one-liner. Drives
 * <CanvasStageStrip /> in the canvas header band.
 *
 * Stages (fixed order, never re-ordered):
 *   1. input       — wizard / waiting for user prompt
 *   2. generate    — market+product+finance agents producing BMC cells
 *   3. review      — critic-agent conflict detection
 *   4. synthesize  — synthesizer cross-dim insights / orchestrator decision
 *   5. report      — report-writer producing final report (optional)
 *
 * NOTE: pure (no React, no DOM, no async). All derivation logic is
 * straight-line so it's trivially unit-testable.
 */

import type { MacraNodeData } from '@/types/macra'

// Local mirror of packages/shared/src/schemas/conversation.ts SeminarPhase
// — keeps this lib free of cross-package imports.
export type SeminarPhase = 'planning' | 'execution' | 'review' | 'decision'

export type StageStatus = 'pending' | 'running' | 'done' | 'skipped' | 'failed'

export type StageKey = 'input' | 'generate' | 'review' | 'synthesize' | 'report'

export type PipelineStage = {
  id: StageKey
  /** Mandarin display label. */
  label: string
  /** Uppercase mono kicker (Editorial Boardroom v2 convention). */
  kicker: string
  status: StageStatus
  /** Numeric output count, e.g. 3 for "3 cells". Undefined if not applicable. */
  count?: number
  /** Unit shown next to the count, e.g. "cells", "conflicts". */
  countLabel?: string
  /** One-liner of what the running agent is doing right now. Only set
   *  when this stage is the running stage AND a recent subAgentActivity
   *  signal is available (≤ 4s old). */
  currentAction?: string
}

export type WizardChatSlim = {
  active: boolean
  stepIndex: number
  /** WIZARD_CHAT_STEPS.length — fixed 7 for current build but parameterized
   *  in case it changes. */
  totalSteps?: number
}

export type SubAgentActivity = {
  parentNode: string
  nodeName: string
  ts: number
}

export type DerivePipelineInput = {
  /** Last `phase.changed` event payload.phase the client received.
   *  null on a fresh canvas. */
  lastPhase: SeminarPhase | null
  /** True while a stream is active (stream.status==='running'). */
  isOrchestratorProcessing: boolean
  /** Stream emitted a status='failed' event. */
  hasFailed: boolean
  /** Wizard chat state snapshot — drives the input stage. */
  wizardChat: WizardChatSlim
  /** All macra nodes by id — used to count cells / conflicts / reports
   *  per stage. */
  macraNodes: Map<string, MacraNodeData>
  /** Latest subagent breadcrumb (parent agent + sub-node). */
  subAgentActivity: SubAgentActivity | null
  /** ms — used to age out stale subAgentActivity. Inject Date.now() at
   *  call site to keep this function pure / testable. */
  now: number
}

const SUBAGENT_FRESHNESS_MS = 4_000

/**
 * Map LangGraph subgraph parent-node identifier (e.g. 'marketAgent') to
 * a human label. Mirrors `agent-registry.ts` for the stage strip.
 */
const AGENT_LABEL: Record<string, string> = {
  marketAgent: 'market-agent',
  productAgent: 'product-agent',
  financeAgent: 'finance-agent',
  criticAgent: 'critic-agent',
  synthesizer: 'synthesizer',
  generalResponder: 'general-responder',
  deepResearch: 'deep-research',
  reportWriter: 'report-writer'
}

/**
 * Subgraph internal node → human action descriptor. The frontend has
 * no business showing internal LangGraph node names raw; this maps them
 * to "调用工具 / 推理中 / 解析输出" so users can read it.
 */
const NODE_ACTION: Record<string, string> = {
  tools: '调用工具',
  'call-llm': '推理中',
  parse: '解析输出',
  'invoke-agent': '执行子图'
}

function deriveCurrentAction(
  activity: SubAgentActivity | null,
  now: number
): string | undefined {
  if (!activity) return undefined
  if (now - activity.ts > SUBAGENT_FRESHNESS_MS) return undefined
  const agent = AGENT_LABEL[activity.parentNode] ?? activity.parentNode
  const action = NODE_ACTION[activity.nodeName] ?? activity.nodeName
  return `${agent} · ${action}`
}

function countByMacraType(nodes: Map<string, MacraNodeData>, type: string): number {
  let n = 0
  for (const node of nodes.values()) {
    if (node.type === type) n += 1
  }
  return n
}

/**
 * Build the 5-stage status array for the current canvas state.
 *
 * Status decision tree (per stage):
 *   - failed: hasFailed=true AND this is the currently-running stage
 *     (the stage where the failure occurred is the latest one with
 *     activity)
 *   - done: stage's terminal condition met — see table below
 *   - running: stage's start condition met AND not done
 *   - skipped: stage was passed without entering (e.g. report when no
 *     report-card node ever appeared)
 *   - pending: not yet entered
 *
 * Terminal conditions:
 *   - input: wizardChat.active=false AND (wizardChat.history.length>0 OR
 *     isOrchestratorProcessing OR macraNodes has any cc-bmc-card)
 *   - generate: lastPhase is 'review' or 'decision', OR has cc-bmc-card>=1 AND not running
 *   - review: lastPhase='decision' OR (has cc-bmc-card AND not running)
 *   - synthesize: not running AND (consistencySummary set OR has insight-note)
 *   - report: report-card count > 0
 */
export function derivePipelineStatus(input: DerivePipelineInput): PipelineStage[] {
  const {
    lastPhase,
    isOrchestratorProcessing,
    hasFailed,
    wizardChat,
    macraNodes,
    subAgentActivity,
    now
  } = input

  const totalSteps = wizardChat.totalSteps ?? 7

  // Cell / conflict / insight counts driven from macraNodes.
  const bmcCellCount = countByMacraType(macraNodes, 'cc-bmc-card')
  const conflictCount = countByMacraType(macraNodes, 'conflict-alert')
  // Synthesizer outputs as insight-note prefixed `synthesizer-` or
  // `synth-` (mention router uses `synthesizer-` prefix). Insight-note
  // from other agents (general-responder etc.) is excluded.
  let synthInsightCount = 0
  for (const node of macraNodes.values()) {
    if (node.type === 'insight-note' && /^(synthesizer|synth)-/.test(node.id)) {
      synthInsightCount += 1
    }
  }
  const reportCount = countByMacraType(macraNodes, 'report-card')

  // Derive a single "active stage" identifier so we can attach the
  // currentAction string to exactly one stage. Order of preference:
  // most recent phase signal → fall back to BMC cell count → input.
  const activeStage: StageKey = (() => {
    if (reportCount > 0 && isOrchestratorProcessing) return 'report'
    if (lastPhase === 'decision') return 'synthesize'
    if (lastPhase === 'review') return 'review'
    if (lastPhase === 'execution') return 'generate'
    if (lastPhase === 'planning' || wizardChat.active) return 'input'
    if (bmcCellCount > 0) return 'generate'
    return 'input'
  })()

  const action = deriveCurrentAction(subAgentActivity, now)

  // ============= Stage 1 · INPUT =============
  // Wizard active → running with progress; wizard finished AND something
  // downstream started → done; otherwise pending.
  const inputDone =
    !wizardChat.active &&
    (wizardChat.stepIndex >= totalSteps ||
      bmcCellCount > 0 ||
      lastPhase !== null ||
      isOrchestratorProcessing)

  const inputStage: PipelineStage = {
    id: 'input',
    label: '输入',
    kicker: 'INPUT',
    status: wizardChat.active
      ? 'running'
      : inputDone
        ? 'done'
        : 'pending',
    count: wizardChat.active
      ? wizardChat.stepIndex
      : inputDone
        ? Math.max(wizardChat.stepIndex, 1)
        : undefined,
    countLabel: wizardChat.active ? `/ ${totalSteps}` : wizardChat.stepIndex >= totalSteps ? `/ ${totalSteps}` : undefined,
    currentAction: activeStage === 'input' ? action : undefined
  }

  // ============= Stage 2 · GENERATE =============
  // Running when phase=execution OR cells appearing during processing;
  // done once review/decision phase reached.
  const generatePhaseReached =
    lastPhase === 'execution' || lastPhase === 'review' || lastPhase === 'decision'
  const generateDone =
    bmcCellCount >= 1 &&
    (lastPhase === 'review' || lastPhase === 'decision' || !isOrchestratorProcessing)
  const generateRunning =
    !generateDone &&
    (lastPhase === 'execution' || (isOrchestratorProcessing && bmcCellCount > 0 && lastPhase !== 'review' && lastPhase !== 'decision'))

  const generateStage: PipelineStage = {
    id: 'generate',
    label: '生成 BMC',
    kicker: 'GENERATE',
    status: hasFailed && activeStage === 'generate'
      ? 'failed'
      : generateDone
        ? 'done'
        : generateRunning
          ? 'running'
          : generatePhaseReached
            ? 'done'
            : 'pending',
    count: bmcCellCount > 0 ? bmcCellCount : undefined,
    countLabel: bmcCellCount > 0 ? 'cells' : undefined,
    currentAction: activeStage === 'generate' ? action : undefined
  }

  // ============= Stage 3 · REVIEW =============
  const reviewDone = lastPhase === 'decision' || (!isOrchestratorProcessing && conflictCount > 0)
  const reviewRunning = lastPhase === 'review' && !reviewDone

  const reviewStage: PipelineStage = {
    id: 'review',
    label: '审议',
    kicker: 'REVIEW',
    status: hasFailed && activeStage === 'review'
      ? 'failed'
      : reviewDone
        ? 'done'
        : reviewRunning
          ? 'running'
          : 'pending',
    count: conflictCount > 0 ? conflictCount : undefined,
    countLabel: conflictCount > 0 ? (conflictCount === 1 ? 'conflict' : 'conflicts') : undefined,
    currentAction: activeStage === 'review' ? action : undefined
  }

  // ============= Stage 4 · SYNTHESIZE =============
  const synthesizeDone =
    !isOrchestratorProcessing &&
    (synthInsightCount > 0 || (lastPhase === 'decision' && bmcCellCount > 0))
  const synthesizeRunning = lastPhase === 'decision' && isOrchestratorProcessing && !synthesizeDone

  const synthesizeStage: PipelineStage = {
    id: 'synthesize',
    label: '综合',
    kicker: 'SYNTHESIZE',
    status: hasFailed && activeStage === 'synthesize'
      ? 'failed'
      : synthesizeDone
        ? 'done'
        : synthesizeRunning
          ? 'running'
          : 'pending',
    count: synthInsightCount > 0 ? synthInsightCount : undefined,
    countLabel: synthInsightCount > 0 ? 'insights' : undefined,
    currentAction: activeStage === 'synthesize' ? action : undefined
  }

  // ============= Stage 5 · REPORT =============
  // Optional. Skipped unless a report-card has been produced (only @-mention
  // report-writer triggers this).
  const reportStage: PipelineStage = {
    id: 'report',
    label: '报告',
    kicker: 'REPORT',
    status: hasFailed && activeStage === 'report'
      ? 'failed'
      : reportCount > 0
        ? isOrchestratorProcessing && activeStage === 'report'
          ? 'running'
          : 'done'
        : isOrchestratorProcessing
          ? 'pending'
          : 'skipped',
    count: reportCount > 0 ? reportCount : undefined,
    countLabel: reportCount > 0 ? 'reports' : undefined,
    currentAction: activeStage === 'report' ? action : undefined
  }

  // Patch input → generate stage cascade: when generate is running OR
  // done, input must be done (regardless of wizard answer count).
  if (generateStage.status === 'running' || generateStage.status === 'done') {
    if (inputStage.status === 'pending') inputStage.status = 'done'
  }
  // Cascade: anything past review → review at minimum done.
  if (synthesizeStage.status === 'running' || synthesizeStage.status === 'done') {
    if (reviewStage.status === 'pending') reviewStage.status = 'done'
    if (generateStage.status === 'pending') generateStage.status = 'done'
  }

  // Mention-only cascade · @report-writer can produce a report-card without
  // going through the seminar pipeline (no phase.changed events). In that
  // case reportStage flips to 'done' but earlier stages stay 'pending',
  // which looks like the strip is stuck. Mark the earlier-pending stages
  // as 'skipped' to clearly signal "this was a direct mention, not a
  // full BMC run".
  if (reportStage.status === 'done' && !isOrchestratorProcessing) {
    for (const s of [inputStage, generateStage, reviewStage, synthesizeStage]) {
      if (s.status === 'pending') s.status = 'skipped'
    }
  }

  // P13 Bug fix · failure cascade. When the stream failed at stage X,
  // every stage AFTER X is 'skipped' (we'll never get to it), not
  // 'pending' (which would imply we're still queued). Without this,
  // isPipelineTerminal returns false on a failed pipeline because
  // downstream stages stay pending → the auto-hide timer never fires
  // and the strip lingers forever showing a misleading status.
  const ordered: PipelineStage[] = [
    inputStage,
    generateStage,
    reviewStage,
    synthesizeStage,
    reportStage
  ]
  if (hasFailed) {
    const failedAt = ordered.findIndex((s) => s.status === 'failed')
    if (failedAt >= 0) {
      for (let i = failedAt + 1; i < ordered.length; i += 1) {
        if (ordered[i].status === 'pending' || ordered[i].status === 'running') {
          ordered[i].status = 'skipped'
        }
      }
    }
  }

  return ordered
}

/**
 * True when the entire pipeline is at terminal state — used by the strip
 * auto-hide effect. All 5 stages must be done | skipped | failed.
 */
export function isPipelineTerminal(stages: PipelineStage[]): boolean {
  return stages.every(
    (s) => s.status === 'done' || s.status === 'skipped' || s.status === 'failed'
  )
}
