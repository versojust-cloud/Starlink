'use client'

/**
 * EvidenceDrawer — Editorial Boardroom v2 (2026-05-02).
 *
 * Right-side drawer that opens when the user clicks a citation badge
 * `[N]` on a BMC card. Shows the original snippet text + reverse
 * lookup (which OTHER cards reference this same evidence).
 *
 * v1 was sky-blue glass: rounded-28px container, sky-300 borders,
 * backdrop-blur-xl, blue-tinted gradient CTA with rgba(56,189,248,0.25)
 * shadow halo. v2 is brutalist 1.5px paper border on ink-ash1, mono
 * kicker labels, paper-on-ink primary CTA. No glass, no glow.
 *
 * Functional surface unchanged: useQuery cardsReferencingEvidence,
 * highlightCards, clearHighlight — all wiring preserved.
 */

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getGraphQLClient } from '@/shared/lib/graphql-client'
import { FileText, Target, X } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { useComfyStore } from '../store'

const CARDS_REFERENCING_QUERY = /* GraphQL */ `
  query CardsReferencingEvidence($conversationId: ID!, $evidenceId: ID!) {
    cardsReferencingEvidence(conversationId: $conversationId, evidenceId: $evidenceId)
  }
`

// P12 · lookup the original chunk content when the local
// knowledgeEvidence store doesn't have it (typical case: user
// clicks a citation in a cell that was generated in a previous
// session and the streaming context is gone).
const KB_CHUNK_LOOKUP_QUERY = /* GraphQL */ `
  query KbChunkLookup($workspaceId: ID!, $docId: ID!, $chunkIndex: Int) {
    kbChunkLookup(workspaceId: $workspaceId, docId: $docId, chunkIndex: $chunkIndex) {
      docId
      chunkIndex
      content
      docTitle
      kbId
      kbName
    }
  }
`

type EvidenceDrawerProps = {
  conversationId?: string | null
  className?: string
}

