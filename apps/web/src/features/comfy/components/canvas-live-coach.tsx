'use client'

/**
 * Canvas live-coach — small floating "what's happening / what to do next"
 * panel. Differs from `canvas-thinking-overlay.tsx` in that:
 *   - Non-modal: sits in the corner, doesn't block the canvas
 *   - Adapts to canvas STATE not just streaming flag:
 *     idle → "input prompt or upload KB" with quick CTAs
 *     thinking → live agent ticker (one line, latest dispatch)
 *     output + has conflicts → "fix conflicts" suggestion
 *     output + missing report → "generate full BMC report" suggestion
 *     output + has report → "read drawer" suggestion
 *   - Each suggestion is clickable + routes to the right action
 *
 * Lives on the canvas while the user collaborates with agents in
 * real time, surfacing the "next thing" so the user is never stuck
 * looking at the canvas wondering what to do.
 */

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowRight, Brain, Database, FileText, Lightbulb, ListChecks, Sparkles, Square } from 'lucide-react'
import { useComfyStore } from '../store'

const AGENT_DISPATCH_TICKS: ReadonlyArray<string> = [
  '客户细分 · 拆解中',
  '价值主张 · 比对中',
  '渠道通路 · 探查中',
  '收入来源 · 估算中',
  '成本结构 · 核算中',
  '关键资源 · 盘点中',
  '关键合作 · 梳理中',
  '关键活动 · 列举中',
  'Critic · 检测冲突',
  'Synthesizer · 整合输出',
]

/**
 * Sprint 3.3 · map AGENT_TYPES enum value (e.g. 'Market_Agent') to a
 * short Chinese display label. Falls back to a humanised version of the
 * id when an unmapped agent emits.
 */
const AGENT_DISPLAY: Record<string, string> = {
  Market_Agent: 'Market Agent',
  Product_Agent: 'Product Agent',
  Finance_Agent: 'Finance Agent',
  Compliance_Agent: 'Compliance Agent',
  Adversarial_Critic: 'Critic',
  Orchestrator: 'Supervisor',
  Synthesizer: 'Synthesizer',
  Report_Writer: 'Report Writer'
}

function humanizeAgent(raw: string | null): string | null {
  if (!raw) return null
  if (AGENT_DISPLAY[raw]) return AGENT_DISPLAY[raw]
  return raw.replace(/_/g, ' ')
}

interface SuggestionAction {
  /** Short imperative label, e.g. "查看冲突" */
  label: string
  /** Trigger when clicked. */
  onClick: () => void
  /** Severity styling: primary = call-to-action; warn = problem; info = nice-to-have. */
  severity: 'primary' | 'warn' | 'info'
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>
}

interface CoachState {
  /** Mono kicker, e.g. "WAITING · 待你输入" */
  kicker: string
  /** One-line headline (Chinese, ~20 chars). */
  headline: string
  /** Optional sub-line (12 chars max recommended). */
  detail?: string
  /** Up to 2 suggestion buttons. */
  actions: SuggestionAction[]
}

interface Props {
  workspaceId: string
  /** Open the wizard panel (parent controls via state). */
  onOpenWizard: () => void
  /** Open the KB upload modal. */
  onOpenKb: () => void
  /** Open the long-term memory drawer. */
  onOpenMemory: () => void
  /** Toggle insight panel on the conflicts tab. */
  onShowConflicts: () => void
  /** Open the chat dock. */
  onOpenChat: () => void
  /**
   * P11.18 anti-overlap · when the right-side citation/insight panel
   * (340px) is open, shift this floating column to the left of it
   * so the COACH chip + 向导/记忆/资料 buttons don't get covered.
   */
  shiftLeftForPanel?: boolean
}

