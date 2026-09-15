'use client'

import { useState, useRef } from 'react'
import { nanoid } from 'nanoid'

type Message = {
  id: string
  role: 'user' | 'assistant'
  content: string
  loading?: boolean
}

type AssistantPanelProps = {
  onAnalyze: (question: string) => Promise<void>
}

export function AssistantPanel({ onAnalyze }: AssistantPanelProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!input.trim() || loading) return

    const userMessage: Message = {
      id: nanoid(),
      role: 'user',
      content: input.trim()
    }

    // 添加用户消息
    setMessages((prev) => [...prev, userMessage])
    const currentInput = input.trim()
    setInput('')
    setLoading(true)

    // 添加加载中的助手消息
    const loadingMessageId = nanoid()
    setMessages((prev) => [
      ...prev,
      {
        id: loadingMessageId,
        role: 'assistant',
        content: '正在分析中...',
        loading: true
      }
    ])

    try {
      // 调用 AI 分析
      await onAnalyze(currentInput)

      // 替换加载消息为成功消息
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === loadingMessageId
            ? {
                ...msg,
                content: '已为您生成任务拆分，请在画布上查看。',
                loading: false
              }
            : msg
        )
      )
    } catch (error) {
      // 替换为错误消息
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === loadingMessageId
            ? {
                ...msg,
                content: `抱歉，分析失败了：${error instanceof Error ? error.message : '未知错误'}`,
                loading: false
              }
            : msg
        )
      )
    } finally {
      setLoading(false)
      // 重新聚焦输入框
      textareaRef.current?.focus()
    }
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      handleSubmit(event)
    }
  }

  return (
    <aside
      className="flex h-full w-[360px] flex-col border-l border-canvas-border bg-canvas-surface/90 text-canvas-text backdrop-blur"
      data-testid="assistant-panel"
    >
      <header className="border-b border-canvas-border px-6 py-4">
        <h2 className="text-base font-semibold text-canvas-text">研究助手</h2>
        <p className="mt-1 text-xs text-canvas-subtle">输入问题，AI 帮您拆解为可执行的任务画布</p>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4 text-sm">
        {messages.length === 0 && (
          <div className="flex h-full items-center justify-center text-center text-sm text-canvas-subtle">
            <div className="space-y-3">
              <p>尝试输入：</p>
              <div className="space-y-2 text-xs">
                <p className="rounded-lg border border-canvas-border bg-canvas-panel px-3 py-2">
                  &quot;我想开发一个 AI Agent 产品&quot;
                </p>
                <p className="rounded-lg border border-canvas-border bg-canvas-panel px-3 py-2">
                  &quot;如何提升团队协作效率？&quot;
                </p>
              </div>
            </div>
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={clsx(
              'rounded-2xl border p-4',
              message.role === 'user'
                ? 'border-transparent bg-canvas-primary text-white shadow-sm'
                : 'border-canvas-border bg-canvas-panel'
            )}
          >
            <span className="text-xs uppercase tracking-widest text-canvas-subtle">
              {message.role === 'user' ? '提问' : '助手'}
            </span>
            <p className={`mt-2 whitespace-pre-line ${message.role === 'user' ? 'text-white' : 'text-canvas-text'}`}>
              {message.loading && (
                <span className="inline-flex items-center gap-1">
                  <span className="animate-pulse">●</span>
                  <span className="animate-pulse delay-75">●</span>
                  <span className="animate-pulse delay-150">●</span>
                  <span className="ml-2">{message.content}</span>
                </span>
              )}
              {!message.loading && message.content}
            </p>
          </div>
        ))}
      </div>

      <form className="border-t border-canvas-border px-6 py-4" onSubmit={handleSubmit}>
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="向画布提问，或输入 / 触发快捷操作"
          disabled={loading}
          className="h-24 w-full resize-none rounded-2xl border border-canvas-border bg-canvas-panel px-4 py-3 text-sm text-canvas-text outline-none placeholder:text-canvas-subtle focus:border-canvas-primary/60 focus:ring-2 focus:ring-canvas-primary/20 disabled:opacity-50"
        />
        <div className="mt-3 flex items-center justify-between text-xs text-canvas-subtle">
          <span>Shift + Enter 换行</span>
          <button
            className="rounded-full bg-canvas-primary px-4 py-1.5 text-xs font-medium text-white shadow-sm transition hover:bg-canvas-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            type="submit"
            disabled={loading || !input.trim()}
          >
            {loading ? '分析中...' : '发送'}
          </button>
        </div>
      </form>
    </aside>
  )
}

function clsx(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(' ')
}
