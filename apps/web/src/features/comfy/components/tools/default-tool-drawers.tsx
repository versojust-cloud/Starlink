'use client'

import { useState, type ReactNode } from 'react'
import { Bot, BookOpenCheck, Languages, Loader2, Microscope, Play, UsersRound } from 'lucide-react'
import { useComfyStore } from '../../store'
import type { ToolDescriptor } from '../../registries/tool-registry'
import { useToolRunner } from './use-tool-runner'

type ToolDrawerBodyProps = {
  tool: ToolDescriptor
}

type ResearchResult = {
  summary: string
  keyPoints: string[]
  sources: string[]
  detailedAnalysis: string
  recommendations?: string[]
}

type TranslateResult = {
  translation: string
  detectedSourceLanguage?: string
  model?: string
}

type KnowledgeResult = {
  kbId: string
  kbName: string
  query: string
  results: Array<{
    docId: string
    snippet: string
    score: number
    metadata?: Record<string, unknown>
  }>
  evidenceCount: number
  selectedNodeCount: number
  summary: string
}

type ExpertsResult = {
  selectedNodeCount: number
  summary: string
}

function ToolRunButton({
  tool,
  label,
  disabled,
  input,
  summarize
}: {
  tool: ToolDescriptor
  label: string
  disabled?: boolean
  input: unknown
  summarize?: (result: unknown) => string
}) {
  const runState = useComfyStore((state) => state.toolRunStates[tool.id])
  const runTool = useToolRunner(tool, { summarize })
  const isRunning = runState?.status === 'running'

  return (
    <button
      type="button"
      onClick={() => void runTool(input)}
      disabled={disabled || isRunning}
      className="flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-black text-slate-950 shadow-lg shadow-white/10 transition hover:-translate-y-0.5 hover:bg-slate-100 disabled:translate-y-0 disabled:opacity-50"
    >
      {isRunning ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Play className="h-4 w-4" />
      )}
      {isRunning ? '执行中...' : label}
    </button>
  )
}

function ResultStrip({ tool }: { tool: ToolDescriptor }) {
  const runState = useComfyStore((state) => state.toolRunStates[tool.id])

  if (!runState || runState.status === 'idle') return null

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-3">
      <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-500">Execution State</p>
      <p className="mt-1 text-sm font-semibold text-white">
        {runState.status === 'running'
          ? '工具正在执行'
          : runState.status === 'completed'
            ? '工具已完成'
            : '工具执行失败'}
      </p>
      {runState.resultSummary && (
        <p className="mt-1 text-xs leading-relaxed text-slate-400">{runState.resultSummary}</p>
      )}
      {runState.error && (
        <p className="mt-2 rounded-xl border border-rose-300/20 bg-rose-400/10 px-3 py-2 text-xs text-rose-100">
          {runState.error}
        </p>
      )}
    </div>
  )
}

export function KnowledgeToolDrawer({ tool }: ToolDrawerBodyProps) {
  const [query, setQuery] = useState('')
  const knowledgeEvidence = useComfyStore((state) => state.knowledgeEvidence)
  const selectedCount = useComfyStore((state) => state.nodes.filter((node) => node.selected).length)
  const runState = useComfyStore((state) => state.toolRunStates[tool.id])
  const result = runState?.result as KnowledgeResult | null | undefined

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <MetricCard label="Evidence" value={knowledgeEvidence.length} />
        <MetricCard label="Selected" value={selectedCount} />
      </div>

      <div className="rounded-3xl border border-cyan-300/15 bg-cyan-400/[0.07] p-4">
        <div className="mb-3 flex items-center gap-2 text-cyan-100">
          <BookOpenCheck className="h-4 w-4" />
          <span className="text-sm font-bold">知识召回工作流</span>
        </div>
        <div className="space-y-2 text-xs leading-relaxed text-slate-300">
          <p>1. 选择当前 workspace 的 ready 知识库。</p>
          <p>2. 对问题做 RAG 检索，召回 chunk 级证据。</p>
          <p>3. 将证据写入 store，并生成画布 evidence 节点。</p>
        </div>
        <textarea
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="输入要检索的问题，例如：目标市场的政策风险..."
          className="mt-4 h-28 w-full resize-none rounded-2xl border border-white/10 bg-slate-950/35 px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-cyan-300/50 focus:ring-2 focus:ring-cyan-300/20"
        />
      </div>

      <ToolRunButton
        tool={tool}
        label="检索知识库"
        disabled={!query.trim()}
        input={{ query, topK: 5 }}
        summarize={(value) => (value as KnowledgeResult).summary}
      />
      <ResultStrip tool={tool} />

      {result && (
        <ResultCard title="Knowledge Brief">
          <p>{result.summary}</p>
          <div className="mt-3 space-y-2">
            {result.results.slice(0, 4).map((item, index) => (
              <p key={`${item.docId}-${index}`} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                {item.snippet}
              </p>
            ))}
          </div>
        </ResultCard>
      )}
    </div>
  )
}

