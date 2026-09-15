'use client'

/**
 * ChatHomePage — entry point. Single big input box.
 *
 * Submitting an idea creates a new conversation in localStorage and
 * navigates to /canvas/<conversationId>?seed=<text>. The canvas page
 * reads the seed and fires AI Synthesis automatically.
 *
 * Past conversations show in the left rail; clicking one navigates to
 * its canvas (no seed re-fire — canvas restores from persistence).
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Database, ListChecks, Send, Sparkles } from 'lucide-react'
import { ConversationRail } from './conversation-rail'
import { KbUploadModal } from '../../comfy/components/kb-upload-modal'
import {
  type ConversationBucket,
  type ConversationSnapshot,
  type StoredChatMessage,
  createConversation,
  deriveTitleFromMessages,
  loadBucket,
  saveBucket,
} from '../../comfy/store/conversations-persistence'

const DEFAULT_WORKSPACE_ID = 'proj-001'

const HOMEPAGE_BUCKET_ID = '__home__'

const STARTERS: string[] = [
  '面向 B2B SaaS 的实时数据可视化产品，按用户席位月费',
  '独立硬件 indie hacker 的便携性桌面机器人',
  '面向 Z 世代女性的内容订阅 + 周边电商',
  '校园周边水果茶现做现卖加盟连锁',
]

const fmtTime = (): string =>
  new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })

export function ChatHomePage() {
  // Conversation bucket on the homepage is its own scope so all
  // conversations across workspaces show in one list.
  const [bucket, setBucket] = useState<ConversationBucket | null>(null)
  const [input, setInput] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [kbModalOpen, setKbModalOpen] = useState(false)

  useEffect(() => {
    setBucket(loadBucket(HOMEPAGE_BUCKET_ID))
  }, [])

  useEffect(() => {
    if (bucket) saveBucket(HOMEPAGE_BUCKET_ID, bucket)
  }, [bucket])

  const handleCreate = useCallback(() => {
    setBucket((prev) => {
      if (!prev) return prev
      const fresh = createConversation('未命名会话')
      return {
        conversations: [fresh, ...prev.conversations],
        activeId: fresh.id,
      }
    })
  }, [])

  const handleRename = useCallback((id: string, title: string) => {
    setBucket((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        conversations: prev.conversations.map((c) =>
          c.id === id ? { ...c, title, updatedAt: new Date().toISOString() } : c
        ),
      }
    })
  }, [])

  const handleDelete = useCallback((id: string) => {
    setBucket((prev) => {
      if (!prev) return prev
      const remaining = prev.conversations.filter((c) => c.id !== id)
      if (remaining.length === 0) {
        const seed = createConversation('当前会话')
        return { conversations: [seed], activeId: seed.id }
      }
      const nextActive = prev.activeId === id ? remaining[0].id : prev.activeId
      return { conversations: remaining, activeId: nextActive }
    })
  }, [])

  const handleSelect = useCallback((id: string) => {
    // Navigate to the conversation's canvas (no seed, canvas restores state).
    if (typeof window !== 'undefined') {
      window.location.href = `/canvas/${encodeURIComponent(id)}`
    }
  }, [])

  const handleSubmit = useCallback(() => {
    const trimmed = input.trim()
    if (!trimmed || !bucket || submitting) return

    setSubmitting(true)
    setSubmitError(null)

    // Two-phase flow: phase 1 is Socratic exploration on canvas, server
    // agent pipeline isn't fired yet. We save the seed as a "pending"
    // marker that /canvas reads on mount to: (a) auto-open chat dock,
    // (b) fire one Socratic reflection on the seed, (c) pre-fill the
    // AI Synthesis prompt dialog so user can graduate to BMC generation
    // after a few turns of questioning.
    const seedMsg: StoredChatMessage = {
      role: 'user',
      content: trimmed,
      timestamp: fmtTime(),
    }
    const fresh: ConversationSnapshot = createConversation('未命名会话')
    fresh.messages = [...fresh.messages, seedMsg]
    fresh.title = deriveTitleFromMessages(fresh.messages)
    fresh.updatedAt = new Date().toISOString()

    const nextBucket: ConversationBucket = {
      conversations: [fresh, ...bucket.conversations],
      activeId: fresh.id,
    }
    setBucket(nextBucket)
    saveBucket(HOMEPAGE_BUCKET_ID, nextBucket)

    if (typeof window !== 'undefined') {
      // Stash the seed in sessionStorage; canvas mount picks it up.
      // sessionStorage (not localStorage) so refresh on /canvas without
      // a stashed seed = stale conversation, not infinite re-fire.
      window.sessionStorage.setItem('starlink_pending_seed', trimmed)
      // Navigate to the NEW conversation's canvas (not the default
      // workspace) so each submit gets its own isolated canvas state.
      // Previously hard-coded to DEFAULT_WORKSPACE_ID → every submit
      // overwrote proj-001's canvas.
      window.location.href = `/canvas/${encodeURIComponent(fresh.id)}`
    }
  }, [input, bucket, submitting])

  const handleKey = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault()
        void handleSubmit()
      }
    },
    [handleSubmit]
  )

  const recentCount = useMemo(() => bucket?.conversations.length ?? 0, [bucket])

  if (!bucket) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-stratum-surface">
        <p className="font-body text-[13px] text-stratum-muted">载入会话中…</p>
      </div>
    )
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-stratum-surface">
      <ConversationRail
        conversations={bucket.conversations}
        activeId={bucket.activeId}
        workspaceId="proj-001"
        onCreate={handleCreate}
        onSelect={handleSelect}
        onRename={handleRename}
        onDelete={handleDelete}
      />
      <main className="flex flex-1 flex-col overflow-y-auto">
        {/* Top kicker bar */}
        <header className="flex items-center justify-between gap-4 px-8 py-4 border-b border-stratum-line bg-white/60 backdrop-blur">
          <div>
            <p className="font-body text-[10px] font-semibold uppercase tracking-[0.18em] text-stratum-blue">
              STRATEGY ENGINE · 入口
            </p>
            <h1 className="mt-0.5 font-display font-[700] text-[18px] tracking-tight text-stratum-navy">
              新对话 → 直接进入画布
            </h1>
          </div>
          <div className="hidden sm:flex items-center gap-2 bg-stratum-surface-low border border-stratum-line rounded-full px-3 py-1.5">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-stratum-ok" />
            <span className="font-body text-[10px] font-semibold uppercase tracking-[0.18em] text-stratum-muted">
              CONVERSATIONS
            </span>
            <span className="font-body text-[11px] tabular-nums font-medium text-stratum-navy">
              {recentCount}
            </span>
          </div>
        </header>

        {/* Hero — big input */}
        <div className="flex flex-1 flex-col items-center justify-center px-8 py-12">
          <div className="w-full max-w-[760px]">
            <div className="mb-8 flex flex-col items-center text-center">
              <span
                aria-hidden="true"
                className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-stratum-navy text-white text-[32px] leading-none shadow-lg"
              >
                ◇
              </span>
              <h2 className="font-display font-[700] text-[36px] leading-[1.1] tracking-tight text-stratum-navy mb-3">
                你想推演哪个商业 idea？
              </h2>
              <p className="font-body text-[14px] leading-relaxed text-stratum-muted max-w-[520px]">
                用一句话描述，按 Enter 后 8 个 agent 会进入画布协作生成 BMC，并通过苏格拉底式反问帮你拆解 9 个维度。
              </p>
            </div>

            <div className="rounded-2xl border border-stratum-line bg-white shadow-md focus-within:border-stratum-blue focus-within:shadow-lg focus-within:ring-4 focus-within:ring-stratum-blue/15 transition-all">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder="例如：面向 B2B SaaS 的实时数据可视化产品，按用户席位月费 + 大额企业版订阅"
                rows={3}
                className="w-full resize-none rounded-t-2xl bg-transparent px-5 pt-5 pb-2 font-body text-[15px] leading-[1.6] text-stratum-navy placeholder:text-stratum-muted outline-none"
                style={{ minHeight: '96px', maxHeight: '240px' }}
              />
              <div className="flex items-center justify-between px-5 py-3 border-t border-stratum-line">
                <p className="font-body text-[11px] text-stratum-muted">
                  <kbd className="rounded border border-stratum-line bg-stratum-surface-low px-1.5 py-0.5 font-instr text-[10px]">Enter</kbd> 提交 ·{' '}
                  <kbd className="rounded border border-stratum-line bg-stratum-surface-low px-1.5 py-0.5 font-instr text-[10px]">Shift</kbd>+
                  <kbd className="rounded border border-stratum-line bg-stratum-surface-low px-1.5 py-0.5 font-instr text-[10px]">Enter</kbd> 换行
                </p>
                <button
                  type="button"
                  onClick={() => void handleSubmit()}
                  disabled={!input.trim() || submitting}
                  className="inline-flex items-center gap-1.5 rounded-full bg-stratum-navy px-4 py-2 font-body text-[12px] font-bold text-white transition-colors hover:bg-stratum-navy-soft disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Sparkles className="h-3.5 w-3.5 text-stratum-sky" strokeWidth={2} fill="#89CEFF" />
                  {submitting ? '启动中…' : '进入画布'}
                  {!submitting ? <Send className="h-3.5 w-3.5" strokeWidth={2} /> : null}
                </button>
              </div>
            </div>

            {submitError ? (
              <div className="mt-3 rounded-lg border border-stratum-danger/40 bg-stratum-danger-wash/40 px-4 py-2 font-body text-[12px] text-stratum-danger">
                {submitError}
              </div>
            ) : null}

            {/* Mode B + C entry cards */}
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => setKbModalOpen(true)}
                className="text-left rounded-xl border border-stratum-line bg-white px-4 py-3 shadow-sm transition-all hover:border-stratum-blue/40 hover:shadow-md hover:-translate-y-0.5"
              >
                <Database className="mb-1.5 h-4 w-4 text-stratum-blue" strokeWidth={1.75} />
                <p className="font-body text-[12px] font-bold text-stratum-navy">
                  已有资料？上传分析
                </p>
                <p className="mt-0.5 font-body text-[11px] text-stratum-muted leading-relaxed">
                  访谈 / 文档 / URL 入 KB → RAG 抽取 → 带证据的 BMC
                </p>
              </button>
              <a
                href="/canvas/proj-001?wizard=1"
                className="text-left rounded-xl border border-stratum-line bg-white px-4 py-3 shadow-sm transition-all hover:border-stratum-blue/40 hover:shadow-md hover:-translate-y-0.5"
              >
                <ListChecks className="mb-1.5 h-4 w-4 text-stratum-blue" strokeWidth={1.75} />
                <p className="font-body text-[12px] font-bold text-stratum-navy">
                  7 步结构化向导
                </p>
                <p className="mt-0.5 font-body text-[11px] text-stratum-muted leading-relaxed">
                  AI 在画布旁边逐步问，每步把答案抽成 insight 节点
                </p>
              </a>
              <a
                href="/knowledge"
                className="text-left rounded-xl border border-stratum-line bg-white px-4 py-3 shadow-sm transition-all hover:border-stratum-blue/40 hover:shadow-md hover:-translate-y-0.5"
              >
                <Sparkles className="mb-1.5 h-4 w-4 text-stratum-blue" strokeWidth={2} fill="#89CEFF" />
                <p className="font-body text-[12px] font-bold text-stratum-navy">
                  KB 管理中心
                </p>
                <p className="mt-0.5 font-body text-[11px] text-stratum-muted leading-relaxed">
                  看已有资料 / 状态 / 重新 embed / 跨 workspace 复用
                </p>
              </a>
            </div>

            {/* Starters */}
            <div className="mt-8">
              <p className="mb-3 font-body text-[10px] font-semibold uppercase tracking-[0.18em] text-stratum-muted">
                灵感起点
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {STARTERS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setInput(s)}
                    className="rounded-xl border border-stratum-line bg-white px-4 py-3 text-left font-body text-[13px] leading-relaxed text-stratum-ink shadow-sm transition-all hover:border-stratum-blue/40 hover:shadow-md hover:-translate-y-0.5"
                  >
                    <Sparkles className="mb-1.5 h-3.5 w-3.5 text-stratum-blue" strokeWidth={2} fill="#89CEFF" />
                    <span className="block">{s}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="border-t border-stratum-line bg-white px-8 py-3">
          <p className="text-center font-body text-[10px] text-stratum-muted">
            演示模式 · 后端 PG 起来后接真 8-agent pipeline · 会话历史持久化在浏览器 localStorage
          </p>
        </footer>
      </main>

      <KbUploadModal
        open={kbModalOpen}
        workspaceId={DEFAULT_WORKSPACE_ID}
        onClose={() => setKbModalOpen(false)}
        onAnalyze={(kbId) => {
          // Stash kbId so /canvas auto-fires startConversation with KB
          if (typeof window !== 'undefined') {
            window.sessionStorage.setItem('starlink_pending_kb_id', kbId)
            window.sessionStorage.setItem('starlink_pending_seed', '基于已上传的资料生成 BMC 商业画布，使用 RAG 检索关键证据。')
            window.location.href = `/canvas/${encodeURIComponent(DEFAULT_WORKSPACE_ID)}?mode=kb-analyze`
          }
        }}
      />
    </div>
  )
}
