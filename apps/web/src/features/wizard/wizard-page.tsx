'use client'

/**
 * Mode C · Ideation Wizard — 7-step structured interview that extracts
 * one BMC building block per step. After the last step, navigates to
 * /canvas with kbId-equivalent context for full BMC generation.
 *
 * Steps (server-side WIZARD_STEP_ORDER):
 *   1. core-idea       核心想法
 *   2. customer-pain   客户痛点
 *   3. value-angle     价值切入
 *   4. hypothesis      关键假设
 *   5. validation      验证渠道
 *   6. revenue         收入模式
 *   7. risk            主要风险
 *   (8. meta — reflection / 9. done — terminal)
 *
 * For each step, the server returns extracted={kind,label,content} +
 * the next question. We accumulate extracted nodes locally and at
 * 'done' transition fire startConversation with all wizard answers
 * stitched into the seed.
 */

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, CheckCircle2, Sparkles } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { getGraphQLClient } from '@/shared/lib/graphql-client'

/**
 * Lightweight markdown renderer for wizard prompts and answers.
 * Supports GFM tables / strikethrough / task lists. Tightly scoped
 * styling so it slots cleanly into the wizard reading band.
 */
const WIZARD_MD_COMPONENTS = {
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
    <strong className="font-semibold text-stratum-navy">{children}</strong>
  ),
  em: ({ children }: { children?: React.ReactNode }) => (
    <em className="italic">{children}</em>
  ),
  code: ({ children }: { children?: React.ReactNode }) => (
    <code className="font-mono text-[12px] bg-stratum-surface-low text-stratum-navy px-1 py-0.5 border border-stratum-line rounded-[2px]">{children}</code>
  ),
  table: ({ children }: { children?: React.ReactNode }) => (
    <div className="my-3 overflow-x-auto rounded-[2px] border border-stratum-line bg-white">
      <table className="w-full border-collapse text-[12px] leading-[1.55] tabular-nums">{children}</table>
    </div>
  ),
  thead: ({ children }: { children?: React.ReactNode }) => (
    <thead className="bg-stratum-surface-low border-b-[1.5px] border-stratum-navy">{children}</thead>
  ),
  tr: ({ children }: { children?: React.ReactNode }) => (
    <tr className="border-b-[0.5px] border-stratum-line last:border-b-0 hover:bg-stratum-surface-low/40 transition-colors">{children}</tr>
  ),
  th: ({ children }: { children?: React.ReactNode }) => (
    <th className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-stratum-muted text-left px-2.5 py-1.5 whitespace-nowrap">{children}</th>
  ),
  td: ({ children }: { children?: React.ReactNode }) => (
    <td className="px-2.5 py-1.5 text-stratum-ink align-top">{children}</td>
  ),
}

const DEFAULT_WORKSPACE_ID = 'proj-001'

type WizardStepId = 'core-idea' | 'customer-pain' | 'value-angle' | 'hypothesis' | 'validation' | 'revenue' | 'risk' | 'meta' | 'done'

const STEPS: ReadonlyArray<{ id: WizardStepId; label: string; description: string; sub: string }> = [
  { id: 'core-idea',     label: '核心想法',  description: '一句话讲清你想做什么', sub: 'CORE IDEA' },
  { id: 'customer-pain', label: '客户痛点',  description: '谁在为什么具体的问题挣扎', sub: 'CUSTOMER PAIN' },
  { id: 'value-angle',   label: '价值切入',  description: '你独特的价值是什么、为什么是你', sub: 'VALUE ANGLE' },
  { id: 'hypothesis',    label: '关键假设',  description: '验证之前必须先成立的前提', sub: 'HYPOTHESIS' },
  { id: 'validation',    label: '验证渠道',  description: '怎么以最小成本验证假设是真的', sub: 'VALIDATION' },
  { id: 'revenue',       label: '收入模式',  description: '钱从哪来、最早愿付费的一种人', sub: 'REVENUE' },
  { id: 'risk',          label: '主要风险',  description: '最可能让这事失败的 1-2 件事', sub: 'RISK' },
]

const PROCESS_WIZARD_STEP = /* GraphQL */ `
  mutation ProcessWizardStep($input: ProcessIdeationWizardStepInput!) {
    processIdeationWizardStep(input: $input) {
      extracted { kind label content }
      nextQuestion
      nextStep
      source
      latencyMs
    }
  }
`

const START_CONVERSATION = /* GraphQL */ `
  mutation Start($workspaceId: ID!, $question: String!) {
    startConversation(workspaceId: $workspaceId, question: $question) {
      metadata { id status }
    }
  }
`

type ExtractedNode = { kind: string; label: string; content: string }

type StepHistory = {
  step: WizardStepId
  question: string
  answer: string
  extracted: ExtractedNode | null
}

