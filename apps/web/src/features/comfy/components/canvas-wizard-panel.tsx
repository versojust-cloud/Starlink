'use client'

/**
 * In-canvas AI wizard panel (right-side drawer).
 *
 * Replaces the standalone /wizard page UX with an embedded panel so the
 * user can see their BMC canvas grow as they answer each of the 7
 * structured questions.
 *
 * Flow per step:
 *   1. AI asks a contextual question (initial question = step.description;
 *      subsequent = server-returned nextQuestion based on previous answer).
 *   2. User types answer; submit → processIdeationWizardStep mutation.
 *   3. Server returns extracted={kind,label,content} + nextQuestion.
 *   4. We createMacraNode(insight-note) immediately so the new node
 *      appears on the canvas. Layout's INSIGHT_X_SLOTS keep them
 *      tidy at the top strip without overlapping root or BMC cells.
 *   5. After step 7, we call startConversation with all stitched answers
 *      so the 8-agent pipeline generates the full BMC.
 *
 * Differences from /wizard standalone:
 *   - No full-page navigation; user keeps canvas context.
 *   - Each step's insight lands on canvas immediately (visual feedback).
 *   - Existing canvas tutorial overlay is unaffected — it explains
 *     UI mechanics, this panel asks substantive questions.
 */

import { useCallback, useState } from 'react'
import { ArrowLeft, ArrowRight, CheckCircle2, Sparkles, X } from 'lucide-react'
import { getGraphQLClient } from '@/shared/lib/graphql-client'
import { useComfyStore } from '../store'
import type { MacraNodeData } from '@/types/macra'

type WizardStepId =
  | 'core-idea' | 'customer-pain' | 'value-angle' | 'hypothesis'
  | 'validation' | 'revenue' | 'risk' | 'meta' | 'done'

