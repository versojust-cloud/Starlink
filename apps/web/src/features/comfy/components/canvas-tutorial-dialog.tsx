'use client'

/**
 * CanvasTutorialDialog — Editorial Boardroom v2 (2026-05-02).
 *
 * Onboarding overlay shown via the "快速入门" header button (and once
 * automatically on first canvas visit per CANVAS_TUTORIAL_STORAGE_KEY).
 *
 * v1 was glass-effect + amber→emerald gradient banner + 3 differently-
 * colored Lucide icons + amber→emerald gradient pill buttons + glowing
 * progress dots + animate-gradient (the only place still using that
 * keyframe). Replaced with editorial cover card: kicker rail / Fraunces
 * step title / Geist body / mono step counter / paper-on-ink primary.
 */

import { ChevronRight, X } from 'lucide-react'

const TUTORIAL_STEPS = [
  {
    kicker: '01 · WELCOME',
    title: '欢迎来到智绘画布',
    description: '通过 AI 驱动的可视化画布，让商业想法变成现实。',
  },
  {
    kicker: '02 · DESCRIBE',
    title: '描述你的愿景',
    description: '用自然语言描述你的商业想法，AI 将为你构建初始结构。',
  },
  {
    kicker: '03 · COLLABORATE',
    title: '实时协作优化',
    description: '拖拽节点、建立连接，AI 助手会持续提供专业建议。',
  },
]

type CanvasTutorialDialogProps = {
  open: boolean
  tutorialStep: number
  onClose: () => void
  onNext: () => void
}

export function CanvasTutorialDialog({
  open,
  tutorialStep,
  onClose,
  onNext,
}: CanvasTutorialDialogProps) {
  if (!open) return null
  const step = TUTORIAL_STEPS[tutorialStep] ?? TUTORIAL_STEPS[0]
  const isLast = tutorialStep >= TUTORIAL_STEPS.length - 1

  return (
    <div
      className="fixed inset-0 bg-stratum-navy/40 backdrop-blur-sm z-50 flex items-center justify-center p-8 animate-editorial-swap"
      role="dialog"
      aria-modal="true"
      aria-label="Canvas tutorial"
    >
      <article className="bg-white rounded-2xl border border-stratum-line shadow-2xl max-w-[480px] w-full overflow-hidden animate-editorial-publish">
        {/* Header */}
        <header className="flex items-center justify-between px-6 py-3 border-b border-stratum-line">
          <p className="font-body text-[10px] font-semibold uppercase tracking-[0.18em] text-stratum-blue">
            STARLINK · TUTORIAL
          </p>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-full text-stratum-muted hover:bg-stratum-surface-low hover:text-stratum-navy transition-colors"
            aria-label="跳过"
          >
            <X className="w-3.5 h-3.5" strokeWidth={1.5} />
          </button>
        </header>

        {/* Body */}
        <div className="px-8 py-7">
          <p className="font-body text-[10px] font-semibold uppercase tracking-[0.18em] text-stratum-blue mb-3">
            {step.kicker}
          </p>
          <h2 className="font-display font-[700] text-[26px] leading-[1.1] tracking-tight text-stratum-navy mb-3">
            {step.title}
          </h2>
          <p className="font-body text-[14px] leading-[1.6] text-stratum-ink max-w-measure-cell">
            {step.description}
          </p>
        </div>

        {/* Step indicator */}
        <div className="px-8 pb-2 flex items-center gap-2">
          {TUTORIAL_STEPS.map((_, index) => (
            <span
              key={index}
              aria-hidden="true"
              className={`h-[2px] flex-1 rounded-full transition-colors ${
                index === tutorialStep ? 'bg-stratum-navy' : 'bg-stratum-line'
              }`}
            />
          ))}
        </div>

        {/* Footer */}
        <footer className="flex items-center gap-3 px-8 py-5 border-t border-stratum-line bg-stratum-surface-low">
          <span className="font-body text-[10px] tabular-nums font-semibold uppercase tracking-[0.18em] text-stratum-muted mr-auto">
            STEP {String(tutorialStep + 1).padStart(2, '0')} / {String(TUTORIAL_STEPS.length).padStart(2, '0')}
          </span>
          <button
            onClick={onClose}
            className="rounded-full border border-stratum-line bg-white px-3 py-1.5 font-body text-[11px] font-semibold text-stratum-muted hover:border-stratum-blue/40 hover:text-stratum-navy transition-colors"
          >
            跳过
          </button>
          <button
            onClick={onNext}
            className="inline-flex items-center gap-1.5 rounded-full bg-stratum-navy text-white px-4 py-1.5 font-body text-[11px] font-semibold hover:bg-stratum-navy-soft transition-colors"
          >
            {isLast ? '开始使用' : '下一步'}
            <ChevronRight className="w-3.5 h-3.5" strokeWidth={2} />
          </button>
        </footer>
      </article>
    </div>
  )
}
