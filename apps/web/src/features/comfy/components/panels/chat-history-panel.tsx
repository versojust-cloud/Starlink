'use client'

import { History, Sparkles } from 'lucide-react'
import { useComfyStore } from '../../store'
import { TOKENS } from '../canvas-design-tokens'

/**
 * Chat history panel (refresh-2026-04).
 *
 * Refresh notes:
 *  - Emerald gradient header band → flat panel surface; assistant role tint
 *    moved to the avatar chip only.
 *  - User bubble was amber-gradient pill; now uses cyan accent only via 1-px
 *    ring + slate-100 text on slate-900 surface (matches Linear chat aesthetic).
 *  - Assistant bubble: subtle white-tint surface with 1-px white/10 border.
 *  - Empty state simplified — single line + dashed surface card.
 */
export function ChatHistoryPanel() {
  const messages = useComfyStore((state) => state.chatMessages)

  return (
    <section className={`flex min-h-[18rem] flex-1 flex-col ${TOKENS.surface.panel}`}>
      <header className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-400/10 text-emerald-300">
            <Sparkles className="h-3.5 w-3.5" strokeWidth={1.75} />
          </span>
          <div>
            <p className={TOKENS.text.kicker}>Advisor</p>
            <h3 className={TOKENS.text.h2}>AI 商业顾问</h3>
          </div>
        </div>
        <button
          type="button"
          className="flex h-7 w-7 items-center justify-center rounded-md border border-white/[0.06] text-slate-400 transition-colors hover:border-white/[0.14] hover:text-slate-200"
          aria-label="查看历史"
        >
          <History className="h-3.5 w-3.5" strokeWidth={1.75} />
        </button>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {messages.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/[0.08] bg-slate-950/30 px-3 py-6 text-center">
            <p className={TOKENS.text.h2}>还没有对话</p>
            <p className={`mt-1.5 ${TOKENS.text.meta} leading-relaxed`}>
              底部输入框负责召唤 Agent 或工具，画布承载结果。
            </p>
          </div>
        ) : (
          messages.map((message, index) => (
            <div
              key={`${message.timestamp}-${index}`}
              className={`flex gap-2.5 ${message.role === 'user' ? 'flex-row-reverse' : ''}`}
            >
              <div
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${
                  message.role === 'assistant'
                    ? 'bg-emerald-400/10 text-emerald-300'
                    : 'border border-white/[0.08] bg-white/[0.04] text-slate-300'
                }`}
                aria-hidden
              >
                {message.role === 'assistant' ? (
                  <Sparkles className="h-3.5 w-3.5" strokeWidth={1.75} />
                ) : (
                  <span className="text-[10px] font-semibold">U</span>
                )}
              </div>

              <div
                className={`flex max-w-[85%] flex-col gap-1 ${
                  message.role === 'user' ? 'items-end' : ''
                }`}
              >
                <div
                  className={`rounded-xl px-3 py-2 text-[12px] leading-relaxed ${
                    message.role === 'assistant'
                      ? 'rounded-tl-sm border border-white/[0.06] bg-slate-950/40 text-slate-200'
                      : 'rounded-tr-sm bg-cyan-400/10 text-slate-100 ring-1 ring-cyan-300/20'
                  }`}
                >
                  {message.content}
                </div>
                <span className="px-1 text-[10px] text-slate-500 tabular-nums">
                  {message.timestamp}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  )
}
