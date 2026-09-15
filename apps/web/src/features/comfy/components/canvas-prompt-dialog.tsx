'use client'

/**
 * Light-theme Stratum prompt dialog for kicking off AI Synthesis when
 * the user hasn't typed a seed yet. Centered cover card with Fraunces
 * heading + a textarea + paper-on-navy primary CTA.
 */

import { useEffect, useRef, useState } from 'react'
import { Sparkles, X } from 'lucide-react'

type Props = {
  open: boolean
  initialValue?: string
  isSubmitting?: boolean
  onClose: () => void
  onSubmit: (seed: string) => void
}

export function CanvasPromptDialog({ open, initialValue = '', isSubmitting, onClose, onSubmit }: Props) {
  const [value, setValue] = useState(initialValue)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    if (open) {
      setValue(initialValue)
      const t = setTimeout(() => textareaRef.current?.focus(), 60)
      return () => clearTimeout(t)
    }
  }, [open, initialValue])

  if (!open) return null

  const trimmed = value.trim()
  const canSubmit = trimmed.length > 0 && !isSubmitting

  const handleSubmit = () => {
    if (!canSubmit) return
    onSubmit(trimmed)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-stratum-navy/40 backdrop-blur-sm p-6"
      role="dialog"
      aria-modal="true"
      aria-label="AI Synthesis 输入种子"
    >
      <article className="w-full max-w-[520px] overflow-hidden rounded-2xl bg-white shadow-2xl border border-stratum-line">
        {/* Header */}
        <header className="flex items-start justify-between gap-4 px-6 py-5 border-b border-stratum-line">
          <div className="flex items-start gap-3 min-w-0">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-stratum-navy">
              <Sparkles className="h-4 w-4 text-stratum-sky" strokeWidth={2} fill="#89CEFF" />
            </span>
            <div className="min-w-0">
              <p className="font-body text-[10px] font-semibold uppercase tracking-[0.18em] text-stratum-blue">
                AI SYNTHESIS · 启动 8-Agent 协作
              </p>
              <h2 className="mt-1 font-display font-[700] text-[20px] tracking-tight text-stratum-navy">
                描述你的商业想法
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-stratum-muted transition-colors hover:bg-stratum-surface-low hover:text-stratum-navy"
            aria-label="关闭"
          >
            <X className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </header>

        {/* Body */}
        <div className="px-6 py-5">
          <p className="font-body text-[13px] leading-relaxed text-stratum-muted mb-3">
            一句话或几段话都行——AI 会拆解出客户、价值、收入等 9 个维度，让 8 个专家 agent 在画布上协作生成 BMC。
          </p>
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                handleSubmit()
              }
            }}
            placeholder="例如：面向 B2B SaaS 的实时数据可视化产品，按用户席位月费 + 大额企业版订阅。"
            className="w-full min-h-[120px] resize-none rounded-xl border border-stratum-line bg-stratum-surface-low px-4 py-3 font-body text-[13px] leading-relaxed text-stratum-navy outline-none transition-colors placeholder:text-stratum-muted focus:border-stratum-blue focus:ring-2 focus:ring-stratum-blue/20"
            rows={5}
            disabled={isSubmitting}
          />
          <p className="mt-2 font-body text-[11px] text-stratum-muted">
            <kbd className="rounded border border-stratum-line bg-white px-1.5 py-0.5 font-instr text-[10px]">⌘</kbd>
            <kbd className="ml-1 rounded border border-stratum-line bg-white px-1.5 py-0.5 font-instr text-[10px]">Enter</kbd>
            {' '}快速提交
          </p>
        </div>

        {/* Footer */}
        <footer className="flex items-center justify-end gap-2 px-6 py-4 bg-stratum-surface-low border-t border-stratum-line">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-full border border-stratum-line bg-white px-4 py-2 font-body text-[11px] font-semibold text-stratum-muted transition-colors hover:border-stratum-blue/40 hover:text-stratum-navy disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="inline-flex items-center gap-1.5 rounded-full bg-stratum-navy px-4 py-2 font-body text-[11px] font-bold text-white transition-colors hover:bg-stratum-navy-soft disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Sparkles className="h-3.5 w-3.5 text-stratum-sky" strokeWidth={2} fill="#89CEFF" />
            {isSubmitting ? '正在合成…' : '运行 AI Synthesis'}
          </button>
        </footer>
      </article>
    </div>
  )
}
