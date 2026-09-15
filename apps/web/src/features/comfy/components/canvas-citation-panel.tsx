'use client'

/**
 * Right-side citation panel — collapsible Stratum-styled panel that
 * surfaces knowledgeEvidence sources. Click an evidence row to open
 * the existing EvidenceDrawer.
 *
 * Stacks two compact sections beneath the citations list:
 *   1. Live Conflicts — top 3 critic-detected conflicts.
 *   2. Live Status — workflow stage summary, processing indicator.
 *
 * Reads:
 *   - knowledgeEvidence (KnowledgeEvidence[])
 *   - macraNodes (filter conflict-alert)
 *   - workflowStage
 * Writes:
 *   - openEvidenceDrawer(evidenceId)
 */

import { useEffect, useMemo, useState } from 'react'
import { BookOpen, FileText, X, Brain, Activity, AlertTriangle, ChevronDown } from 'lucide-react'
import { useComfyStore } from '../store'
import { WORKFLOW_STAGE_LABELS } from '../store/workflow-stage'
import { CanvasMemoryList } from './canvas-memory-list'

type TabId = 'citations' | 'memory' | 'review' | 'status'

type Severity = 'high' | 'moderate' | 'low'

const SEVERITY_TEXT: Record<Severity, string> = {
  high:     'text-stratum-danger',
  moderate: 'text-stratum-blue',
  low:      'text-stratum-ok',
}
const SEVERITY_BAR: Record<Severity, string> = {
  high:     'bg-stratum-danger',
  moderate: 'bg-stratum-blue',
  low:      'bg-stratum-ok',
}

type Props = {
  open: boolean
  onToggle: () => void
  workspaceId: string
  /** When set (e.g. user clicked a conflict edge on canvas), auto-switch
   *  to the 审查 tab and inline-expand the matching conflict id. */
  highlightedConflictId?: string | null
}

const TABS: ReadonlyArray<{ id: TabId; label: string; icon: typeof BookOpen }> = [
  { id: 'citations', label: '证据', icon: BookOpen },
  { id: 'memory',    label: '记忆', icon: Brain },
  { id: 'review',    label: '审查', icon: AlertTriangle },
  { id: 'status',    label: '状态', icon: Activity },
]

