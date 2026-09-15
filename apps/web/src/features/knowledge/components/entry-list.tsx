'use client'

import clsx from 'clsx'
import type { KnowledgeEntry } from '@/types/knowledge'

type KnowledgeEntryListProps = {
  entries: KnowledgeEntry[]
  selectedId: string | null
  onSelect: (entryId: string) => void
  onOpenDetail?: (entry: KnowledgeEntry) => void
  emptyMessage?: string
}

const stageBadgeText: Record<KnowledgeEntry['stage'], string> = {
  uploaded: '待解析',
  processing: '解析中',
  ready: '待发布',
  published: '已发布'
}

export function KnowledgeEntryList({
  entries,
  selectedId,
  onSelect,
  onOpenDetail,
  emptyMessage = '暂无条目，上传或导入资料后即可开始。'
}: KnowledgeEntryListProps) {
  if (entries.length === 0) {
    return (
      <div className="mt-12 flex items-center justify-center rounded-2xl border border-dashed border-[#CBD5F5] bg-white/80 px-6 py-10 text-sm text-slate-500">
        {emptyMessage}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {entries.map((entry) => (
        <div
          key={entry.id}
          className={clsx(
            'rounded-2xl border px-4 py-4 shadow-sm transition',
            selectedId === entry.id
              ? 'border-[#C4C7FF] bg-white'
              : 'border-transparent bg-white/80 hover:border-[#E3E6FF]'
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="rounded-full bg-[#EEF2FF] px-2 py-0.5 text-[10px] text-[#4338CA]">
                {stageBadgeText[entry.stage]}
              </span>
              <span className="rounded-full bg-[#F5F3FF] px-2 py-0.5 text-[10px] text-[#6D28D9]">
                {entry.type.toUpperCase()}
              </span>
            </div>
            <span className="text-xs text-slate-400">{entry.updatedAt}</span>
          </div>
          <div className="mt-2 flex items-start justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">{entry.title}</h3>
              <p className="mt-2 line-clamp-2 text-xs text-slate-500">{entry.summary}</p>
            </div>
            <div className="flex flex-col items-end gap-1 text-xs text-slate-400">
              <span>负责人 {entry.owner}</span>
              <span>引用 {entry.references}</span>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
            {entry.tags.map((tag) => (
              <span key={`${entry.id}-${tag}`} className="rounded-full bg-[#EEF2FF] px-2 py-0.5 text-[#4338CA]">
                {tag}
              </span>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between">
            <button
              type="button"
              onClick={() => onSelect(entry.id)}
              className="text-xs text-slate-500 underline-offset-4 hover:text-[#4338CA] hover:underline"
            >
              快速预览
            </button>
            <button
              type="button"
              onClick={() => onOpenDetail?.(entry)}
              className="rounded-full border border-[#C7D2FE] px-3 py-1 text-xs text-[#4338CA] transition hover:bg-[#EEF2FF]"
            >
              查看详情
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
