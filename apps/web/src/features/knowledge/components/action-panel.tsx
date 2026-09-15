'use client'

import clsx from 'clsx'
import type { IngestionJob, KnowledgeEntry } from '@/types/knowledge'

type KnowledgeActionPanelProps = {
  workspaceId: string
  selectedEntry: KnowledgeEntry | null
  ingestionJobs: IngestionJob[]
  onTriggerInsights: (options: { entryId?: string; question?: string }) => void
  isAnalyzing: boolean
  analysisError?: string | null
  latestInsight?: string
  onDownloadInsight?: () => void
  onOpenImportModal: () => void
}

export function KnowledgeActionPanel({
  workspaceId,
  selectedEntry,
  ingestionJobs,
  onTriggerInsights,
  isAnalyzing,
  analysisError,
  latestInsight,
  onDownloadInsight,
  onOpenImportModal
}: KnowledgeActionPanelProps) {
  return (
    <aside className="w-80 overflow-y-auto border-l border-[#E3E6FF] bg-white/80 px-5 py-6">
      <div className="space-y-5">
        <section className="rounded-2xl border border-[#E3E6FF] bg-white px-4 py-4 text-sm text-slate-600 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">导入资料流程</h3>
            <button
              type="button"
              onClick={onOpenImportModal}
              className="rounded-full bg-[#EEF2FF] px-3 py-1 text-[11px] text-[#4338CA]"
            >
              新建导入
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            支持上传文件或抓取网址，导入后系统会自动提炼摘要、标签并同步到知识库。
          </p>
          <ul className="mt-3 space-y-2 text-xs text-slate-500">
            <li>1. 点击“新建导入”上传文件或输入网址。</li>
            <li>2. 进入“解析中”后可以提前设置负责人和标签。</li>
            <li>3. 解析完成即进入“待发布”流程。</li>
          </ul>
        </section>

        <section className="space-y-3 rounded-2xl border border-[#E3E6FF] bg-white px-4 py-4 text-sm text-slate-600 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">AI 洞察助手</h3>
            <span className="text-[10px] uppercase tracking-widest text-[#6366F1]">Workspace {workspaceId}</span>
          </div>
          <p className="text-xs text-slate-500">选中条目后可生成摘要、行动项并同步到画布或社群。</p>
          <div className="space-y-2 text-xs">
            <label className="flex items-center gap-2">
              <input type="checkbox" defaultChecked className="rounded border-[#C7D2FE] text-[#4F46E5] focus:ring-[#C7D2FE]" />
              生成摘要 &amp; 标签
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" defaultChecked className="rounded border-[#C7D2FE] text-[#4F46E5] focus:ring-[#C7D2FE]" />
              生成行动清单
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" className="rounded border-[#C7D2FE] text-[#4F46E5] focus:ring-[#C7D2FE]" />
              推送到社群共创圈
            </label>
          </div>
          <button
            type="button"
            className={clsx(
              'w-full rounded-lg bg-[#111827] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1F2937]',
              { 'opacity-50': !selectedEntry || isAnalyzing }
            )}
            disabled={!selectedEntry || isAnalyzing}
            onClick={() => {
              if (!selectedEntry) return
              onTriggerInsights({ entryId: selectedEntry.id })
            }}
          >
            {isAnalyzing ? 'AI 分析中…' : selectedEntry ? `分析「${selectedEntry.title}」` : '选择条目以分析'}
          </button>

          <button
            type="button"
            className="w-full rounded-lg border border-[#C7D2FE] px-4 py-2 text-xs text-[#4338CA] hover:bg-[#EEF2FF]"
            onClick={() => {
              onTriggerInsights({
                question: '请基于当前知识库条目生成每周洞察摘要与下一步行动建议。'
              })
            }}
            disabled={isAnalyzing}
          >
            生成知识库周报
          </button>
          {analysisError && <p className="text-[11px] text-[#B91C1C]">{analysisError}</p>}
          {latestInsight && (
            <div className="space-y-2 rounded-xl border border-[#D7DBFF] bg-[#F8F9FF] px-3 py-3 text-xs text-slate-600">
              <p className="text-[11px] uppercase tracking-widest text-[#4338CA]">最新洞察</p>
              <p className="whitespace-pre-wrap">{latestInsight}</p>
              {onDownloadInsight && (
                <button
                  type="button"
                  onClick={onDownloadInsight}
                  className="rounded-lg border border-[#C7D2FE] px-3 py-1 text-[11px] text-[#4338CA] transition hover:bg-[#EEF2FF]"
                >
                  下载为 Markdown
                </button>
              )}
            </div>
          )}
        </section>

        <section className="space-y-3 rounded-2xl border border-[#E3E6FF] bg-white px-4 py-4 text-xs text-slate-600 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900">导入进度</h3>
          <div className="space-y-2">
            {ingestionJobs.map((job) => (
              <div key={job.id} className="rounded-xl border border-[#E3E6FF] bg-[#F9FAFF] px-3 py-3">
                <div className="flex items-center justify-between text-[11px] text-slate-500">
                  <span className="line-clamp-1 text-slate-600">{job.fileName}</span>
                  <span>{job.progress}%</span>
                </div>
                <div className="mt-1 text-[11px] text-slate-400">
                  {job.stage === 'completed' ? '解析完成' : `状态：${job.stage}`}
                </div>
                <div className="mt-2 h-1.5 rounded-full bg-[#E3E6FF]">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#7F5BFA] to-[#5B8DEF]"
                    style={{ width: `${Math.max(job.progress, 6)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </aside>
  )
}
