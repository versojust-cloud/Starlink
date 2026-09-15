'use client'

/**
 * 输入面板 — 三阶段交互的第一阶段。
 * 用户输入商业问题，选择知识库，开始分析。
 */

import { useState } from 'react'

interface InputPanelProps {
  onSubmit: (question: string, options: { knowledgeBaseId?: string }) => void
  isSubmitting: boolean
  knowledgeBases?: Array<{ id: string; name: string }>
}

export function InputPanel({ onSubmit, isSubmitting, knowledgeBases = [] }: InputPanelProps) {
  const [question, setQuestion] = useState('')
  const [selectedKb, setSelectedKb] = useState<string | undefined>()

  const examples = [
    '分析一家新能源汽车创业公司的商业模式可行性',
    '评估 SaaS 订阅模式在中国市场的适用性',
    '为跨境电商平台设计商业模型画布',
  ]

  return (
    <div className="flex flex-col items-center justify-center h-full px-8 max-w-2xl mx-auto">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-slate-100 mb-2">MACRA 商业分析</h1>
        <p className="text-sm text-slate-400">
          输入你的商业问题，6 个专业 AI Agent 将协同分析并生成 CC-BMC 画布
        </p>
      </div>

      {/* Input */}
      <div className="w-full space-y-4">
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="描述你想要分析的商业问题..."
          className="w-full h-32 bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 resize-none"
        />

        {/* Knowledge base selector */}
        {knowledgeBases.length > 0 && (
          <div>
            <label className="text-xs text-slate-400 mb-1 block">关联知识库（可选）</label>
            <select
              value={selectedKb ?? ''}
              onChange={(e) => setSelectedKb(e.target.value || undefined)}
              className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-slate-200"
            >
              <option value="">不使用知识库</option>
              {knowledgeBases.map((kb) => (
                <option key={kb.id} value={kb.id}>{kb.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Submit */}
        <button
          onClick={() => onSubmit(question, { knowledgeBaseId: selectedKb })}
          disabled={!question.trim() || isSubmitting}
          className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:text-slate-500 rounded-lg font-medium text-sm transition-colors"
        >
          {isSubmitting ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              分析中...
            </span>
          ) : (
            '开始分析'
          )}
        </button>
      </div>

      {/* Examples */}
      <div className="mt-8 w-full">
        <p className="text-xs text-slate-500 mb-2">示例问题：</p>
        <div className="space-y-2">
          {examples.map((ex) => (
            <button
              key={ex}
              onClick={() => setQuestion(ex)}
              className="w-full text-left text-xs text-slate-400 hover:text-slate-200 bg-slate-800/40 hover:bg-slate-800/80 border border-slate-800 rounded-lg px-3 py-2 transition-colors"
            >
              {ex}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
