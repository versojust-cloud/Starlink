'use client'

/**
 * ChatThread — main chat surface (right side of the home page).
 *
 * Shows the active conversation's history + input. On send, calls
 * the parent's onSend handler which appends user → assistant pair.
 *
 * Empty state: large Stratum brand + 4 starter prompts.
 */

import { useEffect, useRef } from 'react'
import { Send, Sparkles } from 'lucide-react'
import type { ConversationSnapshot, StoredChatMessage } from '../../comfy/store/conversations-persistence'

type Props = {
  conversation: ConversationSnapshot
  input: string
  isProcessing?: boolean
  onInputChange: (value: string) => void
  onSend: () => void | Promise<void>
}

const STARTERS: string[] = [
  '我想做一个 B2B SaaS 实时数据可视化产品',
  '帮我分析独立硬件 indie hacker 的商业模型',
  '我有一个面向 Z 世代的内容订阅 idea',
  '生成一份新茶饮品牌的 BMC 商业画布',
]

export function ChatThread({ conversation, input, isProcessing, onInputChange, onSend }: Props) {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const messageCount = conversation.messages.length

  useEffect(() => {
    if (!scrollRef.current) return
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messageCount])

  const handleKey = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      if (input.trim() && !isProcessing) void onSend()
    }
  }

  const isEmpty = messageCount <= 1 && conversation.messages[0]?.role === 'assistant'

  return (
    <section className="flex h-full flex-1 flex-col bg-stratum-surface">
      {/* Top header */}
      <header className="flex items-center justify-between gap-4 px-8 py-4 border-b border-stratum-line bg-white">
        <div className="flex flex-col leading-tight min-w-0">
          <p className="font-body text-[10px] font-semibold uppercase tracking-[0.18em] text-stratum-blue">
            CHAT · 8-AGENT 协作
          </p>
          <h1 className="mt-0.5 font-display font-[700] text-[18px] tracking-tight text-stratum-navy truncate">
            {conversation.title}
          </h1>
        </div>
        <div className="hidden sm:flex items-center gap-2 bg-stratum-surface-low border border-stratum-line rounded-full px-3 py-1.5">
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-stratum-ok" />
          <span className="font-body text-[10px] font-semibold uppercase tracking-[0.18em] text-stratum-muted">
            DEMO
          </span>
          <span className="font-body text-[11px] font-medium text-stratum-navy">
            本地会话
          </span>
        </div>
      </header>

      {/* Body */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-8 py-6">
        {isEmpty ? (
          <EmptyState onPickStarter={(text) => { onInputChange(text); }} />
        ) : (
          <ul className="mx-auto flex max-w-[760px] flex-col gap-5">
            {conversation.messages.map((m, idx) => (
              <Message key={`${conversation.id}-${idx}`} message={m} />
            ))}
            {isProcessing ? (
              <li className="flex items-center gap-2 px-3 py-2 text-stratum-blue font-body text-[12px]">
                <span className="inline-flex gap-1">
                  <span className="h-1 w-1 rounded-full bg-stratum-blue animate-pulse" style={{ animationDelay: '0ms' }} />
                  <span className="h-1 w-1 rounded-full bg-stratum-blue animate-pulse" style={{ animationDelay: '150ms' }} />
                  <span className="h-1 w-1 rounded-full bg-stratum-blue animate-pulse" style={{ animationDelay: '300ms' }} />
                </span>
                AI 正在思考…
              </li>
            ) : null}
          </ul>
        )}
      </div>

      {/* Composer */}
      <footer className="border-t border-stratum-line bg-white px-8 py-4">
        <div className="mx-auto max-w-[760px]">
          <div className="flex items-end gap-3 rounded-2xl border border-stratum-line bg-white shadow-sm focus-within:border-stratum-blue focus-within:ring-2 focus-within:ring-stratum-blue/20 transition-colors px-4 py-3">
            <textarea
              value={input}
              onChange={(e) => onInputChange(e.target.value)}
              onKeyDown={handleKey}
              placeholder="向 8-Agent 团队提问…（Enter 发送 / Shift+Enter 换行）"
              rows={1}
              disabled={isProcessing}
              className="flex-1 resize-none bg-transparent font-body text-[14px] leading-relaxed text-stratum-navy placeholder:text-stratum-muted outline-none disabled:opacity-50"
              style={{ maxHeight: '160px' }}
            />
            <button
              type="button"
              onClick={() => void onSend()}
              disabled={!input.trim() || isProcessing}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-stratum-navy text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed hover:bg-stratum-navy-soft"
              aria-label="发送"
            >
              <Send className="h-4 w-4" strokeWidth={2} />
            </button>
          </div>
          <p className="mt-2 text-center font-body text-[10px] text-stratum-muted">
            演示模式 · 后端起来后会接 8-agent 真实 pipeline。当前 chat 历史持久化在浏览器 localStorage。
          </p>
        </div>
      </footer>
    </section>
  )
}

function Message({ message }: { message: StoredChatMessage }) {
  const isUser = message.role === 'user'
  return (
    <li className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      <span
        aria-hidden="true"
        className={`shrink-0 flex h-8 w-8 items-center justify-center rounded-full font-body text-[11px] font-bold ${
          isUser ? 'bg-stratum-navy text-white' : 'bg-stratum-blue/10 text-stratum-blue'
        }`}
      >
        {isUser ? 'U' : 'A'}
      </span>
      <div
        className={`max-w-[78%] rounded-2xl px-4 py-3 font-body text-[14px] leading-[1.65] shadow-sm ${
          isUser
            ? 'bg-stratum-navy text-white'
            : 'bg-white border border-stratum-line text-stratum-ink'
        }`}
      >
        <p className="whitespace-pre-wrap break-words">{message.content}</p>
        <p className={`mt-1 font-body text-[10px] tabular-nums ${isUser ? 'text-white/50' : 'text-stratum-muted'}`}>
          {message.timestamp}
        </p>
      </div>
    </li>
  )
}

function EmptyState({ onPickStarter }: { onPickStarter: (text: string) => void }) {
  return (
    <div className="mx-auto flex max-w-[760px] flex-col items-center justify-center pt-12">
      <span
        aria-hidden="true"
        className="flex h-16 w-16 items-center justify-center rounded-2xl bg-stratum-navy text-white text-[32px] leading-none mb-4 shadow-lg"
      >
        ◇
      </span>
      <h2 className="font-display font-[700] text-[28px] tracking-tight text-stratum-navy mb-2">
        从一个商业想法开始
      </h2>
      <p className="font-body text-[14px] leading-relaxed text-stratum-muted text-center max-w-[460px] mb-8">
        用一句话描述你的 idea，8 个 agent 会通过苏格拉底式反问帮你拆解客户、价值、收入等 9 个维度，最后输出 BMC 商业画布。
      </p>
      <div className="grid w-full max-w-[640px] grid-cols-1 gap-2 sm:grid-cols-2">
        {STARTERS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onPickStarter(s)}
            className="rounded-xl border border-stratum-line bg-white px-4 py-3 text-left font-body text-[13px] text-stratum-ink shadow-sm transition-all hover:border-stratum-blue/40 hover:shadow-md hover:-translate-y-0.5"
          >
            <Sparkles className="mb-1.5 h-3.5 w-3.5 text-stratum-blue" strokeWidth={2} fill="#89CEFF" />
            <span className="block">{s}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
