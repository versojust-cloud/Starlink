'use client'

/**
 * Memory list — renders MemoryItem[] grouped by `kind` using the
 * memory-kind-registry. Pluggable: register new kinds and they appear
 * automatically grouped + iconned + sorted.
 *
 * Source: GraphQL `workspaceMemories(workspaceId, scope?)` query.
 * Renders compact cards. Click → expand for full content (future:
 * edit / archive / reinforce confidence).
 */

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getGraphQLClient } from '@/shared/lib/graphql-client'
import { Brain, ChevronDown, ChevronRight } from 'lucide-react'
import { getMemoryKindDescriptor } from '../registries/memory-kind-registry'

const WORKSPACE_MEMORIES_QUERY = /* GraphQL */ `
  query WorkspaceMemories($workspaceId: ID!, $scope: String, $kind: String, $limit: Int) {
    workspaceMemories(workspaceId: $workspaceId, scope: $scope, kind: $kind, limit: $limit) {
      id workspaceId scope kind title content importance confidence tags
      createdAt updatedAt lastUsedAt
    }
  }
`

type MemoryItem = {
  id: string
  workspaceId: string
  scope: string
  kind: string
  title: string
  content: string
  importance: number
  confidence: number
  tags: string[]
  createdAt: string
  updatedAt: string
  lastUsedAt?: string
}

type Props = {
  workspaceId: string
}

export function CanvasMemoryList({ workspaceId }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['workspaceMemories', workspaceId],
    queryFn: async () => {
      const client = getGraphQLClient()
      const response = await client.request<{ workspaceMemories: MemoryItem[] }>(
        WORKSPACE_MEMORIES_QUERY,
        { workspaceId, limit: 50 }
      )
      return response.workspaceMemories ?? []
    },
    staleTime: 10_000,
    enabled: !!workspaceId,
  })

  const grouped = useMemo(() => {
    const items = data ?? []
    const map = new Map<string, MemoryItem[]>()
    for (const item of items) {
      const list = map.get(item.kind) ?? []
      list.push(item)
      map.set(item.kind, list)
    }
    // Sort each group by importance × confidence × recency
    map.forEach((list) => {
      list.sort((a, b) => {
        const aScore = a.importance * a.confidence
        const bScore = b.importance * b.confidence
        if (Math.abs(aScore - bScore) > 0.05) return bScore - aScore
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      })
    })
    // Order kind groups by registry sortOrder
    return Array.from(map.entries())
      .map(([kind, list]) => ({ kind, descriptor: getMemoryKindDescriptor(kind), items: list }))
      .sort((a, b) => a.descriptor.sortOrder - b.descriptor.sortOrder)
  }, [data])

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-3 py-4 text-stratum-muted">
        <Brain className="h-3.5 w-3.5 animate-pulse" strokeWidth={1.75} />
        <span className="font-body text-[12px]">载入记忆中…</span>
      </div>
    )
  }

  if (grouped.length === 0) {
    return (
      <div className="px-3 py-6 text-center">
        <Brain className="h-6 w-6 text-stratum-blue/40 mx-auto mb-2" strokeWidth={1.5} />
        <p className="font-body text-[12px] leading-relaxed text-stratum-muted">
          AI 还没积累任何记忆。完成一次会话后，决策 / 洞察 / 约束会自动归档到这里。
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {grouped.map(({ kind, descriptor, items }) => {
        const Icon = descriptor.icon
        return (
          <section key={kind}>
            <header className="flex items-center gap-2 mb-2 px-1">
              <Icon className={`h-3.5 w-3.5 ${descriptor.tintClass}`} strokeWidth={1.75} />
              <span className="font-body text-[10px] font-bold uppercase tracking-[0.18em] text-stratum-muted">
                {descriptor.label}
              </span>
              <span className="ml-auto font-body text-[10px] tabular-nums text-stratum-muted">
                {items.length}
              </span>
            </header>
            <ul className="space-y-1.5">
              {items.map((item) => {
                const isOpen = expandedId === item.id
                const score = Math.round(item.confidence * 100)
                return (
                  <li
                    key={item.id}
                    className="rounded-lg border border-stratum-line bg-stratum-surface-low overflow-hidden"
                  >
                    <button
                      type="button"
                      onClick={() => setExpandedId(isOpen ? null : item.id)}
                      className="w-full text-left px-3 py-2 flex items-start gap-2 hover:bg-white transition-colors"
                    >
                      {isOpen ? (
                        <ChevronDown className="mt-0.5 h-3 w-3 shrink-0 text-stratum-muted" strokeWidth={1.75} />
                      ) : (
                        <ChevronRight className="mt-0.5 h-3 w-3 shrink-0 text-stratum-muted" strokeWidth={1.75} />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-body text-[12px] font-medium text-stratum-navy truncate">
                          {item.title}
                        </p>
                        {!isOpen && (
                          <p className="mt-0.5 font-body text-[11px] text-stratum-muted line-clamp-1">
                            {item.content}
                          </p>
                        )}
                      </div>
                      <span
                        className={`shrink-0 px-1.5 py-0.5 rounded font-body text-[9px] tabular-nums font-semibold ${
                          score >= 70
                            ? 'bg-stratum-blue/10 text-stratum-blue'
                            : score >= 40
                              ? 'bg-stratum-surface-low text-stratum-muted'
                              : 'bg-stratum-danger-wash/40 text-stratum-danger'
                        }`}
                        title="confidence"
                      >
                        {score}%
                      </span>
                    </button>
                    {isOpen ? (
                      <div className="border-t border-stratum-line bg-white px-3 py-2.5">
                        <p className="font-body text-[12px] leading-[1.6] text-stratum-ink whitespace-pre-wrap">
                          {item.content}
                        </p>
                        {item.tags.length > 0 ? (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {item.tags.map((tag) => (
                              <span
                                key={tag}
                                className="px-1.5 py-0.5 rounded font-body text-[10px] bg-stratum-surface-low text-stratum-muted"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        ) : null}
                        <p className="mt-2 font-body text-[10px] tabular-nums text-stratum-muted">
                          scope = <span className="font-mono text-stratum-navy">{item.scope}</span> ·
                          {' '}importance = {item.importance.toFixed(2)} ·
                          {' '}更新于 {new Date(item.updatedAt).toLocaleDateString('zh-CN')}
                        </p>
                      </div>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