export function CanvasCitationPanel({ open, onToggle, workspaceId, highlightedConflictId }: Props) {
  const knowledgeEvidence = useComfyStore((s) => s.knowledgeEvidence)
  const openEvidenceDrawer = useComfyStore((s) => s.openEvidenceDrawer)
  const macraNodes = useComfyStore((s) => s.macraNodes)
  const workflowStage = useComfyStore((s) => s.workflowStage)
  const isProcessing = useComfyStore((s) => s.isOrchestratorProcessing)
  const [activeTab, setActiveTab] = useState<TabId>('citations')

  // When parent surfaces a conflict id (e.g. user clicked a conflict edge
  // on canvas), auto-switch to 审查 so the user lands directly on the
  // detail. ReviewTab itself uses the same id to inline-expand the row.
  useEffect(() => {
    if (highlightedConflictId) setActiveTab('review')
  }, [highlightedConflictId])

  // All conflicts with full content + relatedAgents — drives the
  // expandable Review tab. The Status tab still shows just top 3 (capped).
  const allConflicts = useMemo(() => {
    return Array.from(macraNodes.values())
      .filter((node) => node.type === 'conflict-alert')
      .map((node, idx) => {
        const n = node as {
          label?: string
          content?: string
          severity?: string
          conflictType?: string
          metadata?: { tags?: string[] }
        }
        const title = n.label?.toString() ?? `维度冲突 ${idx + 1}`
        const severityRaw = (n.severity ?? 'high').toLowerCase()
        const severity: Severity = severityRaw === 'low' ? 'low' : severityRaw === 'moderate' ? 'moderate' : 'high'
        const weight = severity === 'high' ? 0.82 : severity === 'moderate' ? 0.55 : 0.3
        return {
          id: node.id,
          title,
          severity,
          weight,
          content: n.content ?? '',
          conflictType: n.conflictType,
          tags: n.metadata?.tags ?? [],
        }
      })
  }, [macraNodes])

  const conflicts = useMemo(() => allConflicts.slice(0, 3), [allConflicts])

  if (!open) {
    return (
      <button
        type="button"
        onClick={onToggle}
        className="absolute top-1/2 right-4 -translate-y-1/2 z-10 flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-lg border border-stratum-line text-stratum-navy hover:text-stratum-blue transition-colors pointer-events-auto"
        aria-label="打开证据面板"
      >
        <BookOpen className="h-5 w-5" strokeWidth={1.75} />
        {knowledgeEvidence.length > 0 ? (
          <span
            aria-hidden="true"
            className="absolute -top-0.5 -right-0.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-stratum-blue px-1 font-body text-[9px] font-bold text-white border-2 border-white tabular-nums"
          >
            {knowledgeEvidence.length}
          </span>
        ) : null}
      </button>
    )
  }

  return (
    <aside
      className="absolute right-4 top-4 bottom-4 z-10 w-[340px] flex flex-col rounded-2xl bg-white shadow-lg border border-stratum-line pointer-events-auto"
      role="region"
      aria-label="证据 + 实时状态"
    >
      <header className="border-b border-stratum-line">
        <div className="flex items-center justify-between px-4 pt-3 pb-2">
          <p className="font-body text-[10px] font-semibold uppercase tracking-[0.18em] text-stratum-blue">
            INSIGHT PANEL
          </p>
          <button
            type="button"
            onClick={onToggle}
            className="flex h-7 w-7 items-center justify-center rounded-full text-stratum-muted hover:bg-stratum-surface-low hover:text-stratum-navy transition-colors"
            aria-label="收起面板"
          >
            <X className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>
        </div>
        {/* Tab strip */}
        <nav role="tablist" aria-label="Insight tabs" className="flex items-center gap-1 px-2 pb-2">
          {TABS.map((t) => {
            const Icon = t.icon
            const isActive = t.id === activeTab
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveTab(t.id)}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 font-body text-[11px] font-semibold transition-colors ${
                  isActive
                    ? 'bg-stratum-navy text-white'
                    : 'text-stratum-muted hover:bg-stratum-surface-low hover:text-stratum-navy'
                }`}
              >
                <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
                {t.label}
              </button>
            )
          })}
        </nav>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {activeTab === 'memory' ? (
          <CanvasMemoryList workspaceId={workspaceId} />
        ) : null}

        {activeTab === 'review' ? (
          <ReviewTab conflicts={allConflicts} forceExpanded={highlightedConflictId ?? null} />
        ) : null}

        {activeTab === 'citations' ? (
          <>
        {/* Citations list */}
        <section>
          <p className="font-body text-[10px] font-semibold uppercase tracking-[0.18em] text-stratum-muted mb-2">
            知识库证据 · {knowledgeEvidence.length}
          </p>
          {knowledgeEvidence.length === 0 ? (
            <p className="font-body text-[12px] text-stratum-muted leading-relaxed">
              当前会话尚未引用任何外部知识。运行 AI Synthesis 或导入文档后，agent 引用的片段会出现在这里。
            </p>
          ) : (
            <ul className="space-y-2">
              {knowledgeEvidence.slice(0, 12).map((ev, idx) => {
                const id = ev.id ?? ev.docId ?? `ev-${idx}`
                const title = ev.title ?? ev.docId ?? '未命名证据'
                const snippet = ev.snippet ?? ev.content ?? ''
                const score = typeof ev.score === 'number' ? ev.score.toFixed(2) : null
                return (
                  <li key={id}>
                    <button
                      type="button"
                      onClick={() => openEvidenceDrawer(id)}
                      className="w-full text-left rounded-lg border border-stratum-line bg-stratum-surface-low px-3 py-2 transition-colors hover:border-stratum-blue/40 hover:bg-white"
                    >
                      <div className="flex items-baseline gap-2 mb-1">
                        <FileText className="h-3 w-3 text-stratum-blue shrink-0 self-center" strokeWidth={1.75} />
                        <span className="font-body text-[12px] font-semibold text-stratum-navy truncate flex-1">
                          {title}
                        </span>
                        {score ? (
                          <span className="font-body text-[10px] tabular-nums text-stratum-muted shrink-0">
                            {score}
                          </span>
                        ) : null}
                      </div>
                      {snippet ? (
                        <p className="font-body text-[11px] leading-relaxed text-stratum-muted line-clamp-2">
                          {snippet}
                        </p>
                      ) : null}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
          </>
        ) : null}

        {activeTab === 'status' ? (
          <>
        {/* Live Conflicts */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <p className="font-body text-[10px] font-semibold uppercase tracking-[0.18em] text-stratum-muted">
              实时冲突 · {conflicts.length}
            </p>
            <span
              aria-hidden="true"
              className={`h-2 w-2 rounded-full ${
                conflicts.length > 0 ? 'bg-stratum-danger animate-pulse' : 'bg-stratum-ok'
              }`}
            />
          </div>
          {conflicts.length === 0 ? (
            <p className="font-body text-[12px] text-stratum-muted leading-relaxed">
              尚未检出 agent 间冲突。运行 Re-Calculate 触发 critic 扫描。
            </p>
          ) : (
            <ul className="space-y-2">
              {conflicts.map((row) => (
                <li key={row.id} className="rounded-lg bg-stratum-surface-low px-3 py-2">
                  <div className="flex items-baseline justify-between gap-2 mb-1.5">
                    <span className="font-body text-[11px] font-medium text-stratum-navy truncate">
                      {row.title}
                    </span>
                    <span className={`font-body text-[10px] font-semibold shrink-0 ${SEVERITY_TEXT[row.severity]}`}>
                      {row.severity.toUpperCase()}
                    </span>
                  </div>
                  <div className="h-1 w-full overflow-hidden rounded-full bg-white">
                    <div
                      className={`h-full ${SEVERITY_BAR[row.severity]}`}
                      style={{ width: `${Math.round(row.weight * 100)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Live status */}
        <section className="rounded-lg border border-stratum-line bg-stratum-surface-low px-3 py-2.5">
          <p className="font-body text-[10px] font-semibold uppercase tracking-[0.18em] text-stratum-muted mb-1.5">
            实时状态 · LIVE
          </p>
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className={`h-1.5 w-1.5 rounded-full ${
                isProcessing ? 'bg-stratum-blue animate-pulse' : 'bg-stratum-ok'
              }`}
            />
            <span className="font-body text-[12px] font-medium text-stratum-navy">
              {WORKFLOW_STAGE_LABELS[workflowStage]}
            </span>
          </div>
        </section>
          </>
        ) : null}
      </div>
    </aside>
  )
}