export function ResearchToolDrawer({ tool }: ToolDrawerBodyProps) {
  const [query, setQuery] = useState('')
  const runState = useComfyStore((state) => state.toolRunStates[tool.id])
  const result = runState?.result as ResearchResult | null | undefined

  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-sky-300/15 bg-sky-400/[0.07] p-4">
        <div className="mb-3 flex items-center gap-2 text-sky-100">
          <Microscope className="h-4 w-4" />
          <span className="text-sm font-bold">研究任务 Brief</span>
        </div>
        <textarea
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="输入研究问题，例如：欧盟文化科技市场机会..."
          className="h-32 w-full resize-none rounded-2xl border border-white/10 bg-slate-950/35 px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-sky-300/50 focus:ring-2 focus:ring-sky-300/20"
        />
      </div>

      <ToolRunButton
        tool={tool}
        label="运行深度研究"
        disabled={!query.trim()}
        input={{
          query,
          researchType: 'comprehensive',
          depth: 'medium',
          sources: ['academic', 'news'],
          language: 'zh'
        }}
        summarize={(value) => (value as ResearchResult).summary}
      />
      <ResultStrip tool={tool} />

      {result && (
        <ResultCard title="Research Output">
          <p className="font-semibold text-white">{result.summary}</p>
          <div className="mt-3 space-y-2">
            {result.keyPoints?.slice(0, 4).map((point, index) => (
              <p key={`${point}-${index}`} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                {point}
              </p>
            ))}
          </div>
        </ResultCard>
      )}
    </div>
  )
}

export function TranslateToolDrawer({ tool }: ToolDrawerBodyProps) {
  const [source, setSource] = useState('')
  const [targetLanguage, setTargetLanguage] = useState('en')
  const runState = useComfyStore((state) => state.toolRunStates[tool.id])
  const result = runState?.result as TranslateResult | null | undefined

  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-amber-300/15 bg-amber-400/[0.08] p-4">
        <div className="mb-3 flex items-center gap-2 text-amber-100">
          <Languages className="h-4 w-4" />
          <span className="text-sm font-bold">翻译卡片草稿</span>
        </div>
        <div className="mb-3 grid grid-cols-3 gap-2">
          {[
            { label: 'English', value: 'en' },
            { label: 'Deutsch', value: 'de' },
            { label: 'Français', value: 'fr' }
          ].map((language) => (
            <button
              key={language.value}
              type="button"
              onClick={() => setTargetLanguage(language.value)}
              className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                targetLanguage === language.value
                  ? 'border-amber-300/50 bg-amber-300/15 text-white'
                  : 'border-white/10 bg-white/5 text-slate-400 hover:text-white'
              }`}
            >
              {language.label}
            </button>
          ))}
        </div>
        <textarea
          value={source}
          onChange={(event) => setSource(event.target.value)}
          placeholder="粘贴要翻译的卡片内容..."
          className="h-32 w-full resize-none rounded-2xl border border-white/10 bg-slate-950/35 px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-amber-300/50 focus:ring-2 focus:ring-amber-300/20"
        />
      </div>

      <ToolRunButton
        tool={tool}
        label="运行翻译"
        disabled={!source.trim()}
        input={{
          text: source,
          sourceLanguage: 'auto',
          targetLanguage,
          mode: 'professional'
        }}
        summarize={(value) => `已生成翻译：${(value as TranslateResult).translation.slice(0, 64)}`}
      />
      <ResultStrip tool={tool} />

      {result?.translation && (
        <ResultCard title="Translation">
          <p className="whitespace-pre-wrap">{result.translation}</p>
        </ResultCard>
      )}
    </div>
  )
}

export function ExpertsToolDrawer({ tool }: ToolDrawerBodyProps) {
  const selectedCount = useComfyStore((state) => state.nodes.filter((node) => node.selected).length)
  const runState = useComfyStore((state) => state.toolRunStates[tool.id])
  const result = runState?.result as ExpertsResult | null | undefined
  const experts = [
    { icon: Bot, name: '市场专家', detail: '需求、竞品、进入策略' },
    { icon: UsersRound, name: '文化专家', detail: '语境、符号、受众差异' },
    { icon: Microscope, name: '研究专家', detail: '证据、趋势、引用质量' }
  ]

  return (
    <div className="space-y-4">
      <div className="grid gap-3">
        {experts.map((expert) => {
          const Icon = expert.icon
          return (
            <div key={expert.name} className="rounded-3xl border border-emerald-300/15 bg-emerald-400/[0.07] p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-emerald-300/20 bg-emerald-400/15">
                  <Icon className="h-4 w-4 text-emerald-100" />
                </div>
                <div>
                  <p className="text-sm font-bold text-white">{expert.name}</p>
                  <p className="mt-1 text-xs text-slate-400">{expert.detail}</p>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <MetricCard label="Selected Nodes" value={selectedCount} />
      <ToolRunButton
        tool={tool}
        label="召集专家审阅"
        input={{}}
        summarize={(value) => (value as ExpertsResult).summary}
      />
      <ResultStrip tool={tool} />

      {result && (
        <ResultCard title="Expert Review">
          <p>{result.summary}</p>
        </ResultCard>
      )}
    </div>
  )
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.06] px-4 py-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-black text-white">{value}</p>
    </div>
  )
}

function ResultCard({
  title,
  children
}: {
  title: string
  children: ReactNode
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-slate-950/35 p-4 text-xs leading-relaxed text-slate-300">
      <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.24em] text-slate-500">{title}</p>
      {children}
    </div>
  )
}
