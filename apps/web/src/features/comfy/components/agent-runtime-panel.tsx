'use client'

import { useMemo, useState } from 'react'
import { Bot, ChevronDown, ChevronUp, Network, Radar, Sparkles } from 'lucide-react'
import type { WorkspaceGraphResponse } from '@/types/graph'
import { buildAgentWorkspaceSnapshot } from '@/features/workspace/lib/agent-runtime'
import {
  type ConversationRuntimeEvent,
  useConversationRuntime
} from '@/features/workspace/hooks'
import { useComfyStore } from '../store'
import { TOKENS } from './canvas-design-tokens'

/**
 * Agent runtime panel (refresh-2026-04).
 *
 * Refresh notes:
 *  - Cyan-blue gradient header chip → flat cyan-tinted square chip.
 *  - 4-up stat grid uses uniform neutral surfaces with kicker-style labels.
 *  - Session-scope segmented control now matches the canvas-header pattern.
 *  - Timeline rail thinner (1 px white/10), step number is a 20-px tinted
 *    circle (was 24 px solid pill).
 *  - Per-agent card densified — grid moved to compact 2-up info chips.
 *  - Data flow / memo logic untouched: this is a pure visual swap.
 */

type AgentRuntimePanelProps = {
  workspaceId: string
}

export function AgentRuntimePanel({ workspaceId }: AgentRuntimePanelProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [mode, setMode] = useState<'current' | 'all'>('current')
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null)
  const nodes = useComfyStore((state) => state.nodes)
  const edges = useComfyStore((state) => state.edges)
  const openDetailPanel = useComfyStore((state) => state.openDetailPanel)
  const roundNumber = useComfyStore((state) => state.roundNumber)
  const maxRounds = useComfyStore((state) => state.maxRounds)
  const runtime = useConversationRuntime(workspaceId)

  const graph = useMemo<WorkspaceGraphResponse>(() => ({
    workspaceId,
    nodes: nodes.map((node) => ({
      id: node.id,
      type: 'note',
      position: node.position,
      data: node.data as WorkspaceGraphResponse['nodes'][number]['data']
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: typeof edge.label === 'string' ? edge.label : undefined
    }))
  }), [edges, nodes, workspaceId])

  const snapshot = useMemo(() => buildAgentWorkspaceSnapshot(graph), [graph])

  const conversations = useMemo(() => {
    const grouped = new Map<string, { id: string; updatedAt: string; latestPhase: string | null }>()

    for (const event of runtime.events) {
      const occurredAt = getEventOccurredAt(event)
      const current = grouped.get(event.conversationId)
      if (!current || occurredAt > current.updatedAt) {
        grouped.set(event.conversationId, {
          id: event.conversationId,
          updatedAt: occurredAt,
          latestPhase: event.type === 'phase.changed' ? event.payload.phase : current?.latestPhase ?? null
        })
      } else if (event.type === 'phase.changed') {
        current.latestPhase = event.payload.phase
      }
    }

    return [...grouped.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }, [runtime.events])

  const activeConversationId = useMemo(() => {
    if (mode === 'all') return null
    if (selectedConversationId && conversations.some((item) => item.id === selectedConversationId)) {
      return selectedConversationId
    }
    return runtime.latestConversationId ?? conversations[0]?.id ?? null
  }, [conversations, mode, runtime.latestConversationId, selectedConversationId])

  const filteredEvents = useMemo(
    () => runtime.events.filter((event) => !activeConversationId || event.conversationId === activeConversationId),
    [activeConversationId, runtime.events]
  )

  const filteredTurns = useMemo(
    () => filteredEvents.filter((event): event is Extract<ConversationRuntimeEvent, { type: 'seminar.turn.completed' }> => event.type === 'seminar.turn.completed'),
    [filteredEvents]
  )

  const filteredPhase = useMemo(() => {
    const phases = filteredEvents.filter((event): event is Extract<ConversationRuntimeEvent, { type: 'phase.changed' }> => event.type === 'phase.changed')
    return phases[phases.length - 1]?.payload.phase ?? null
  }, [filteredEvents])

  const filteredDecision = useMemo(() => {
    const decisions = filteredEvents.filter((event): event is Extract<ConversationRuntimeEvent, { type: 'seminar.decision.made' }> => event.type === 'seminar.decision.made')
    return decisions[decisions.length - 1]?.payload.decision ?? null
  }, [filteredEvents])

  const sessionAgentViews = useMemo(() => {
    const turnsByAgent = new Map<string, typeof filteredTurns>()
    for (const turn of filteredTurns) {
      const current = turnsByAgent.get(turn.payload.agentId) ?? []
      current.push(turn)
      turnsByAgent.set(turn.payload.agentId, current)
    }

    const activeAgentIds = new Set(filteredTurns.map((turn) => turn.payload.agentId))

    return snapshot.agents.map((agent) => {
      const agentTurns = turnsByAgent.get(agent.id) ?? []
      const sessionStageCounts = {
        planning: 0,
        execution: 0,
        review: 0,
        decision: 0
      }

      for (const turn of agentTurns) {
        sessionStageCounts[turn.payload.phase] += 1
      }

      const latestTurn = agentTurns[agentTurns.length - 1] ?? null
      const latestContribution = latestTurn
        ? agent.contributions.find((item) => item.nodeId === latestTurn.payload.nodeId) ?? agent.latestContribution
        : mode === 'all'
          ? agent.latestContribution
          : null

      const sessionRelatedAgents = mode === 'all'
        ? agent.relatedAgents
        : agent.relatedAgents.filter((item) => activeAgentIds.has(item.agentId))

      const sessionContributionCount = mode === 'all'
        ? agent.contributions.length
        : agentTurns.length

      return {
        ...agent,
        sessionContributionCount,
        sessionLatestContribution: latestContribution,
        sessionRelatedAgents,
        sessionStageCounts
      }
    })
  }, [filteredTurns, mode, snapshot.agents])

  const filteredLinkCount = useMemo(() => {
    if (mode === 'all') return snapshot.linkedAgentPairs
    const pairs = new Set<string>()
    for (const agent of sessionAgentViews) {
      for (const related of agent.sessionRelatedAgents) {
        pairs.add([agent.id, related.agentId].sort().join('::'))
      }
    }
    return pairs.size
  }, [mode, sessionAgentViews, snapshot.linkedAgentPairs])

  const timelineItems = useMemo(() => {
    return filteredEvents
      .map((event) => {
        if (event.type === 'phase.changed') {
          return {
            key: `${event.type}:${event.payload.occurredAt}`,
            label: `阶段切换为 ${event.payload.phase}`,
            detail: event.payload.reason ?? 'system',
            occurredAt: event.payload.occurredAt
          }
        }

        if (event.type === 'seminar.turn.completed') {
          return {
            key: `${event.type}:${event.payload.nodeId}:${event.payload.occurredAt}`,
            label: `${event.payload.agentName} 完成一轮分析`,
            detail: event.payload.title,
            occurredAt: event.payload.occurredAt
          }
        }

        if (event.type === 'seminar.decision.requested') {
          return {
            key: `${event.type}:${event.payload.occurredAt}`,
            label: '等待决策确认',
            detail: event.payload.decision,
            occurredAt: event.payload.occurredAt
          }
        }

        if (event.type === 'seminar.decision.made') {
          return {
            key: `${event.type}:${event.payload.occurredAt}`,
            label: '形成最终决策',
            detail: event.payload.decision,
            occurredAt: event.payload.occurredAt
          }
        }

        return null
      })
      .filter((item): item is { key: string; label: string; detail: string; occurredAt: string } => item !== null)
      .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
  }, [filteredEvents])

  if (snapshot.agents.length === 0) {
    return null
  }

  const runtimePhaseText = filteredPhase
    ? `当前阶段 ${filteredPhase}`
    : runtime.isLoading
      ? '恢复运行历史…'
      : '等待运行事件'

  return (
    <section className={`${TOKENS.surface.panel} p-3`}>
      <button
        type="button"
        onClick={() => setCollapsed((current) => !current)}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-cyan-400/10 text-cyan-300">
            <Bot className="h-3.5 w-3.5" strokeWidth={1.75} />
          </span>
          <div>
            <p className={TOKENS.text.kicker}>Runtime</p>
            <h4 className={TOKENS.text.h2}>Agent Runtime</h4>
            <p className={`mt-0.5 ${TOKENS.text.meta}`}>{runtimePhaseText}</p>
          </div>
        </div>
        {collapsed ? (
          <ChevronDown className="h-3.5 w-3.5 text-slate-400" strokeWidth={1.75} />
        ) : (
          <ChevronUp className="h-3.5 w-3.5 text-slate-400" strokeWidth={1.75} />
        )}
      </button>

      {!collapsed && (
        <>
          {/* 4-up stats */}
          <div className="mt-3 grid grid-cols-4 gap-1.5">
            {[
              { label: 'Agents', value: snapshot.agents.length },
              { label: 'Links', value: filteredLinkCount },
              { label: 'Turns', value: filteredTurns.length },
              { label: 'Round', value: `${roundNumber}/${maxRounds}` }
            ].map((stat) => (
              <div
                key={stat.label}
                className={`${TOKENS.surface.card} px-2 py-1.5`}
              >
                <p className={TOKENS.text.kicker}>{stat.label}</p>
                <p className="mt-0.5 text-[13px] font-semibold tabular-nums text-white">
                  {stat.value}
                </p>
              </div>
            ))}
          </div>

          {/* Session scope */}
          <div className={`mt-3 ${TOKENS.surface.card} space-y-2 p-2.5`}>
            <div className="flex items-center justify-between gap-3">
              <p className={TOKENS.text.kicker}>Session Scope</p>
              <div className="inline-flex items-center gap-0.5 rounded-md border border-white/[0.06] bg-slate-950/50 p-0.5">
                <button
                  type="button"
                  onClick={() => setMode('current')}
                  className={mode === 'current' ? TOKENS.button.segmentActive : TOKENS.button.segmentIdle}
                >
                  当前会话
                </button>
                <button
                  type="button"
                  onClick={() => setMode('all')}
                  className={mode === 'all' ? TOKENS.button.segmentActive : TOKENS.button.segmentIdle}
                >
                  全部历史
                </button>
              </div>
            </div>

            {mode === 'current' && conversations.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {conversations.slice(0, 4).map((conversation) => {
                  const isActive = activeConversationId === conversation.id
                  return (
                    <button
                      key={conversation.id}
                      type="button"
                      onClick={() => setSelectedConversationId(conversation.id)}
                      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-medium transition-colors ${
                        isActive
                          ? 'bg-cyan-400/10 text-cyan-300 ring-1 ring-cyan-300/30'
                          : 'border border-white/[0.06] text-slate-400 hover:border-white/[0.14] hover:text-slate-200'
                      }`}
                    >
                      <span className="tabular-nums">{conversation.id.slice(0, 8)}</span>
                      <span className="text-slate-500">·</span>
                      <span>{conversation.latestPhase ?? 'pending'}</span>
                    </button>
                  )
                })}
              </div>
            )}

            <div className={`flex items-center justify-between gap-3 ${TOKENS.text.meta}`}>
              <span>
                {mode === 'all'
                  ? `覆盖 ${conversations.length} 次会话`
                  : activeConversationId
                    ? `会话 ${activeConversationId.slice(0, 8)}`
                    : '尚无会话记录'}
              </span>
              {filteredDecision && (
                <span className="max-w-[14rem] truncate text-slate-300">
                  决策: {filteredDecision}
                </span>
              )}
            </div>
          </div>

          {/* Timeline */}
          <div className={`mt-3 ${TOKENS.surface.card} p-2.5`}>
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className={TOKENS.text.kicker}>Timeline</p>
              <span className="text-[10px] text-slate-500 tabular-nums">
                {timelineItems.length} steps
              </span>
            </div>

            <div className="space-y-1.5">
              {timelineItems.length > 0 ? (
                timelineItems.slice(-6).map((item, index) => {
                  const slice = timelineItems.slice(-6)
                  return (
                    <div
                      key={item.key}
                      className="flex gap-2.5 rounded-md border border-white/[0.06] bg-slate-950/40 px-2.5 py-1.5"
                    >
                      <div className="flex flex-col items-center">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-cyan-400/10 text-[10px] font-semibold text-cyan-300 tabular-nums">
                          {index + 1}
                        </span>
                        {index < slice.length - 1 && (
                          <span className="mt-0.5 h-3 w-px bg-white/10" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[12px] text-slate-200">{item.label}</p>
                        <p className={`mt-0.5 truncate ${TOKENS.text.meta}`}>{item.detail}</p>
                      </div>
                    </div>
                  )
                })
              ) : (
                <div className="rounded-md border border-dashed border-white/[0.08] px-2.5 py-3 text-[11px] text-slate-500">
                  当前范围内还没有可回放的运行步骤。
                </div>
              )}
            </div>
          </div>

          {/* Per-agent cards */}
          <div className="mt-3 space-y-2">
            {sessionAgentViews.map((agent) => {
              const liveTurns = agent.sessionContributionCount
              return (
                <div key={agent.id} className={`${TOKENS.surface.card} p-2.5`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className={TOKENS.text.h2}>{agent.name}</p>
                      <p className={`mt-0.5 ${TOKENS.text.meta}`}>{agent.role}</p>
                    </div>
                    <span
                      className="shrink-0 rounded-md px-2 py-0.5 text-[10px] font-semibold tabular-nums text-white"
                      style={{ backgroundColor: agent.accent }}
                    >
                      {agent.sessionContributionCount} 条
                    </span>
                  </div>

                  <div className="mt-2 flex flex-wrap gap-1">
                    {[
                      { label: '主域', value: agent.primaryDomain ?? '未标注' },
                      { label: '实时回合', value: liveTurns },
                      { label: '协作', value: agent.sessionRelatedAgents.length }
                    ].map((chip) => (
                      <span
                        key={chip.label}
                        className="inline-flex items-center gap-1 rounded-md border border-white/[0.06] px-1.5 py-0.5 text-[10px] text-slate-400"
                      >
                        <span className="text-slate-500">{chip.label}</span>
                        <span className="font-medium tabular-nums text-slate-200">{chip.value}</span>
                      </span>
                    ))}
                  </div>

                  <div className="mt-2 grid grid-cols-2 gap-1.5">
                    <div className="rounded-md border border-white/[0.06] px-2 py-1.5">
                      <div className="flex items-center gap-1 text-[10px] text-slate-500">
                        <Radar className="h-3 w-3 text-cyan-300" strokeWidth={1.75} />
                        <span>阶段分布</span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-slate-300 tabular-nums">
                        规 {agent.sessionStageCounts.planning} · 执 {agent.sessionStageCounts.execution} · 质 {agent.sessionStageCounts.review} · 决 {agent.sessionStageCounts.decision}
                      </p>
                    </div>
                    <div className="rounded-md border border-white/[0.06] px-2 py-1.5">
                      <div className="flex items-center gap-1 text-[10px] text-slate-500">
                        <Network className="h-3 w-3 text-emerald-300" strokeWidth={1.75} />
                        <span>协作对象</span>
                      </div>
                      <p className="mt-0.5 truncate text-[11px] text-slate-300">
                        {agent.sessionRelatedAgents.length > 0
                          ? agent.sessionRelatedAgents
                              .slice(0, 2)
                              .map((item) => item.agentName)
                              .join(' · ')
                          : '暂无'}
                      </p>
                    </div>
                  </div>

                  {agent.sessionLatestContribution && (
                    <button
                      type="button"
                      onClick={() =>
                        openDetailPanel(agent.sessionLatestContribution!.nodeId)
                      }
                      className={`mt-2 flex w-full items-center justify-between gap-2.5 ${TOKENS.surface.card} px-2.5 py-1.5 text-left`}
                    >
                      <div className="min-w-0">
                        <p className={TOKENS.text.kicker}>最新产出</p>
                        <p className={`mt-0.5 ${TOKENS.text.h2} truncate`}>
                          {agent.sessionLatestContribution.title}
                        </p>
                      </div>
                      <Sparkles
                        className="h-3.5 w-3.5 shrink-0 text-cyan-300"
                        strokeWidth={1.75}
                      />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </section>
  )
}

function getEventOccurredAt(event: ConversationRuntimeEvent) {
  return event.payload.occurredAt
}