/**
 * ReviewTab — collapsible list of critic-detected conflicts. Each row
 * is a one-line summary (title + severity badge); clicking expands the
 * full markdown content + related agents inline. Replaces the canvas-
 * level conflict-alert nodes which were polluting the layout.
 */
function ReviewTab({
  conflicts,
  forceExpanded,
}: {
  conflicts: Array<{
    id: string
    title: string
    severity: Severity
    weight: number
    content: string
    conflictType?: string
    tags: string[]
  }>
  /** When set, override local expandedId so the matching conflict row
   *  inline-expands. Driven by canvas edge clicks via parent panel. */
  forceExpanded?: string | null
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // External force (canvas edge click) wins over local clicks. Each new
  // forceExpanded value re-runs the effect. After applying, user can
  // still click again locally to collapse / pick another row.
  useEffect(() => {
    if (forceExpanded) setExpandedId(forceExpanded)
  }, [forceExpanded])

  if (conflicts.length === 0) {
    return (
      <section>
        <p className="font-body text-[10px] font-semibold uppercase tracking-[0.18em] text-stratum-muted mb-2">
          审查 · CONFLICTS
        </p>
        <p className="font-body text-[12px] text-stratum-muted leading-relaxed">
          画布上未检出 agent 间冲突。@critic-agent 或点 Re-Calculate 触发新一轮扫描。
        </p>
      </section>
    )
  }

  // Group by severity for visual triage
  const grouped: Record<Severity, typeof conflicts> = { high: [], moderate: [], low: [] }
  conflicts.forEach((c) => grouped[c.severity].push(c))
  const ORDER: Severity[] = ['high', 'moderate', 'low']
  const SEV_LABEL: Record<Severity, string> = { high: '严重', moderate: '中等', low: '轻微' }

  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <p className="font-body text-[10px] font-semibold uppercase tracking-[0.18em] text-stratum-muted">
          审查 · {conflicts.length} CONFLICTS
        </p>
        <span className="font-mono text-[10px] tabular-nums text-stratum-muted">
          高 {grouped.high.length} · 中 {grouped.moderate.length} · 低 {grouped.low.length}
        </span>
      </div>
      <div className="space-y-3">
        {ORDER.map((sev) => {
          const list = grouped[sev]
          if (list.length === 0) return null
          return (
            <div key={sev}>
              <p className="font-body text-[9px] font-bold uppercase tracking-[0.18em] text-stratum-muted mb-1.5">
                {SEV_LABEL[sev]} · {list.length}
              </p>
              <ul className="space-y-1.5">
                {list.map((c) => {
                  const isOpen = expandedId === c.id
                  return (
                    <li key={c.id} className="border border-stratum-line bg-white">
                      <button
                        type="button"
                        onClick={() => setExpandedId(isOpen ? null : c.id)}
                        className="w-full flex items-start gap-2 px-3 py-2 text-left hover:bg-stratum-surface-low/40 transition-colors"
                      >
                        <span
                          aria-hidden="true"
                          className={`mt-0.5 h-2 w-2 rounded-full shrink-0 ${SEVERITY_BAR[sev]}`}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="font-body text-[12px] font-semibold text-stratum-navy line-clamp-1">
                              {c.title}
                            </span>
                            <ChevronDown
                              className={`h-3 w-3 text-stratum-muted shrink-0 transition-transform ${
                                isOpen ? 'rotate-180' : ''
                              }`}
                              strokeWidth={1.75}
                            />
                          </div>
                          {c.conflictType ? (
                            <span className="font-mono text-[9px] tabular-nums text-stratum-muted">
                              {c.conflictType}
                            </span>
                          ) : null}
                        </div>
                      </button>
                      {isOpen ? (
                        <div className="border-t border-stratum-line px-3 py-2 bg-stratum-surface-low/30">
                          <p className="font-body text-[11px] leading-[1.6] text-stratum-ink whitespace-pre-wrap break-words">
                            {c.content || '(无详细描述)'}
                          </p>
                          {c.tags.length > 0 ? (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {c.tags.map((t) => (
                                <span
                                  key={t}
                                  className="font-mono text-[9px] tabular-nums px-1.5 py-0.5 bg-white border border-stratum-line text-stratum-muted"
                                >
                                  {t}
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}
      </div>
    </section>
  )
}
