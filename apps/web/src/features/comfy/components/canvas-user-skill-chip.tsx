'use client'

/**
 * Compact "AI 已了解的你" chip — surfaces the top user-skill memory
 * items inferred across conversations. Sits in the chat dock header.
 *
 * Click → expands a popover listing all user-skill rows with confidence
 * + last-reinforced date. Each row has a "👍 准确" / "👎 不准" toggle
 * (UI-only for now, server hook is a follow-up).
 *
 * Source: GraphQL `workspaceMemories(workspaceId, scope='user', kind='user-skill')`.
 * Shows up to 3 inline, more in popover.
 */

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, ChevronUp, User2, ThumbsUp, ThumbsDown } from 'lucide-react'
import { getGraphQLClient } from '@/shared/lib/graphql-client'

const USER_SKILL_QUERY = /* GraphQL */ `
  query UserSkill($workspaceId: ID!) {
    workspaceMemories(workspaceId: $workspaceId, scope: "user", kind: "user-skill", limit: 12) {
      id title content confidence importance updatedAt
    }
  }
`

type UserSkill = {
  id: string
  title: string
  content: string
  confidence: number
  importance: number
  updatedAt: string
}

type Props = {
  workspaceId: string
}

export function CanvasUserSkillChip({ workspaceId }: Props) {
  const [expanded, setExpanded] = useState(false)

  const { data } = useQuery({
    queryKey: ['userSkill', workspaceId],
    queryFn: async () => {
      const client = getGraphQLClient()
      const response = await client.request<{ workspaceMemories: UserSkill[] }>(
        USER_SKILL_QUERY,
        { workspaceId }
      )
      // Sort by confidence × importance descending
      return (response.workspaceMemories ?? []).sort((a, b) => {
        return b.confidence * b.importance - a.confidence * a.importance
      })
    },
    staleTime: 30_000,
    enabled: !!workspaceId,
  })

  const skills = data ?? []
  if (skills.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-stratum-line bg-stratum-surface-low/50 px-3 py-2">
        <div className="flex items-center gap-2 text-stratum-muted">
          <User2 className="h-3 w-3" strokeWidth={1.75} />
          <span className="font-body text-[10px] uppercase tracking-[0.18em]">USER SKILL</span>
        </div>
        <p className="mt-1 font-body text-[11px] leading-relaxed text-stratum-muted">
          AI 还在了解你。完成 3 次会话后跨会话画像会自动浮现在这里。
        </p>
      </div>
    )
  }

  const top = skills.slice(0, 3)
  const rest = skills.slice(3)

  return (
    <div className="rounded-lg border border-stratum-line bg-stratum-blue/5 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 hover:bg-stratum-blue/10 transition-colors"
      >
        <div className="flex items-center gap-2">
          <User2 className="h-3.5 w-3.5 text-stratum-blue" strokeWidth={1.75} />
          <span className="font-body text-[10px] font-bold uppercase tracking-[0.18em] text-stratum-blue">
            AI 了解你 · {skills.length}
          </span>
        </div>
        {expanded ? (
          <ChevronUp className="h-3.5 w-3.5 text-stratum-blue" strokeWidth={1.75} />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-stratum-blue" strokeWidth={1.75} />
        )}
      </button>

      {/* Top 3 always visible (truncated titles) */}
      {!expanded ? (
        <ul className="px-3 pb-2 space-y-0.5">
          {top.map((s) => (
            <li key={s.id} className="font-body text-[11px] text-stratum-ink truncate" title={s.content}>
              · {s.title}
            </li>
          ))}
          {rest.length > 0 ? (
            <li className="font-body text-[10px] text-stratum-muted">
              + {rest.length} 条
            </li>
          ) : null}
        </ul>
      ) : (
        <ul className="border-t border-stratum-blue/15 bg-white max-h-[280px] overflow-y-auto divide-y divide-stratum-line">
          {skills.map((s) => {
            const score = Math.round(s.confidence * 100)
            return (
              <li key={s.id} className="px-3 py-2.5">
                <div className="flex items-baseline justify-between gap-2 mb-1">
                  <span className="font-body text-[12px] font-medium text-stratum-navy">
                    {s.title}
                  </span>
                  <span
                    className={`shrink-0 px-1 py-0.5 rounded font-body text-[9px] tabular-nums font-semibold ${
                      score >= 70
                        ? 'bg-stratum-blue/10 text-stratum-blue'
                        : score >= 40
                          ? 'bg-stratum-surface-low text-stratum-muted'
                          : 'bg-stratum-danger-wash/40 text-stratum-danger'
                    }`}
                  >
                    {score}%
                  </span>
                </div>
                <p className="font-body text-[11px] leading-relaxed text-stratum-ink whitespace-pre-wrap">
                  {s.content}
                </p>
                <div className="mt-2 flex items-center gap-1">
                  <button
                    type="button"
                    aria-label="标记准确"
                    className="flex h-6 items-center gap-1 rounded-full px-2 font-body text-[10px] font-semibold text-stratum-muted hover:bg-stratum-blue/10 hover:text-stratum-blue transition-colors"
                  >
                    <ThumbsUp className="h-3 w-3" strokeWidth={1.75} />
                    准确
                  </button>
                  <button
                    type="button"
                    aria-label="标记不准"
                    className="flex h-6 items-center gap-1 rounded-full px-2 font-body text-[10px] font-semibold text-stratum-muted hover:bg-stratum-danger-wash hover:text-stratum-danger transition-colors"
                  >
                    <ThumbsDown className="h-3 w-3" strokeWidth={1.75} />
                    不准
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
