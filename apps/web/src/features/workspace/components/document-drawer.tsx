'use client'

import { useState } from 'react'

const documents = [
  { id: 'doc-001', title: 'AI 行业白皮书.pdf', status: '已解析', updatedAt: '2024-01-05' },
  { id: 'doc-002', title: 'OpenAI DevDay Recap.md', status: '处理中', updatedAt: '2024-01-11' }
]

type DocumentDrawerProps = {
  open: boolean
  onClose: () => void
}

export function DocumentDrawer({ open, onClose }: DocumentDrawerProps) {
  const [selectedDoc, setSelectedDoc] = useState<string | null>(null)

  if (!open) return null

  const activeDoc = documents.find((doc) => doc.id === selectedDoc)

  return (
    <div
      className="fixed inset-y-0 right-0 z-[600] flex w-[420px] flex-col border-l border-canvas-border bg-canvas-surface/95 text-canvas-text shadow-xl backdrop-blur"
      data-testid="document-drawer"
    >
      <header className="flex items-center justify-between border-b border-canvas-border px-6 py-4">
        <div>
          <h2 className="text-base font-semibold text-canvas-text">文档解析</h2>
          <p className="mt-1 text-xs text-canvas-subtle">查看解析结构、引用与状态</p>
        </div>
        <button
          className="rounded-full border border-canvas-border/70 bg-canvas-panel p-2 text-canvas-muted transition hover:border-canvas-border hover:bg-canvas-panel/80 hover:text-canvas-text"
          onClick={onClose}
          aria-label="关闭文档抽屉"
        >
          ×
        </button>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="border-b border-canvas-border px-6 py-4">
          <p className="text-xs uppercase tracking-widest text-canvas-subtle">近期文档</p>
          <ul className="mt-3 space-y-2">
            {documents.map((doc) => (
              <li key={doc.id}>
                <button
                  onClick={() => setSelectedDoc(doc.id)}
                  className={`w-full rounded-xl px-4 py-3 text-left text-sm transition ${
                    selectedDoc === doc.id
                      ? 'border border-canvas-primary bg-canvas-primary text-white shadow-sm'
                      : 'border border-transparent bg-canvas-panel text-canvas-muted hover:border-canvas-border hover:bg-canvas-panel/80 hover:text-canvas-text'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span>{doc.title}</span>
                    <span className="text-xs text-canvas-subtle">{doc.status}</span>
                  </div>
                  <p className="mt-1 text-xs text-canvas-subtle">更新于 {doc.updatedAt}</p>
                </button>
              </li>
            ))}
          </ul>
        </div>

        {activeDoc ? (
          <div className="px-6 py-5">
            <h3 className="text-sm font-semibold text-canvas-text">{activeDoc.title}</h3>
            <div className="mt-3 space-y-3 rounded-2xl border border-canvas-border bg-canvas-panel p-4 text-xs text-canvas-muted">
              <p>• 解析章节：6</p>
              <p>• 引用片段：18</p>
              <p>• 最近引用：AI 行业趋势节点</p>
            </div>
            <button className="mt-4 w-full rounded-xl border border-canvas-border bg-canvas-surface px-4 py-2 text-sm text-canvas-text transition hover:bg-canvas-panel/60">
              跳转至引用
            </button>
          </div>
        ) : (
          <div className="flex h-40 flex-col items-center justify-center gap-2 px-6 text-center text-sm text-canvas-subtle">
            <p>选择左侧文档查看解析详情与引用。</p>
          </div>
        )}
      </div>
    </div>
  )
}