export function CanvasLiveCoach(props: Props) {
  const workflowStage = useComfyStore((s) => s.workflowStage)
  const macraNodes = useComfyStore((s) => s.macraNodes)
  const setChatInput = useComfyStore((s) => s.setChatInput)
  const currentAgent = useComfyStore((s) => s.currentAgent)
  const roundNumber = useComfyStore((s) => s.roundNumber)
  const maxRounds = useComfyStore((s) => s.maxRounds)
  const lastDeltaAt = useComfyStore((s) => s.lastDeltaAt)
  const lastCompletionAt = useComfyStore((s) => s.lastCompletionAt)
  const cancelActiveSession = useComfyStore((s) => s.cancelActiveSession)
  const [tickIndex, setTickIndex] = useState(0)
  const [collapsed, setCollapsed] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  // Derive canvas content stats so the coach can suggest the right
  // next step based on what's already there. Cheap recomputation —
  // macraNodes is a Map of ≤ 100 entries in practice.
  const stats = useMemo(() => {
    let bmc = 0, conflicts = 0, insights = 0, reports = 0
    for (const node of macraNodes.values()) {
      if (node.type === 'cc-bmc-card') bmc += 1
      else if (node.type === 'conflict-alert') conflicts += 1
      else if (node.type === 'insight-note') insights += 1
      else if (node.type === 'report-card') reports += 1
    }
    return { bmc, conflicts, insights, reports, total: macraNodes.size }
  }, [macraNodes])

  /**
   * Coach context-awareness — read what the user actually has on canvas
   * so suggestions can target the specific gaps. Three signals:
   *   1. projectHeadline · the first non-empty BMC cell title or root
   *      summary, used to address the user with their own wording
   *   2. missingDomains  · which of the 9 BMC dimensions have no cell
   *      yet — coach proposes the matching agent
   *   3. lowGroundingDomains · cells whose grounding rate < 30% — coach
   *      suggests RAG / KB upload to firm them up
   */
  const projectContext = useMemo(() => {
    type CellInfo = { domain: string; agent: 'market' | 'product' | 'finance'; idPrefix: string }
    // Mapping from id-prefix → which agent owns the dimension
    const NINE_DIMENSIONS: CellInfo[] = [
      { domain: '客户细分',   agent: 'market',  idPrefix: 'market-customer-segments' },
      { domain: '客户关系',   agent: 'market',  idPrefix: 'market-customer-relationships' },
      { domain: '渠道通路',   agent: 'market',  idPrefix: 'market-channels' },
      { domain: '价值主张',   agent: 'product', idPrefix: 'product-value-propositions' },
      { domain: '关键资源',   agent: 'product', idPrefix: 'product-key-resources' },
      { domain: '关键业务',   agent: 'product', idPrefix: 'product-key-activities' },
      { domain: '重要合作',   agent: 'product', idPrefix: 'product-key-partnerships' },
      { domain: '收入来源',   agent: 'finance', idPrefix: 'finance-revenue-streams' },
      { domain: '成本结构',   agent: 'finance', idPrefix: 'finance-cost-structure' }
    ]
    const present = new Set<string>()
    let projectHeadline: string | null = null
    const lowGroundingDomains: string[] = []
    for (const node of macraNodes.values()) {
      if (node.type !== 'cc-bmc-card') continue
      present.add(node.id)
      // Detect low-grounding cells. groundingRate lives in metadata; we
      // duplicate the < 0.30 threshold from cc-bmc-card-node.tsx Sprint 3.1.
      const meta = node.metadata as Record<string, unknown> | undefined
      const grounding = typeof meta?.groundingRate === 'number' ? (meta.groundingRate as number) : null
      if (grounding !== null && grounding < 0.3) {
        const dim = NINE_DIMENSIONS.find((d) => d.idPrefix === node.id)
        if (dim) lowGroundingDomains.push(dim.domain)
      }
      // First non-empty cell title becomes the project headline.
      const label = (node.label || '').trim()
      if (!projectHeadline && label && label !== '未命名') {
        projectHeadline = label.length > 18 ? `${label.slice(0, 18)}…` : label
      }
    }
    const missingDimensions = NINE_DIMENSIONS.filter((d) => !present.has(d.idPrefix))
    // Pick a representative agent to recommend: whichever agent has the
    // most missing dimensions (so the user hits the biggest gap with one click)
    const missingByAgent: Record<string, number> = { market: 0, product: 0, finance: 0 }
    missingDimensions.forEach((d) => { missingByAgent[d.agent] += 1 })
    const topGapAgent = (Object.entries(missingByAgent) as Array<['market' | 'product' | 'finance', number]>)
      .sort((a, b) => b[1] - a[1])[0]
    const suggestedAgent = topGapAgent && topGapAgent[1] > 0 ? topGapAgent[0] : null
    return { projectHeadline, missingDimensions, lowGroundingDomains, suggestedAgent }
  }, [macraNodes])

  // Cycle the agent ticker only while thinking.
  useEffect(() => {
    if (workflowStage !== 'thinking' && workflowStage !== 'revising') return
    const id = setInterval(() => {
      setTickIndex((prev) => (prev + 1) % AGENT_DISPATCH_TICKS.length)
    }, 1600)
    return () => clearInterval(id)
  }, [workflowStage])

  // Sprint 3.3 · advance "now" so quiet-stream stall detection ticks
  // (during live work) and Sprint 4.4 · so completion banner expires
  // cleanly after 12s.
  useEffect(() => {
    const isLive = workflowStage === 'thinking' || workflowStage === 'revising'
    const completionAgeMs = lastCompletionAt ? Date.now() - lastCompletionAt : Infinity
    const showingBanner =
      (workflowStage === 'output' || workflowStage === 'cancelled') &&
      completionAgeMs < 12_000
    if (!isLive && !showingBanner) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [workflowStage, lastCompletionAt])

  const coachState: CoachState = useMemo(() => {
    // Sprint 3.3 · live ticker — prefer real agent + round signal,
    // fall back to dimension cycle when stream hasn't emitted yet
    // or has gone quiet (>8s since last delta = stall).
    const agentLabel = humanizeAgent(currentAgent)
    const sinceDeltaMs = lastDeltaAt ? now - lastDeltaAt : Infinity
    const isQuiet = sinceDeltaMs > 8_000
    const elapsedSec = lastDeltaAt && isQuiet ? Math.round(sinceDeltaMs / 1000) : null

    // Sprint 4.1 · stop button — only shows during live work, severity=warn
    // so it reads as "interrupt", not "primary action".
    const stopAction: SuggestionAction = {
      label: '停止',
      onClick: () => {
        void cancelActiveSession('user-cancelled')
      },
      severity: 'warn',
      icon: Square,
    }

    if (workflowStage === 'thinking') {
      const round = roundNumber > 0 ? roundNumber : 1
      const kicker = `LIVE · 第 ${round}/${maxRounds} 轮`
      if (agentLabel && !isQuiet) {
        return {
          kicker,
          headline: `${agentLabel} · 输出中`,
          detail: `已 ${stats.bmc}/9 cells · ${stats.conflicts} 冲突 · ${stats.insights} 洞察`,
          actions: [stopAction]
        }
      }
      // Stream silent or hasn't emitted yet — fall back to friendly ticker
      return {
        kicker,
        headline: agentLabel
          ? `${agentLabel} · 计算中（${elapsedSec ?? '…'}s）`
          : AGENT_DISPATCH_TICKS[tickIndex],
        detail: '画布会逐步浮现节点；不要切走',
        actions: [stopAction]
      }
    }
    if (workflowStage === 'revising') {
      const round = roundNumber > 0 ? roundNumber : 1
      return {
        kicker: `LIVE · 第 ${round}/${maxRounds} 轮 · 修订`,
        headline: agentLabel ? `${agentLabel} · 修订中` : '正在重写节点修复冲突',
        detail: 'Critic 找到的问题正在被对应 agent 改正',
        actions: [stopAction]
      }
    }
    // Sprint 4.4 · transient completion banner — shows for 12s after a
    // live stream wraps. Highlights what was added so the user notices
    // the canvas changed (especially after they tab-away and back).
    const completionAgeMs = lastCompletionAt ? now - lastCompletionAt : Infinity
    const justCompleted =
      (workflowStage === 'output' || workflowStage === 'cancelled') &&
      completionAgeMs < 12_000
    if (justCompleted && stats.total > 0) {
      const parts: string[] = []
      if (stats.bmc > 0) parts.push(`${stats.bmc} cells`)
      if (stats.conflicts > 0) parts.push(`${stats.conflicts} 冲突`)
      if (stats.insights > 0) parts.push(`${stats.insights} 洞察`)
      if (stats.reports > 0) parts.push(`${stats.reports} 报告`)
      const summary = parts.length > 0 ? parts.join(' · ') : '画布已更新'
      return {
        kicker: workflowStage === 'cancelled' ? 'STOPPED · 已停止' : '✓ 完成 · 本轮新增',
        headline: summary,
        detail: `共 ${roundNumber} 轮协作 · 点开任一节点查看详情`,
        actions: [
          stats.reports === 0 && stats.bmc >= 9
            ? {
                label: '生成报告',
                onClick: () => {
                  setChatInput('@report-writer 基于当前画布生成完整商业报告')
                  props.onOpenChat()
                },
                severity: 'primary' as const,
                icon: Sparkles
              }
            : { label: '查看画布', onClick: props.onOpenChat, severity: 'info' as const, icon: ArrowRight }
        ]
      }
    }

    if (workflowStage === 'review') {
      return {
        kicker: 'HITL · 等你拍板',
        headline: '有决策需要你确认',
        detail: '点开聊天，看 critic 提出的问题',
        actions: [
          { label: '打开聊天', onClick: props.onOpenChat, severity: 'primary', icon: ArrowRight }
        ]
      }
    }
    if (workflowStage === 'failed') {
      return {
        kicker: 'ERROR · 流程失败',
        headline: '上一次推演中断',
        detail: '可以重新输入、或开 KB 上传',
        actions: [
          { label: '重试', onClick: props.onOpenChat, severity: 'primary', icon: ArrowRight },
          { label: '上传 KB', onClick: props.onOpenKb, severity: 'info', icon: FileText }
        ]
      }
    }

    // Static states (idle / input / output / cancelled): tailor by canvas content
    if (stats.total === 0) {
      // Empty canvas — onboarding
      return {
        kicker: 'WAITING · 待你输入',
        headline: '画布是空的，先告诉我你的想法',
        detail: '一句话也行，AI 会逐步拆解',
        actions: [
          { label: '7 步引导', onClick: props.onOpenWizard, severity: 'primary', icon: Sparkles },
          { label: '上传 KB', onClick: props.onOpenKb, severity: 'info', icon: FileText }
        ]
      }
    }
    if (stats.bmc < 9 && stats.bmc > 0) {
      // Coach context-awareness · address the user's project specifically
      // and recommend the agent with the biggest gap. Examples:
      //   "B2B 咖啡订阅 · 还差 3 维度（客户细分 / 渠道通路 / 收入来源）"
      //   → 一键 fill: pre-fills @market-agent 帮你补完 客户细分/渠道通路
      const headline = projectContext.projectHeadline
        ? `${projectContext.projectHeadline} · 还差 ${9 - stats.bmc} 维度`
        : `9 维度 · 已填 ${stats.bmc} / 9`
      const missingNames = projectContext.missingDimensions.slice(0, 3).map(d => d.domain).join(' / ')
      const detail = missingNames || '点开聊天 @ 对应 agent 补缺'
      const ag = projectContext.suggestedAgent
      const fillLabel = ag === 'market' ? '@market 补市场' : ag === 'product' ? '@product 补产品' : ag === 'finance' ? '@finance 补财务' : '打开聊天'
      const fillCommand = ag
        ? `@${ag}-agent 帮我补 ${projectContext.missingDimensions.filter(d => d.agent === ag).map(d => d.domain).join('、')}`
        : ''
      return {
        kicker: 'PARTIAL · BMC 待补全',
        headline,
        detail,
        actions: [
          ag
            ? {
                label: fillLabel,
                onClick: () => { setChatInput(fillCommand); props.onOpenChat() },
                severity: 'primary',
                icon: Sparkles
              }
            : { label: '打开聊天', onClick: props.onOpenChat, severity: 'primary', icon: ArrowRight }
        ]
      }
    }
    if (stats.conflicts > 0) {
      const headline = projectContext.projectHeadline
        ? `${projectContext.projectHeadline} · ${stats.conflicts} 处冲突待解`
        : `Critic 标了 ${stats.conflicts} 处冲突`
      return {
        kicker: 'CONFLICT · 待解决',
        headline,
        detail: '点开看是否真冲突，或让 critic 重审',
        actions: [
          { label: '查看冲突', onClick: props.onShowConflicts, severity: 'warn', icon: AlertTriangle }
        ]
      }
    }
    // Coach context · grounding gate — flag low-evidence cells when
    // BMC complete + no conflicts. User likely needs more KB data.
    if (stats.bmc >= 9 && projectContext.lowGroundingDomains.length >= 3) {
      return {
        kicker: 'EVIDENCE · 证据率偏低',
        headline: `${projectContext.lowGroundingDomains.length} 个维度证据不足`,
        detail: `${projectContext.lowGroundingDomains.slice(0, 3).join(' / ')} 主要靠模型推理`,
        actions: [
          { label: '上传 KB', onClick: props.onOpenKb, severity: 'primary', icon: FileText },
          {
            label: '深度调研',
            onClick: () => {
              setChatInput(`@deep-research 给 ${projectContext.lowGroundingDomains.slice(0, 2).join('、')} 找业内数据`)
              props.onOpenChat()
            },
            severity: 'info',
            icon: ArrowRight
          }
        ]
      }
    }
    if (stats.bmc >= 9 && stats.reports === 0) {
      return {
        kicker: 'COMPLETE · 可生成报告',
        headline: 'BMC 9 维度齐了，要不要写报告',
        detail: '@report-writer 整合成 6 段长文',
        actions: [
          {
            label: '生成报告',
            onClick: () => {
              setChatInput('@report-writer 基于当前画布生成完整商业报告')
              props.onOpenChat()
            },
            severity: 'primary',
            icon: Sparkles
          }
        ]
      }
    }
    if (stats.reports > 0) {
      return {
        kicker: 'READY · 已有报告',
        headline: `${stats.reports} 份报告 · ${stats.insights} 条洞察`,
        detail: '点报告卡读完整内容，或追问 agent',
        actions: [
          { label: '问 agent', onClick: props.onOpenChat, severity: 'info', icon: ArrowRight }
        ]
      }
    }
    // Output but no BMC + no conflicts + no report: insights only
    return {
      kicker: 'INSIGHTS · 已采集',
      headline: `已有 ${stats.insights} 条洞察`,
      detail: '继续 @ agent 推演到完整 BMC',
      actions: [
        { label: '打开聊天', onClick: props.onOpenChat, severity: 'primary', icon: ArrowRight }
      ]
    }
  }, [workflowStage, stats, tickIndex, setChatInput, props, currentAgent, roundNumber, maxRounds, lastDeltaAt, lastCompletionAt, now, cancelActiveSession, projectContext])

  // P10.4 · 3 quick-access buttons in a tight column under Coach.
  // User feedback: 之前 200px 宽 + "AI 引导 · 7 步" 太冗。
  // 现在: 紧凑 px-2.5, 文案缩成 2-3 字（向导 / 记忆 / 资料）+ icon。
  // 用 self-end 让按钮宽度由内容决定，且右对齐贴 Coach 一列。
  const quickButtons = (
    <div className="flex flex-col gap-1.5 items-end">
      <button
        type="button"
        onClick={props.onOpenWizard}
        className="flex h-8 items-center gap-1.5 rounded-full bg-white pl-2.5 pr-3 shadow-lg border border-stratum-line text-stratum-navy hover:text-stratum-blue hover:border-stratum-blue/40 transition-[color,border-color,transform] duration-150 ease-out active:scale-[0.97] active:translate-y-px pointer-events-auto"
        aria-label="结构化向导 · 7 步"
        title="结构化向导 · 7 步"
      >
        <ListChecks className="h-3.5 w-3.5" strokeWidth={1.75} />
        <span className="font-body text-[11px] font-semibold">向导</span>
      </button>
      <button
        type="button"
        onClick={props.onOpenMemory}
        className="flex h-8 items-center gap-1.5 rounded-full bg-white pl-2.5 pr-3 shadow-lg border border-stratum-line text-stratum-navy hover:text-press hover:border-press/40 transition-[color,border-color,transform] duration-150 ease-out active:scale-[0.97] active:translate-y-px pointer-events-auto"
        aria-label="查看长期记忆"
        title="查看长期记忆"
      >
        <Brain className="h-3.5 w-3.5" strokeWidth={1.75} />
        <span className="font-body text-[11px] font-semibold">记忆</span>
      </button>
      <button
        type="button"
        onClick={props.onOpenKb}
        className="flex h-8 items-center gap-1.5 rounded-full bg-white pl-2.5 pr-3 shadow-lg border border-stratum-line text-stratum-navy hover:text-stratum-blue hover:border-stratum-blue/40 transition-[color,border-color,transform] duration-150 ease-out active:scale-[0.97] active:translate-y-px pointer-events-auto"
        aria-label="打开 KB 资料"
        title="打开 KB 资料"
      >
        <Database className="h-3.5 w-3.5" strokeWidth={1.75} />
        <span className="font-body text-[11px] font-semibold">资料</span>
      </button>
    </div>
  )

  // P11.18 · when the right-side citation panel (340px wide,
  // right-4 to right-edge) is open, shift this column left so it
  // sits to the LEFT of the panel rather than getting covered.
  // Citation panel width 340 + right-4 padding 16 + 16 gap = 372px
  // offset from the right edge.
  const positionClass = props.shiftLeftForPanel
    ? 'absolute top-[88px] right-[372px] z-20 flex flex-col gap-2 items-end transition-[right] duration-200'
    : 'absolute top-[88px] right-6 z-20 flex flex-col gap-2 items-end transition-[right] duration-200'

  if (collapsed) {
    return (
      <div className={positionClass}>
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          aria-label="展开 AI 教练"
          className="flex items-center gap-1.5 rounded-full bg-stratum-navy px-3 py-1.5 shadow-lg text-white hover:bg-stratum-navy-soft transition-[background-color,transform] duration-150 ease-out active:scale-[0.97] active:translate-y-px pointer-events-auto"
        >
          <Lightbulb className="h-3.5 w-3.5 text-stratum-sky" strokeWidth={2} fill="#89CEFF" />
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em]">COACH</span>
        </button>
        {quickButtons}
      </div>
    )
  }

  const isLive = workflowStage === 'thinking' || workflowStage === 'revising'

  return (
    <div className={positionClass}>
    <aside
      className="w-[300px] max-w-[40vw] rounded-xl bg-white shadow-lg border border-stratum-line pointer-events-auto"
      aria-label="AI 教练"
    >
      <header className="flex items-center justify-between px-3 py-2 border-b-[0.5px] border-stratum-line bg-stratum-surface-low/40 rounded-t-xl">
        <div className="flex items-center gap-1.5 min-w-0">
          {isLive ? (
            <span className="flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-stratum-blue opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-stratum-blue"></span>
              </span>
            </span>
          ) : (
            <Lightbulb className="h-3 w-3 text-stratum-blue shrink-0" strokeWidth={2} />
          )}
          <span className="font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-stratum-blue truncate">
            {coachState.kicker}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          aria-label="收起"
          className="font-mono text-[9px] uppercase tracking-[0.14em] text-stratum-muted hover:text-stratum-navy"
        >
          ─
        </button>
      </header>
      <div className="px-3 py-2.5">
        <p className="font-display font-[700] text-[13px] leading-tight tracking-tight text-stratum-navy">
          {coachState.headline}
        </p>
        {coachState.detail ? (
          <p className="mt-1 font-body text-[11px] leading-snug text-stratum-muted">
            {coachState.detail}
          </p>
        ) : null}
        {coachState.actions.length > 0 ? (
          <div className="flex items-center gap-1.5 mt-2.5">
            {coachState.actions.map((action) => {
              const Icon = action.icon
              const className =
                action.severity === 'primary'
                  ? 'bg-stratum-navy text-white hover:bg-stratum-navy-soft'
                  : action.severity === 'warn'
                  ? 'bg-stratum-danger-wash text-stratum-danger hover:bg-stratum-danger-wash/80'
                  : 'bg-stratum-surface-low text-stratum-navy hover:bg-stratum-surface'
              return (
                <button
                  key={action.label}
                  type="button"
                  onClick={action.onClick}
                  // Tactile feedback (taste-skill Rule 5): physical
                  // press cue on :active. transform + opacity only —
                  // no width/height animation (hardware-accelerated).
                  className={`flex items-center gap-1 rounded-full px-2.5 py-1 font-body text-[11px] font-semibold transition-[background-color,transform] duration-150 ease-out active:scale-[0.97] active:translate-y-px ${className}`}
                >
                  <Icon className="h-3 w-3" strokeWidth={2} />
                  {action.label}
                </button>
              )
            })}
          </div>
        ) : null}
        {/* Stats footer when canvas has content.
            taste-skill anti-emoji: replace ⚠/💡/📊 with stroke icons
            from lucide so the chrome reads as a real instrument
            cluster, not a chat-style sticker row. */}
        {stats.total > 0 ? (
          <div className="mt-2.5 pt-2 border-t-[0.5px] border-stratum-line flex items-center gap-3 font-mono text-[9px] tabular-nums text-stratum-muted">
            <span>BMC {stats.bmc}/9</span>
            {stats.conflicts > 0 ? (
              <span className="inline-flex items-center gap-1 text-stratum-danger">
                <AlertTriangle className="h-2.5 w-2.5" strokeWidth={2} />
                {stats.conflicts}
              </span>
            ) : null}
            {stats.insights > 0 ? (
              <span className="inline-flex items-center gap-1">
                <Lightbulb className="h-2.5 w-2.5" strokeWidth={2} />
                {stats.insights}
              </span>
            ) : null}
            {stats.reports > 0 ? (
              <span className="inline-flex items-center gap-1">
                <FileText className="h-2.5 w-2.5" strokeWidth={2} />
                {stats.reports}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </aside>
    {quickButtons}
    </div>
  )
}
