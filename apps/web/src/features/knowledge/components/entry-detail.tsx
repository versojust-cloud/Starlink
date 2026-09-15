'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { InsightLog, KnowledgeEntry } from '@/types/knowledge'

/**
 * Lightweight markdown renderer for knowledge-entry summaries and
 * insight-log bodies. Knowledge content is often AI-summarised and
 * may include lists, inline emphasis, or GFM tables (competitor
 * comparison / metric tables). Reuses the wizard-page rhythm but
 * keeps the slate-tinted palette of the legacy knowledge page.
 */
const KNOWLEDGE_MD = {
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="my-1.5 first:mt-0 last:mb-0">{children}</p>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="my-2 list-disc pl-5 space-y-0.5">{children}</ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="my-2 list-decimal pl-5 space-y-0.5">{children}</ol>
  ),
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className="font-semibold text-slate-900">{children}</strong>
  ),
  em: ({ children }: { children?: React.ReactNode }) => (
    <em className="italic">{children}</em>
  ),
  code: ({ children }: { children?: React.ReactNode }) => (
    <code className="font-mono text-[12px] bg-[#F5F3FF] text-[#4338CA] px-1 py-0.5 border border-[#E3E6FF] rounded-[2px]">{children}</code>
  ),
  table: ({ children }: { children?: React.ReactNode }) => (
    <div className="my-3 overflow-x-auto rounded-[2px] border border-[#E3E6FF] bg-white">
      <table className="w-full border-collapse text-[12px] leading-[1.55] tabular-nums">{children}</table>
    </div>
  ),
  thead: ({ children }: { children?: React.ReactNode }) => (
    <thead className="bg-[#F8F9FF] border-b-[1.5px] border-[#4338CA]">{children}</thead>
  ),
  tr: ({ children }: { children?: React.ReactNode }) => (
    <tr className="border-b-[0.5px] border-[#E3E6FF] last:border-b-0 hover:bg-[#F8F9FF]/60 transition-colors">{children}</tr>
  ),
  th: ({ children }: { children?: React.ReactNode }) => (
    <th className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#4338CA] text-left px-2.5 py-1.5 whitespace-nowrap">{children}</th>
  ),
  td: ({ children }: { children?: React.ReactNode }) => (
    <td className="px-2.5 py-1.5 text-slate-700 align-top">{children}</td>
  ),
}

type KnowledgeEntryDetailProps = {
  entry: KnowledgeEntry | null
  insightLogs: InsightLog[]
}

const stageDescription: Record<KnowledgeEntry['stage'], string> = {
  uploaded: '待解析：等待 AI/人工解析内容。',
  processing: '解析中：AI 正在提炼摘要与标签。',
  ready: '待发布：可生成洞察并同步到画布或社群。',
  published: '已发布：可持续复用与同步。'
}

const actionLabels: Record<KnowledgeEntry['stage'], string[]> = {
  uploaded: ['安排解析', '分配责任人', '补充标签'],
  processing: ['查看解析结果', '调整标签', '确认负责人'],
  ready: ['生成行动项', '写入画布', '同步社群'],
  published: ['回顾引用效果', '发布最佳实践', '标记复盘']
}

export function KnowledgeEntryDetail({ entry, insightLogs }: KnowledgeEntryDetailProps) {
  if (!entry) {
    return (
      <div className="flex flex-1 items-center justify-center rounded-3xl border border-dashed border-[#CBD5F5] bg-white/80 text-sm text-slate-400">
        选择左侧条目以查看详情、生成洞察。
      </div>
    )
  }

  const stageSteps = actionLabels[entry.stage]
  const relatedInsights = insightLogs.filter((log) => log.entryId === entry.id)

  return (
    <div className="flex flex-1 flex-col overflow-y-auto rounded-3xl border border-[#E3E6FF] bg-white/90 px-6 py-6 shadow-inner">
      <header className="space-y-3">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span className="rounded-full bg-[#EEF2FF] px-2 py-0.5 text-[10px] text-[#4338CA]">
            {entry.stage.toUpperCase()}
          </span>
          <span>{stageDescription[entry.stage]}</span>
        </div>
        <h2 className="text-xl font-semibold text-slate-900">{entry.title}</h2>
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
          <span>负责人：{entry.owner}</span>
          <span>更新于：{entry.updatedAt}</span>
          <span>引用节点：{entry.references}</span>
          {entry.source && (
            <a
              href={entry.source}
              className="rounded-full bg-[#EEF2FF] px-2 py-0.5 text-[10px] text-[#4338CA]"
            >
              来源链接
            </a>
          )}
        </div>
      </header>

      <section className="mt-6 space-y-2 rounded-2xl border border-[#E3E6FF] bg-white/90 p-4">
        <h3 className="text-sm font-semibold text-slate-900">摘要与标签</h3>
        <div className="text-sm leading-relaxed text-slate-600">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={KNOWLEDGE_MD}>
            {entry.summary}
          </ReactMarkdown>
        </div>
        <div className="flex flex-wrap gap-2 text-[11px] text-slate-500">
          {entry.tags.map((tag) => (
            <span key={`${entry.id}-detail-tag-${tag}`} className="rounded-full bg-[#F5F3FF] px-2 py-0.5 text-[#6D28D9]">
              {tag}
            </span>
          ))}
        </div>
      </section>

      <section className="mt-4 space-y-3 rounded-2xl border border-[#E3E6FF] bg-[#F8F9FF]/80 p-4">
        <h3 className="text-sm font-semibold text-slate-900">推荐动作</h3>
        <ul className="space-y-2 text-sm text-slate-600">
          {stageSteps.map((step) => (
            <li key={`${entry.id}-step-${step}`} className="flex items-start gap-2">
              <span className="mt-1 h-2 w-2 rounded-full bg-[#7F5BFA]" />
              <span>{step}</span>
            </li>
          ))}
          {entry.nextActions?.map((action) => (
            <li key={`${entry.id}-custom-${action}`} className="flex items-start gap-2 text-[#4338CA]">
              <span className="mt-1 h-2 w-2 rounded-full bg-[#4338CA]" />
              <span>{action}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-4 space-y-3 rounded-2xl border border-[#E3E6FF] bg-white/80 p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">洞察历史</h3>
          <span className="text-xs text-slate-400">最新 {relatedInsights.length} 条</span>
        </div>
        {relatedInsights.length === 0 ? (
          <p className="text-xs text-slate-400">尚未生成洞察，使用右侧面板的 AI 洞察操作自动生成。</p>
        ) : (
          <ol className="space-y-3 text-xs text-slate-500">
            {relatedInsights.map((log) => (
              <li key={log.id} className="rounded-xl border border-[#E3E6FF] bg-[#F9FAFF] px-3 py-3">
                <p className="text-[11px] uppercase tracking-widest text-[#4338CA]">{log.generatedAt}</p>
                <div className="mt-2 text-sm text-slate-600">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={KNOWLEDGE_MD}>
                    {log.summary}
                  </ReactMarkdown>
                </div>
                {log.actions.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-[#6366F1]">
                    {log.actions.map((action, index) => (
                      <span
                        key={`${log.id}-action-${index}`}
                        className="rounded-full bg-[#EEF2FF] px-2 py-0.5"
                      >
                        {action}
                      </span>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  )
}