export function WizardPage() {
  const [stepIndex, setStepIndex] = useState(0)
  const [answer, setAnswer] = useState('')
  const [history, setHistory] = useState<StepHistory[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)

  const currentStep = STEPS[stepIndex]
  const isLast = stepIndex === STEPS.length - 1
  const completedAll = stepIndex >= STEPS.length

  // First-step prompt is the step.description; subsequent steps the server returns nextQuestion
  const [activeQuestion, setActiveQuestion] = useState<string>(STEPS[0].description)

  useEffect(() => {
    if (!currentStep) return
    // If history has an entry for previous step, currentQuestion was set
    // by server response. Otherwise (first step) use step.description.
    if (history.length === 0) {
      setActiveQuestion(STEPS[0].description)
    }
  }, [currentStep, history.length])

  const handleSubmitStep = useCallback(async () => {
    if (!currentStep || !answer.trim() || submitting) return
    setSubmitting(true)
    setError(null)
    const trimmedAnswer = answer.trim()

    try {
      const client = getGraphQLClient()
      const recentChat = history.flatMap((h) => [
        { role: 'ai', content: h.question },
        { role: 'user', content: h.answer },
      ])
      const canvasNodes = history
        .filter((h) => h.extracted)
        .map((h) => ({
          id: `${h.step}-${Date.now()}`,
          kind: h.extracted!.kind,
          label: h.extracted!.label,
          content: h.extracted!.content,
        }))

      const response = await client.request<{
        processIdeationWizardStep: {
          extracted: ExtractedNode
          nextQuestion: string
          nextStep: string
          source: string
          latencyMs?: number
        }
      }>(PROCESS_WIZARD_STEP, {
        input: {
          step: currentStep.id,
          userAnswer: trimmedAnswer,
          canvas: {
            nodes: canvasNodes,
            edgeCount: 0,
          },
          recentChat,
          workspaceId: DEFAULT_WORKSPACE_ID,
        },
      })

      const result = response.processIdeationWizardStep
      const newEntry: StepHistory = {
        step: currentStep.id,
        question: activeQuestion,
        answer: trimmedAnswer,
        extracted: result.extracted,
      }
      const nextHistory = [...history, newEntry]
      setHistory(nextHistory)
      setAnswer('')
      setActiveQuestion(result.nextQuestion)

      if (isLast) {
        // Wizard complete — kick off BMC generation with stitched answers
        await graduateToBmc(nextHistory)
      } else {
        setStepIndex(stepIndex + 1)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(`Step ${stepIndex + 1} 失败：${msg.slice(0, 200)}`)
    } finally {
      setSubmitting(false)
    }
  }, [currentStep, answer, submitting, stepIndex, isLast, history, activeQuestion])

  const graduateToBmc = async (allHistory: StepHistory[]) => {
    setGenerating(true)
    try {
      const stitched = allHistory
        .map((h, i) => `${i + 1}. ${STEPS[i]?.label ?? h.step}：${h.answer}`)
        .join('\n')
      const seed = `用户已通过 7 步向导描述了商业想法，请基于以下结构化输入生成完整 BMC：\n\n${stitched}`
      const client = getGraphQLClient()
      await client.request(START_CONVERSATION, {
        workspaceId: DEFAULT_WORKSPACE_ID,
        question: seed,
      })
      // Navigate to canvas where pipeline output will hydrate
      if (typeof window !== 'undefined') {
        window.location.href = `/canvas/${encodeURIComponent(DEFAULT_WORKSPACE_ID)}`
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(`BMC 生成失败：${msg.slice(0, 200)}`)
      setGenerating(false)
    }
  }

  if (completedAll && generating) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stratum-surface">
        <div className="rounded-2xl bg-white border border-stratum-line shadow-2xl px-8 py-7 max-w-[420px] flex flex-col items-center gap-4">
          <Sparkles className="h-10 w-10 text-stratum-blue" strokeWidth={1.75} fill="#89CEFF" />
          <h2 className="font-display font-[700] text-[22px] tracking-tight text-stratum-navy">
            8 个 agent 正在生成 BMC
          </h2>
          <p className="font-body text-[12px] leading-relaxed text-stratum-muted text-center">
            已收集 7 步结构化答案。即将跳转到画布查看实时生成…
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-stratum-surface">
      <header className="bg-white border-b border-stratum-line">
        <div className="max-w-[760px] mx-auto px-8 py-4 flex items-center justify-between">
          <Link href="/chat" className="flex items-center gap-1.5 text-stratum-muted hover:text-stratum-navy transition-colors">
            <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
            <span className="font-body text-[12px] font-medium">回主页</span>
          </Link>
          <div className="text-right">
            <p className="font-body text-[10px] font-semibold uppercase tracking-[0.18em] text-stratum-blue">
              IDEATION WIZARD · 结构化向导
            </p>
            <h1 className="mt-0.5 font-display font-[700] text-[18px] tracking-tight text-stratum-navy">
              7 步说清你的商业想法
            </h1>
          </div>
        </div>
      </header>

      <main className="max-w-[760px] mx-auto px-8 py-10">
        {/* Progress bar */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <p className="font-body text-[10px] font-semibold uppercase tracking-[0.18em] text-stratum-muted">
              STEP {stepIndex + 1} / {STEPS.length}
            </p>
            <p className="font-body text-[10px] tabular-nums text-stratum-muted">
              {Math.round(((stepIndex + 1) / STEPS.length) * 100)}%
            </p>
          </div>
          <div className="h-1 w-full rounded-full bg-stratum-line overflow-hidden">
            <div
              className="h-full bg-stratum-blue transition-all duration-500"
              style={{ width: `${((stepIndex + 1) / STEPS.length) * 100}%` }}
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {STEPS.map((s, i) => (
              <span
                key={s.id}
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-body text-[10px] font-semibold ${
                  i < stepIndex
                    ? 'bg-stratum-ok-wash text-stratum-ok'
                    : i === stepIndex
                      ? 'bg-stratum-navy text-white'
                      : 'bg-stratum-surface-low text-stratum-muted'
                }`}
              >
                {i < stepIndex ? <CheckCircle2 className="h-2.5 w-2.5" strokeWidth={2.5} /> : null}
                {s.label}
              </span>
            ))}
          </div>
        </div>

        {/* Current step card */}
        <article className="rounded-2xl bg-white border border-stratum-line shadow-md p-7">
          <p className="font-body text-[10px] font-bold uppercase tracking-[0.18em] text-stratum-blue">
            {currentStep?.sub ?? ''}
          </p>
          <h2 className="mt-2 font-display font-[700] text-[28px] leading-tight tracking-tight text-stratum-navy">
            {currentStep?.label ?? ''}
          </h2>
          <div className="mt-3 font-body text-[14px] leading-relaxed text-stratum-ink">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={WIZARD_MD_COMPONENTS}>
              {activeQuestion}
            </ReactMarkdown>
          </div>

          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="详细一点说，多两句话比一句话好——细节让 AI 抽得更准"
            rows={5}
            className="mt-5 w-full resize-y rounded-xl border border-stratum-line bg-stratum-surface-low px-4 py-3 font-body text-[13px] leading-relaxed text-stratum-navy outline-none focus:border-stratum-blue focus:ring-2 focus:ring-stratum-blue/20"
            disabled={submitting}
          />

          {error ? (
            <div className="mt-3 rounded-lg border border-stratum-danger/40 bg-stratum-danger-wash/40 px-3 py-2 font-body text-[12px] text-stratum-danger">
              {error}
            </div>
          ) : null}

          <div className="mt-5 flex items-center justify-between">
            <button
              type="button"
              onClick={() => {
                if (stepIndex > 0) {
                  setStepIndex(stepIndex - 1)
                  // Restore previous answer
                  const prev = history[stepIndex - 1]
                  if (prev) setAnswer(prev.answer)
                  setHistory(history.slice(0, -1))
                }
              }}
              disabled={stepIndex === 0 || submitting}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 font-body text-[11px] font-semibold text-stratum-muted hover:text-stratum-navy disabled:cursor-not-allowed disabled:opacity-30 transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
              上一步
            </button>
            <button
              type="button"
              onClick={() => void handleSubmitStep()}
              disabled={!answer.trim() || submitting}
              className="inline-flex items-center gap-1.5 rounded-full bg-stratum-navy px-4 py-2 font-body text-[12px] font-bold text-white hover:bg-stratum-navy-soft transition-colors disabled:cursor-not-allowed disabled:opacity-40"
            >
              {submitting ? '提交中…' : isLast ? '完成 → 生成 BMC' : '下一步'}
              {isLast ? (
                <Sparkles className="h-3.5 w-3.5 text-stratum-sky" strokeWidth={2} fill="#89CEFF" />
              ) : (
                <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.75} />
              )}
            </button>
          </div>
        </article>

        {/* Past answers list */}
        {history.length > 0 ? (
          <section className="mt-8">
            <p className="mb-3 font-body text-[10px] font-semibold uppercase tracking-[0.18em] text-stratum-muted">
              已完成 · {history.length} 步
            </p>
            <ul className="space-y-2">
              {history.map((h, i) => (
                <li key={i} className="rounded-lg border border-stratum-line bg-white px-4 py-3">
                  <div className="flex items-baseline justify-between gap-2 mb-1">
                    <p className="font-body text-[10px] font-semibold uppercase tracking-[0.18em] text-stratum-blue">
                      Step {i + 1} · {STEPS[i]?.label}
                    </p>
                    {h.extracted ? (
                      <span className="font-body text-[10px] tabular-nums text-stratum-muted">
                        {h.extracted.kind}
                      </span>
                    ) : null}
                  </div>
                  <div className="font-body text-[12px] leading-relaxed text-stratum-ink">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={WIZARD_MD_COMPONENTS}>
                      {h.answer}
                    </ReactMarkdown>
                  </div>
                  {h.extracted ? (
                    <div className="mt-1.5 font-body text-[11px] leading-relaxed text-stratum-muted italic">
                      <span className="not-italic font-semibold text-stratum-blue">AI 抽出 →「{h.extracted.label}」</span>
                      <div className="mt-0.5">
                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={WIZARD_MD_COMPONENTS}>
                          {h.extracted.content}
                        </ReactMarkdown>
                      </div>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </main>
    </div>
  )
}
