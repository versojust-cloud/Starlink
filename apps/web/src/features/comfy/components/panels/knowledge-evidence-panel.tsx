'use client'

import { BookOpenCheck } from 'lucide-react'
import { useComfyStore } from '../../store'
import { TOKENS } from '../canvas-design-tokens'

/**
 * Knowledge evidence panel (refresh-2026-04).
 *
 * Refresh notes:
 *  - Cyan panel-wide tint dropped; only the leading icon chip carries cyan now.
 *  - Truncation kept (4 visible) but a "Show all" affordance can be added once
 *    we wire up the evidence drawer toggle from `evidence-drawer.tsx`.
 */
export function KnowledgeEvidencePanel() {
  const evidence = useComfyStore((state) => state.knowledgeEvidence)

  if (!evidence || evidence.length === 0) return null

  return (
    <section className={`${TOKENS.surface.panel} p-3`}>
      <header className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-cyan-400/10 text-cyan-300">
            <BookOpenCheck className="h-3.5 w-3.5" strokeWidth={1.75} />
          </span>
          <div>
            <p className={TOKENS.text.kicker}>Evidence</p>
            <h3 className={TOKENS.text.h2}>知识库证据</h3>
          </div>
        </div>
        <span className="rounded-md bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-medium text-slate-400 tabular-nums">
          {evidence.length}
        </span>
      </header>

      <ul className="space-y-1.5">
        {evidence.slice(0, 4).map((item, index) => (
          <li key={`${item.docId ?? 'evidence'}-${index}`} className={`${TOKENS.surface.card} p-2.5`}>
            <p className="truncate text-[11px] font-semibold text-slate-200">
              {item.docId ?? '未命名证据'}
            </p>
            <p className={`mt-1 line-clamp-3 ${TOKENS.text.meta} leading-relaxed`}>
              {item.snippet ?? '暂无摘要'}
            </p>
          </li>
        ))}
      </ul>
    </section>
  )
}