const STEPS: ReadonlyArray<{
  id: WizardStepId
  label: string
  description: string
  sub: string
}> = [
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
  mutation StartConversationFromWizard($workspaceId: ID!, $question: String!) {
    startConversation(workspaceId: $workspaceId, question: $question, headless: true) {
      metadata { id }
    }
  }
`

interface ExtractedNode {
  kind: string
  label: string
  content: string
}

interface StepHistory {
  step: WizardStepId
  question: string
  answer: string
  extracted: ExtractedNode | null
}

interface Props {
  open: boolean
  onClose: () => void
  workspaceId: string
}

export function CanvasWizardPanel({ open, onClose, workspaceId }: Props) {
  const createMacraNode = useComfyStore((s) => s.createMacraNode)

  const [stepIndex, setStepIndex] = useState(0)
  const [answer, setAnswer] = useState('')
  const [history, setHistory] = useState<StepHistory[]>([])
  const [activeQuestion, setActiveQuestion] = useState<string>(STEPS[0].description)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)

  const currentStep = STEPS[stepIndex]
  const isLast = stepIndex === STEPS.length - 1
  const completedAll = history.length >= STEPS.length

  const handleSubmit = useCallback(async () => {
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
        }
      }>(PROCESS_WIZARD_STEP, {
        input: {
          step: currentStep.id,
          userAnswer: trimmedAnswer,
          canvas: { nodes: canvasNodes, edgeCount: 0 },
          recentChat,
          workspaceId,
        },
      })

      const result = response.processIdeationWizardStep

      // Drop the extracted insight onto the canvas immediately so the
      // user sees their BMC growing one step at a time. Layout assigns
      // it a slot in the insight strip via INSIGHT_X_SLOTS.
      if (result.extracted) {
        const nodeId = `insight-wizard-${currentStep.id}-${Date.now().toString(36)}`
        const macra: MacraNodeData = {
          id: nodeId,
          type: 'insight-note',
          label: result.extracted.label,
          content: result.extracted.content,
          summary: result.extracted.content.slice(0, 120),
          fullContent: result.extracted.content,
          metadata: {
            source: 'ideation-wizard',
            wizardStep: currentStep.id,
            wizardKind: result.extracted.kind,
          },
        }
        createMacraNode(macra)
      }

      const newEntry: StepHistory = {
        step: currentStep.id,
        question: activeQuestion,
        answer: trimmedAnswer,
        extracted: result.extracted,
      }
      const nextHistory = [...history, newEntry]
      setHistory(nextHistory)
      setAnswer('')
      setActiveQuestion(result.nextQuestion ?? STEPS[Math.min(stepIndex + 1, STEPS.length - 1)].description)

      if (isLast) {
        // Inline graduation — duplicated here (rather than calling
        // runGraduation) to keep useCallback's dep array tight. Both
        // paths share the same `START_CONVERSATION` mutation; if you
        // need to change the seed format, change BOTH places.
        setGenerating(true)
        try {
          const stitched = nextHistory
            .map((h, i) => `${i + 1}. ${STEPS[i]?.label ?? h.step}：${h.answer}`)
            .join('\n')
          const seed = `用户已通过 7 步向导描述了商业想法，请基于以下结构化输入生成完整 BMC：\n\n${stitched}`
          await client.request(START_CONVERSATION, { workspaceId, question: seed })
          setGenerating(false)
          onClose()
        } catch (gradErr) {
          const msg = gradErr instanceof Error ? gradErr.message : String(gradErr)
          setError(`BMC 生成失败：${msg.slice(0, 200)}`)
          setGenerating(false)
        }
      } else {
        setStepIndex(stepIndex + 1)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(`Step ${stepIndex + 1} 失败：${msg.slice(0, 200)}`)
    } finally {
      setSubmitting(false)
    }
  }, [currentStep, answer, submitting, stepIndex, isLast, history, activeQuestion, createMacraNode, workspaceId, onClose])

  // Hoisted helper so it can be invoked from the submit handler AND the
  // "生成完整 BMC" footer button without dragging into a useCallback dep
  // cycle.
  async function runGraduation(allHistory: StepHistory[]) {
    setGenerating(true)
    try {
      const stitched = allHistory
        .map((h, i) => `${i + 1}. ${STEPS[i]?.label ?? h.step}：${h.answer}`)
        .join('\n')
      const seed = `用户已通过 7 步向导描述了商业想法，请基于以下结构化输入生成完整 BMC：\n\n${stitched}`
      const client = getGraphQLClient()
      await client.request(START_CONVERSATION, { workspaceId, question: seed })
      // Stay on canvas — pipeline output will hydrate via subscription.
      setGenerating(false)
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(`BMC 生成失败：${msg.slice(0, 200)}`)
      setGenerating(false)
    }
  }

  // Symmetric alias so the footer "生成完整 BMC" button reads naturally.
  const graduateToBmc = (allHistory: StepHistory[]) => void runGraduation(allHistory)

  if (!open) return null

  return (
    <aside
      className="fixed right-0 top-0 bottom-0 z-30 w-[460px] max-w-[90vw] flex flex-col bg-paper shadow-[-2px_0_0_0_#1A1A1A,-12px_0_24px_-12px_rgba(0,0,0,0.18)]"
      aria-label="结构化向导"
    >
      <header className="flex items-center justify-between px-5 py-4 border-b-[1.5px] border-stratum-navy">
        <div className="min-w-0">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-stratum-blue">
            IDEATION WIZARD · 结构化向导
          </p>
          <h2 className="mt-1 font-display font-[800] text-[18px] tracking-tight text-stratum-navy">
            {completedAll ? '✓ 已收集 7 步' : `第 ${stepIndex + 1} 步 · ${currentStep?.label}`}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭"
          className="flex items-center justify-center h-8 w-8 rounded-full text-stratum-muted hover:text-stratum-navy hover:bg-stratum-surface-low transition-colors"
        >
          <X className="h-4 w-4" strokeWidth={1.5} />
        </button>
      </header>

      {/* Progress */}
      <div className="px-5 pt-3">
        <div className="flex items-center justify-between mb-1">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-stratum-muted">
            STEP {stepIndex + 1} / {STEPS.length}
          </span>
          <span className="font-mono text-[10px] tabular-nums text-stratum-muted">
            {Math.round(((completedAll ? STEPS.length : stepIndex) / STEPS.length) * 100)}%
          </span>
        </div>
        <div className="h-1 w-full bg-stratum-surface-low rounded-full overflow-hidden">
          <div
            className="h-full bg-stratum-blue transition-all"
            style={{
              width: `${((completedAll ? STEPS.length : stepIndex) / STEPS.length) * 100}%`,
            }}
          />
        </div>
        <div className="flex flex-wrap gap-1.5 mt-3">
          {STEPS.map((s, i) => (
            <span
              key={s.id}
              className={`font-body text-[10px] font-medium px-2 py-0.5 rounded-full transition-colors ${
                i === stepIndex
                  ? 'bg-stratum-navy text-white'
                  : i < history.length
                  ? 'bg-stratum-blue/10 text-stratum-blue'
                  : 'bg-stratum-surface-low text-stratum-muted'
              }`}
            >
              {i < history.length ? '✓ ' : ''}
              {s.label}
            </span>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {generating ? (
          <div className="flex flex-col items-center justify-center gap-3 py-12">
            <Sparkles className="h-10 w-10 text-stratum-blue" strokeWidth={1.75} fill="#89CEFF" />
            <h3 className="font-display font-[700] text-[18px] text-stratum-navy">
              8 个 agent 正在生成 BMC
            </h3>
            <p className="font-body text-[12px] text-stratum-muted text-center max-w-[320px]">
              已收集 7 步结构化答案；agent 协作中，画布将实时填充。
            </p>
          </div>
        ) : completedAll ? (
          <div className="rounded-xl border border-stratum-line bg-white p-5 text-center">
            <CheckCircle2 className="h-8 w-8 text-stratum-ok mx-auto mb-2" strokeWidth={1.5} />
            <p className="font-display font-[700] text-[16px] text-stratum-navy mb-1">
              7 步已完成
            </p>
            <p className="font-body text-[12px] text-stratum-muted leading-relaxed">
              你的答案已转成 7 个 insight 节点显示在画布上。<br />
              点下方按钮让 8 个 agent 用这些线索协作生成完整 BMC。
            </p>
          </div>
        ) : (
          <article className="rounded-xl border border-stratum-line bg-white p-5">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-stratum-blue">
              {currentStep?.sub ?? ''}
            </p>
            <h3 className="mt-1 font-display font-[700] text-[20px] tracking-tight text-stratum-navy">
              {currentStep?.label ?? ''}
            </h3>
            <p className="mt-2 font-body text-[13px] leading-relaxed text-stratum-ink">
              {activeQuestion}
            </p>
            <textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="详细一点说，多两句话比一句话好——细节让 AI 抽得更准"
              rows={5}
              disabled={submitting}
              className="mt-4 w-full resize-y rounded-lg border border-stratum-line bg-stratum-surface-low px-3 py-2.5 font-body text-[13px] leading-relaxed text-stratum-navy outline-none focus:border-stratum-blue focus:ring-2 focus:ring-stratum-blue/20"
            />
            {error ? (
              <div className="mt-2 rounded-lg border border-stratum-danger/40 bg-stratum-danger-wash/40 px-3 py-2 font-body text-[11px] text-stratum-danger">
                {error}
              </div>
            ) : null}
          </article>
        )}

        {/* History — show what's already on the canvas from this wizard */}
        {history.length > 0 && !generating ? (
          <section className="mt-5">
            <p className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-stratum-muted">
              已抽取 · {history.length} 节点
            </p>
            <ul className="space-y-1.5">
              {history.map((h, i) => (
                <li
                  key={i}
                  className="rounded-lg border border-stratum-line bg-white px-3 py-2"
                >
                  <div className="flex items-baseline justify-between gap-2 mb-0.5">
                    <span className="font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-stratum-blue">
                      {STEPS[i]?.sub ?? h.step}
                    </span>
                    {h.extracted ? (
                      <span className="font-display font-[700] text-[11px] text-stratum-navy truncate">
                        「{h.extracted.label}」
                      </span>
                    ) : null}
                  </div>
                  <p className="font-body text-[11px] leading-snug text-stratum-muted line-clamp-2">
                    {h.answer}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>

      {/* Footer */}
      <footer className="flex items-center justify-between gap-2 px-5 py-3 border-t-[0.5px] border-stratum-line bg-stratum-surface-low/50">
        <button
          type="button"
          onClick={() => {
            if (stepIndex > 0 && !submitting && !generating) {
              setStepIndex(stepIndex - 1)
              const prev = history[stepIndex - 1]
              if (prev) setAnswer(prev.answer)
            }
          }}
          disabled={stepIndex === 0 || submitting || generating || completedAll}
          className="inline-flex items-center gap-1 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-stratum-muted hover:text-stratum-navy disabled:opacity-30"
        >
          <ArrowLeft className="h-3 w-3" strokeWidth={1.75} />
          上一步
        </button>
        {completedAll && !generating ? (
          <button
            type="button"
            onClick={() => graduateToBmc(history)}
            className="inline-flex items-center gap-1.5 rounded-full bg-stratum-navy px-4 py-1.5 font-body text-[12px] font-bold text-white hover:bg-stratum-navy-soft transition-colors"
          >
            生成完整 BMC
            <Sparkles className="h-3.5 w-3.5" strokeWidth={2} fill="#89CEFF" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={!answer.trim() || submitting || generating}
            className="inline-flex items-center gap-1.5 rounded-full bg-stratum-navy px-4 py-1.5 font-body text-[12px] font-bold text-white hover:bg-stratum-navy-soft transition-colors disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting ? '抽取中…' : isLast ? '完成 → 生成 BMC' : '下一步'}
            {isLast ? (
              <Sparkles className="h-3.5 w-3.5" strokeWidth={2} fill="#89CEFF" />
            ) : (
              <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.75} />
            )}
          </button>
        )}
      </footer>
    </aside>
  )
}
