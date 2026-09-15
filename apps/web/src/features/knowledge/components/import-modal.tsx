'use client'

import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import type { IngestionJob } from '@/types/knowledge'

type ImportModalProps = {
  open: boolean
  initialTab?: 'file' | 'url'
  onClose: () => void
  onUploadFile: (file: File) => void
  onImportUrl: (url: string) => void
  ingestionJobs: IngestionJob[]
}

export function ImportModal({ open, initialTab = 'file', onClose, onUploadFile, onImportUrl, ingestionJobs }: ImportModalProps) {
  const [activeTab, setActiveTab] = useState<'file' | 'url'>(initialTab)
  const [url, setUrl] = useState('')
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (open) {
      setActiveTab(initialTab)
      setUrl('')
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }, [open, initialTab])

  const handleFileSubmit = () => {
    const file = fileInputRef.current?.files?.[0]
    if (!file) return
    onUploadFile(file)
    fileInputRef.current!.value = ''
  }

  const handleUrlSubmit = () => {
    if (!url.trim()) return
    onImportUrl(url.trim())
    setUrl('')
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm">
      <div className="relative w-[720px] max-w-full rounded-3xl border border-[#D7DBFF] bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-[#E3E6FF] px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">导入新资料</h2>
            <p className="text-sm text-slate-500">支持上传文件或抓取网址，系统将自动提炼摘要与标签。</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-[#E3E6FF] px-3 py-1 text-sm text-slate-400 hover:bg-[#F8F9FF]"
          >
            关闭
          </button>
        </header>

        <div className="grid grid-cols-[2fr_1fr] divide-x divide-[#E3E6FF]">
          <div className="p-6">
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setActiveTab('file')}
                className={clsx(
                  'rounded-xl px-4 py-2 text-sm font-medium',
                  activeTab === 'file'
                    ? 'bg-[#EEF2FF] text-[#4338CA]'
                    : 'border border-transparent text-slate-500 hover:border-[#E3E6FF]'
                )}
              >
                上传文件
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('url')}
                className={clsx(
                  'rounded-xl px-4 py-2 text-sm font-medium',
                  activeTab === 'url'
                    ? 'bg-[#EEF2FF] text-[#4338CA]'
                    : 'border border-transparent text-slate-500 hover:border-[#E3E6FF]'
                )}
              >
                导入网址
              </button>
            </div>

            {activeTab === 'file' ? (
              <div className="mt-6 space-y-4">
                <label className="flex h-40 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-[#C7D2FE] bg-[#F8F9FF] text-center text-sm text-[#4338CA] transition hover:border-[#A5B4FC]">
                  <span className="text-base font-semibold">点击选择或拖拽文件</span>
                  <span className="mt-2 text-xs text-slate-400">支持 PDF / DOCX / CSV / Markdown</span>
                  <input ref={fileInputRef} type="file" className="hidden" />
                </label>
                <button
                  type="button"
                  onClick={handleFileSubmit}
                  className="w-full rounded-xl bg-gradient-to-r from-[#7C3AED] to-[#4F46E5] px-4 py-2 text-sm font-semibold text-white shadow hover:from-[#6F4EE5] hover:to-[#5645D7]"
                >
                  上传并解析
                </button>
                <p className="text-xs text-slate-400">
                  上传后系统将进入“解析中”，你可以在流程面板查看状态，解析完成后会自动生成摘要、标签与洞察建议。
                </p>
              </div>
            ) : (
              <div className="mt-6 space-y-4">
                <input
                  type="url"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="https://example.com/article"
                  className="w-full rounded-xl border border-[#E3E6FF] px-4 py-3 text-sm text-slate-600 placeholder:text-slate-400 focus:border-[#A5B4FC] focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleUrlSubmit}
                  className="w-full rounded-xl border border-[#C7D2FE] bg-[#EEF2FF] px-4 py-2 text-sm font-semibold text-[#4338CA] hover:bg-[#E0E7FF]"
                >
                  抓取并解析网页
                </button>
                <p className="text-xs text-slate-400">
                  系统会使用阅读器抓取正文，并提炼重点段落。适合导入社群共创内容或外部文章。
                </p>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-4 p-6">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">最近导入</h3>
              <p className="text-xs text-slate-400">查看正在解析的资料进度。</p>
            </div>
            <div className="space-y-3 overflow-y-auto">
              {ingestionJobs.slice(0, 4).map((job) => (
                <div key={job.id} className="rounded-xl border border-[#E3E6FF] bg-[#F9FAFF] px-3 py-3 text-xs text-slate-500">
                  <p className="line-clamp-2 text-slate-600">{job.fileName}</p>
                  <div className="mt-1 flex items-center justify-between text-[11px] text-slate-400">
                    <span>{job.stage === 'completed' ? '解析完成' : `状态：${job.stage}`}</span>
                    <span>{job.progress}%</span>
                  </div>
                  <div className="mt-2 h-1.5 rounded-full bg-[#E3E6FF]">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#7F5BFA] to-[#5B8DEF]"
                      style={{ width: `${Math.max(job.progress, 8)}%` }}
                    />
                  </div>
                </div>
              ))}
              {ingestionJobs.length === 0 && (
                <p className="rounded-lg border border-dashed border-[#CBD5F5] bg-white/80 px-3 py-4 text-center text-xs text-slate-400">
                  暂无导入任务，上传资料后即可在此查看解析进度。
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