export function EvidenceDrawer({ conversationId, className }: EvidenceDrawerProps = {}) {
  const drawer = useComfyStore((state) => state.evidenceDrawer)
  const storeConversationId = useComfyStore((state) => state.currentConversationId)
  const effectiveConversationId = conversationId ?? storeConversationId
  const knowledgeEvidence = useComfyStore((state) => state.knowledgeEvidence)
  const closeDrawer = useComfyStore((state) => state.closeEvidenceDrawer)
  const highlightCards = useComfyStore((state) => state.highlightCardsReferencingEvidence)
  const clearHighlight = useComfyStore((state) => state.clearCitationHighlight)

  const evidence = useMemo(() => {
    if (!drawer.focusedEvidenceId) return null
    return (
      knowledgeEvidence.find((e) => {
        const record = e as { id?: string; docId?: string }
        return record.id === drawer.focusedEvidenceId || record.docId === drawer.focusedEvidenceId
      }) ?? null
    )
  }, [knowledgeEvidence, drawer.focusedEvidenceId])

  // P12 · parse focusedEvidenceId into (docId, chunkIndex). The
  // citation token format is `docId#chunk-N` (or just `docId` for
  // legacy entries). We need both fields for the kbChunkLookup
  // server query when the local knowledgeEvidence store didn't
  // have a hit.
  const workspaceId = useComfyStore((s) => s.workspaceId)
  const { lookupDocId, lookupChunkIndex } = useMemo(() => {
    const raw = drawer.focusedEvidenceId ?? ''
    const hashIdx = raw.indexOf('#')
    if (hashIdx < 0) return { lookupDocId: raw, lookupChunkIndex: 0 }
    const docPart = raw.slice(0, hashIdx)
    const snippetPart = raw.slice(hashIdx + 1)
    // snippetIds typically look like "chunk-3" or "0-3"; pull the
    // last integer in the string.
    const m = snippetPart.match(/(\d+)(?!.*\d)/)
    const idx = m ? Number(m[1]) : 0
    return { lookupDocId: docPart, lookupChunkIndex: Number.isFinite(idx) ? idx : 0 }
  }, [drawer.focusedEvidenceId])

  // Server-side fallback: if the local store doesn't have the
  // chunk content, fetch from kb_chunks via GraphQL.
  const { data: serverChunk } = useQuery({
    queryKey: ['kbChunkLookup', workspaceId, lookupDocId, lookupChunkIndex],
    enabled:
      drawer.isOpen &&
      !!workspaceId &&
      !!lookupDocId &&
      !evidence,  // skip server hop when local hit
    staleTime: 60_000,
    queryFn: async () => {
      const client = getGraphQLClient()
      const response = await client.request<{
        kbChunkLookup: {
          docId: string
          chunkIndex: number
          content: string
          docTitle: string | null
          kbId: string
          kbName: string | null
        } | null
      }>(KB_CHUNK_LOOKUP_QUERY, {
        workspaceId,
        docId: lookupDocId,
        chunkIndex: lookupChunkIndex
      })
      return response.kbChunkLookup
    }
  })

  const { data: referencingCardIds, isLoading } = useQuery({
    queryKey: ['cardsReferencingEvidence', effectiveConversationId, drawer.focusedEvidenceId],
    enabled:
      drawer.isOpen &&
      !!effectiveConversationId &&
      !!drawer.focusedEvidenceId,
    staleTime: 5000,
    queryFn: async () => {
      if (!effectiveConversationId || !drawer.focusedEvidenceId) return [] as string[]
      const client = getGraphQLClient()
      const response = await client.request<{ cardsReferencingEvidence: string[] }>(
        CARDS_REFERENCING_QUERY,
        { conversationId: effectiveConversationId, evidenceId: drawer.focusedEvidenceId }
      )
      return response.cardsReferencingEvidence ?? []
    }
  })

  if (!drawer.isOpen) return null

  // Coalesce local-store evidence + server-fetched chunk. Local
  // store wins when present (has the score for ranking context).
  const docId = (evidence as { docId?: string } | null)?.docId
    ?? serverChunk?.docId
    ?? lookupDocId
    ?? ''
  const snippetText = (evidence as { snippet?: string } | null)?.snippet
    ?? serverChunk?.content
    ?? ''
  const score = (evidence as { score?: number } | null)?.score
  const metadata = (evidence as { metadata?: Record<string, unknown> } | null)?.metadata
  const title = (metadata?.title as string | undefined)
    ?? serverChunk?.docTitle
    ?? docId
  const kbName = serverChunk?.kbName ?? null
  const snippetId = (metadata?.snippetId as string | undefined)
    ?? (serverChunk ? `chunk-${serverChunk.chunkIndex}` : '')
  const referenceCount = referencingCardIds?.length ?? 0

  const handleLocateCards = () => {
    if (referencingCardIds && referencingCardIds.length > 0) {
      highlightCards(referencingCardIds)
    }
  }

  return (
    <aside
      className={cn(
        'fixed right-4 top-20 bottom-8 z-40 w-[min(420px,calc(100vw-2rem))]',
        'bg-white border-[1.5px] border-stratum-line',
        'flex flex-col overflow-hidden animate-editorial-publish',
        className
      )}
      role="dialog"
      aria-modal="false"
      aria-label="Evidence detail"
    >
      {/* Header — kicker EVIDENCE + Fraunces 标题 + close */}
      <header className="flex items-start justify-between border-b-[1px] border-stratum-line px-5 py-4 shrink-0">
        <div className="flex items-baseline gap-3 min-w-0">
          <FileText className="h-3.5 w-3.5 text-stratum-muted shrink-0 self-center" strokeWidth={1.5} />
          <div className="min-w-0">
            <p className="font-instr text-[10px] uppercase tracking-kicker text-stratum-muted">
              EVIDENCE · 证据来源
            </p>
            <h3
              className="mt-1 font-display font-[700] text-[15px] tracking-[0.02em] text-stratum-navy truncate"
              title={title}
            >
              {title}
            </h3>
            <p className="mt-1 font-instr text-[10px] tabular-nums text-stratum-muted">
              <span className="text-stratum-muted">DOC</span> {docId}
              {snippetId ? (
                <>
                  {' · '}
                  <span className="text-stratum-muted">CHUNK</span> {snippetId}
                </>
              ) : null}
              {typeof score === 'number' ? (
                <>
                  {' · '}
                  <span className="text-stratum-muted">REL</span> {score.toFixed(2)}
                </>
              ) : null}
              {kbName ? (
                <>
                  {' · '}
                  <span className="text-stratum-muted">KB</span> {kbName}
                </>
              ) : null}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            clearHighlight()
            closeDrawer()
          }}
          className="shrink-0 p-1.5 border-[0.5px] border-stratum-line text-stratum-muted hover:border-stratum-blue/40 hover:text-stratum-navy transition-colors"
          aria-label="关闭"
        >
          <X className="h-3.5 w-3.5" strokeWidth={1.5} />
        </button>
      </header>

      {/* Body */}
      <section className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        {/* Snippet */}
        <div>
          <p className="font-instr text-[10px] uppercase tracking-kicker text-stratum-muted mb-2">
            原文片段 · ORIGINAL SNIPPET
          </p>
          <div className="border-[0.5px] border-stratum-line bg-stratum-surface-low px-4 py-3 font-body text-[13px] leading-[1.6] text-stratum-ink max-w-measure-body">
            {snippetText || (
              <span className="font-instr text-[10px] uppercase tracking-kicker text-stratum-muted">
                — 该 evidence 原文在当前会话中不可见 —
              </span>
            )}
          </div>
        </div>

        {/* Reverse lookup — which BMC cards reference this evidence */}
        <div>
          <p className="font-instr text-[10px] uppercase tracking-kicker text-stratum-muted mb-2">
            反向查询 · CARDS CITING THIS
          </p>
          <div className="border-[0.5px] border-stratum-line bg-stratum-surface-low px-4 py-3 font-instr text-[11px] uppercase tracking-kicker">
            {isLoading ? (
              <span className="text-stratum-muted">查询中...</span>
            ) : referenceCount > 0 ? (
              <span className="text-stratum-navy">
                <span className="tabular-nums text-stratum-danger">{referenceCount}</span>{' '}
                <span className="text-stratum-muted">张卡片引用此证据</span>
              </span>
            ) : (
              <span className="text-stratum-muted">尚未发现引用此证据的卡片</span>
            )}
          </div>
        </div>
      </section>

      {/* Footer — primary CTA paper-on-ink */}
      <footer className="border-t-[1px] border-stratum-line px-5 py-4 shrink-0">
        <button
          type="button"
          onClick={handleLocateCards}
          disabled={!referencingCardIds || referencingCardIds.length === 0}
          className={cn(
            'flex w-full items-center justify-center gap-2',
            'bg-stratum-navy text-white px-4 py-2',
            'font-instr text-[10px] uppercase tracking-kicker',
            'hover:bg-stratum-navy-soft transition-colors',
            'disabled:opacity-30 disabled:cursor-not-allowed disabled:bg-stratum-surface-low disabled:text-stratum-muted'
          )}
        >
          <Target className="h-3.5 w-3.5" strokeWidth={1.75} />
          定位相关卡片
          {drawer.highlightedCardIds.length > 0 ? (
            <span className="text-stratum-danger tabular-nums">· 已高亮</span>
          ) : null}
        </button>
      </footer>
    </aside>
  )
}
