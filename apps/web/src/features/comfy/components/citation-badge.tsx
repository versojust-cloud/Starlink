'use client'

import { AlertTriangle } from 'lucide-react'
import { cn } from '@/shared/lib/utils'

export type CitationBadgeVariant = 'ref' | 'no-ref'

type CitationBadgeProps = {
  variant: CitationBadgeVariant
  index?: number
  docId?: string
  score?: number
  active?: boolean
  onClick?: () => void
  className?: string
}

/**
 * Inline badge rendered next to a cited text span.
 *
 * - variant='ref': shows [n] with sky palette; clickable to open Evidence Drawer
 * - variant='no-ref': shows ⚠ with amber palette; indicates LLM-declared
 *   "no supporting evidence" for that span
 */
export function CitationBadge({
  variant,
  index,
  docId,
  score,
  active,
  onClick,
  className
}: CitationBadgeProps) {
  if (variant === 'no-ref') {
    return (
      <span
        className={cn(
          'mx-0.5 inline-flex h-5 w-5 items-center justify-center rounded bg-amber-400/15 text-amber-300 align-middle',
          className
        )}
        title="LLM 标注: 此判断无知识库 evidence 支撑"
      >
        <AlertTriangle className="h-3 w-3" />
      </span>
    )
  }

  const tooltip = docId
    ? `来源: ${docId}${typeof score === 'number' ? ` · 相关度 ${score.toFixed(2)}` : ''}`
    : 'Evidence 引用'

  return (
    <button
      type="button"
      onClick={onClick}
      title={tooltip}
      className={cn(
        'mx-0.5 inline-flex h-5 min-w-[20px] items-center justify-center rounded px-1 align-middle text-[10px] font-semibold transition cursor-pointer',
        'bg-sky-400/15 text-sky-300 hover:bg-sky-400/30 hover:text-sky-100',
        active && 'ring-2 ring-sky-400 ring-offset-1 ring-offset-slate-950',
        className
      )}
    >
      [{index ?? '•'}]
    </button>
  )
}
