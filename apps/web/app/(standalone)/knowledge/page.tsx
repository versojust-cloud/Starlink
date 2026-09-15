'use client'

/**
 * /knowledge — KB management entry point (Mode B center).
 *
 * Lists all KBs across workspaces (currently scoped to proj-001), shows
 * source counts + status + last-ingest, and lets the user upload more
 * via the shared KbUploadModal. Click a KB → opens canvas with that KB
 * pre-selected for BMC generation.
 */

import { useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Database, Plus, Sparkles } from 'lucide-react'
import { getGraphQLClient } from '@/shared/lib/graphql-client'
import { KbUploadModal } from '@/features/comfy/components/kb-upload-modal'

const DEFAULT_WORKSPACE_ID = 'proj-001'

const KB_LIST = /* GraphQL */ `
  query KbList($workspaceId: ID!) {
    knowledgeBases(workspaceId: $workspaceId) {
      id workspaceId name description status sourceCount lastIngestAt
    }
  }
`

type KnowledgeBase = {
  id: string
  workspaceId: string
  name: string
  description: string | null
  status: string
  sourceCount: number
  lastIngestAt: string | null
}

export default function KnowledgeRoute() {
  const [modalOpen, setModalOpen] = useState(false)

  const { data: kbs, isLoading } = useQuery({
    queryKey: ['kbList', DEFAULT_WORKSPACE_ID],
    queryFn: async () => {
      const client = getGraphQLClient()
      const r = await client.request<{ knowledgeBases: KnowledgeBase[] }>(KB_LIST, {
        workspaceId: DEFAULT_WORKSPACE_ID,
      })
      return r.knowledgeBases ?? []
    },
    staleTime: 10_000,
  })

  return (
    <div className="min-h-screen bg-stratum-surface">
      {/* Header */}
      <header className="bg-white border-b border-stratum-line">
        <div className="max-w-[1080px] mx-auto px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/chat"
              className="flex items-center gap-1.5 text-stratum-muted hover:text-stratum-navy transition-colors"
            >
              <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
              <span className="font-body text-[12px] font-medium">回主页</span>
            </Link>
          </div>
          <div className="text-right">
            <p className="font-body text-[10px] font-semibold uppercase tracking-[0.18em] text-stratum-blue">
              KNOWLEDGE BASE · 资料管理
            </p>
            <h1 className="mt-0.5 font-display font-[700] text-[18px] tracking-tight text-stratum-navy">
              知识库中心
            </h1>
          </div>
        </div>
      </header>

      <main className="max-w-[1080px] mx-auto px-8 py-10">
        <div className="flex items-end justify-between mb-6">
          <div>
            <p className="font-body text-[10px] font-semibold uppercase tracking-[0.18em] text-stratum-muted">
              WORKSPACE · {DEFAULT_WORKSPACE_ID}
            </p>
            <h2 className="mt-1 font-display font-[700] text-[32px] tracking-tight text-stratum-navy">
              已有 {kbs?.length ?? 0} 个知识库
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-full bg-stratum-navy px-4 py-2.5 font-body text-[12px] font-bold text-white hover:bg-stratum-navy-soft transition-colors"
          >
            <Plus className="h-4 w-4" strokeWidth={2} />
            新建 / 添加资料
          </button>
        </div>

        {isLoading ? (
          <div className="rounded-2xl border border-stratum-line bg-white px-6 py-8 text-center">
            <Database className="h-6 w-6 text-stratum-blue/40 animate-pulse mx-auto mb-2" strokeWidth={1.5} />
            <p className="font-body text-[12px] text-stratum-muted">载入知识库列表…</p>
          </div>
        ) : (kbs ?? []).length === 0 ? (
          <div className="rounded-2xl border border-dashed border-stratum-line bg-white px-6 py-12 text-center">
            <Database className="h-8 w-8 text-stratum-blue/40 mx-auto mb-3" strokeWidth={1.5} />
            <p className="font-display font-[700] text-[16px] text-stratum-navy mb-1">
              还没有知识库
            </p>
            <p className="font-body text-[12px] text-stratum-muted mb-4">
              上传访谈纪录 / 竞品文档 / 市场报告片段 → AI 用 RAG 抽取要点 → 生成带证据的 BMC
            </p>
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-full bg-stratum-navy px-4 py-2 font-body text-[12px] font-bold text-white hover:bg-stratum-navy-soft transition-colors"
            >
              <Plus className="h-4 w-4" strokeWidth={2} />
              开始上传
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {kbs!.map((kb) => (
              <article
                key={kb.id}
                className="group rounded-2xl border border-stratum-line bg-white p-5 shadow-sm transition-all hover:border-stratum-blue/40 hover:shadow-md hover:-translate-y-0.5"
              >
                <header className="flex items-start gap-3 mb-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-stratum-blue/10">
                    <Database className="h-4 w-4 text-stratum-blue" strokeWidth={1.75} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-display font-[700] text-[15px] tracking-tight text-stratum-navy truncate">
                      {kb.name || `KB ${kb.id.slice(0, 8)}`}
                    </h3>
                    <p className="font-body text-[10px] tabular-nums text-stratum-muted mt-0.5">
                      {kb.id.slice(0, 8)}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 px-2 py-0.5 rounded-full font-body text-[9px] font-bold uppercase tracking-[0.18em] ${
                      kb.status === 'published'
                        ? 'bg-stratum-ok-wash text-stratum-ok'
                        : 'bg-stratum-surface-low text-stratum-muted'
                    }`}
                  >
                    {kb.status}
                  </span>
                </header>
                {kb.description ? (
                  <p className="font-body text-[12px] leading-relaxed text-stratum-muted line-clamp-2 mb-3">
                    {kb.description}
                  </p>
                ) : null}
                <div className="flex items-center justify-between text-stratum-muted">
                  <span className="font-body text-[11px] tabular-nums">
                    {kb.sourceCount} 个资料源
                  </span>
                  <Link
                    href={`/canvas/${encodeURIComponent(kb.workspaceId)}?kb=${encodeURIComponent(kb.id)}`}
                    className="inline-flex items-center gap-1 font-body text-[11px] font-semibold text-stratum-blue group-hover:text-stratum-navy transition-colors"
                  >
                    <Sparkles className="h-3 w-3" strokeWidth={2} fill="#89CEFF" />
                    生成 BMC →
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>

      <KbUploadModal
        open={modalOpen}
        workspaceId={DEFAULT_WORKSPACE_ID}
        onClose={() => setModalOpen(false)}
      />
    </div>
  )
}
