'use client'

/**
 * QuizPanel — v2 brutalist style (P12 rewrite).
 *
 * Previous version used dark-theme tokens (`glass-effect`, `text-white`,
 * `text-slate-200/300/400`, amber gradients) which were near-invisible
 * on the BMC detail drawer's light bg-stratum-surface-low surface.
 *
 * Rewrite mirrors the rest of the v2 editorial drawer:
 *   - Stratum tokens: surface-low / line / ink / navy / muted / ok / danger
 *   - 1px or 0.5px hairline borders, no rounded-2xl
 *   - font-display for headers, font-instr for kickers, font-body for prose
 *   - Press red for active/incorrect, ok-wash green for correct
 *   - All text has explicit color so layout-level text-paper inheritance
 *     can never make options invisible
 */

import { useState } from 'react'
import { CheckCircle2, XCircle, Lightbulb, ArrowRight, RotateCcw, Sparkles } from 'lucide-react'

export type QuizQuestion = {
  id: string
  question: string
  options: string[]
  correctAnswer: number
  explanation: string
  difficulty: 'easy' | 'medium' | 'hard'
}

type QuizPanelProps = {
  nodeId: string
  nodeLabel: string
  domain: string
  onGenerateQuiz: () => Promise<QuizQuestion[]>
}

export function QuizPanel({ nodeId, nodeLabel, domain, onGenerateQuiz }: QuizPanelProps) {
  void nodeId
  const [questions, setQuestions] = useState<QuizQuestion[]>([])
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null)
  const [isAnswered, setIsAnswered] = useState(false)
  const [score, setScore] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const currentQuestion = questions[currentQuestionIndex]

  const handleGenerateQuiz = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const generatedQuestions = await onGenerateQuiz()
      setQuestions(generatedQuestions)
      setCurrentQuestionIndex(0)
      setSelectedAnswer(null)
      setIsAnswered(false)
      setScore(0)
      setShowResults(false)
    } catch (err) {
      console.error('生成 Quiz 失败:', err)
      setError(err instanceof Error ? err.message : '生成失败，请重试')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSelectAnswer = (optionIndex: number) => {
    if (isAnswered) return
    setSelectedAnswer(optionIndex)
  }

  const handleSubmitAnswer = () => {
    if (selectedAnswer === null) return
    setIsAnswered(true)
    if (selectedAnswer === currentQuestion.correctAnswer) {
      setScore(score + 1)
    }
  }

  const handleNextQuestion = () => {
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1)
      setSelectedAnswer(null)
      setIsAnswered(false)
    } else {
      setShowResults(true)
    }
  }

  const handleRestart = () => {
    setCurrentQuestionIndex(0)
    setSelectedAnswer(null)
    setIsAnswered(false)
    setScore(0)
    setShowResults(false)
  }

  const difficultyChip = (d: string) => {
    const map: Record<string, { label: string; cls: string }> = {
      easy: { label: 'EASY', cls: 'border-stratum-ok text-stratum-ok bg-stratum-ok-wash' },
      medium: { label: 'MEDIUM', cls: 'border-stratum-warn text-stratum-warn bg-stratum-warn/10' },
      hard: { label: 'HARD', cls: 'border-press text-press bg-press/10' }
    }
    const cfg = map[d] ?? map.medium
    return (
      <span className={`inline-flex items-center px-2 py-0.5 border-[1px] font-instr text-[9px] uppercase tracking-kicker ${cfg.cls}`}>
        {cfg.label}
      </span>
    )
  }

  // Empty state — no questions generated yet.
  if (questions.length === 0) {
    return (
      <div className="space-y-4">
        <div className="border-[1px] border-stratum-line bg-white px-5 py-7 text-center">
          <div className="w-10 h-10 border-[1.5px] border-stratum-navy bg-stratum-navy text-white flex items-center justify-center mx-auto mb-4">
            <Sparkles className="w-4 h-4" strokeWidth={1.75} />
          </div>
          <h3 className="font-display font-[700] text-[15px] text-stratum-navy mb-2">
            AI 智能问答
          </h3>
          <p className="text-[12px] leading-[1.6] text-stratum-ink mb-5">
            基于 <span className="font-semibold text-stratum-navy">{nodeLabel}</span> 的内容，AI 为你生成
            <span className="font-semibold text-stratum-navy"> {domain || '该维度'} </span>
            的定制化问答题。
          </p>
          <button
            onClick={handleGenerateQuiz}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-stratum-navy text-white font-instr text-[10px] uppercase tracking-kicker hover:bg-stratum-navy-soft disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? (
              <>
                <RotateCcw className="w-3 h-3 animate-spin" strokeWidth={1.75} />
                AI 生成中…
              </>
            ) : (
              <>
                <Sparkles className="w-3 h-3" strokeWidth={1.75} />
                生成 Quiz
              </>
            )}
          </button>
          {error ? (
            <p className="mt-4 font-instr text-[10px] uppercase tracking-kicker text-press">
              ⚠ {error}
            </p>
          ) : null}
        </div>
      </div>
    )
  }

  // Results screen.
  if (showResults) {
    const percentage = Math.round((score / questions.length) * 100)
    const isPassed = percentage >= 70

    return (
      <div className="space-y-4">
        <div className="border-[1px] border-stratum-line bg-white px-5 py-7 text-center">
          <div
            className={`w-12 h-12 border-[1.5px] flex items-center justify-center mx-auto mb-3 ${
              isPassed
                ? 'border-stratum-ok bg-stratum-ok-wash text-stratum-ok'
                : 'border-stratum-danger bg-stratum-danger-wash text-stratum-danger'
            }`}
          >
            {isPassed ? (
              <CheckCircle2 className="w-6 h-6" strokeWidth={1.5} />
            ) : (
              <XCircle className="w-6 h-6" strokeWidth={1.5} />
            )}
          </div>
          <h3 className="font-display font-[700] text-[16px] text-stratum-navy mb-1">
            {isPassed ? '恭喜通过！' : '继续加油！'}
          </h3>
          <p className="font-display font-[800] text-[28px] tabular-nums text-stratum-navy mb-1 leading-none">
            {score} / {questions.length}
          </p>
          <p className="font-instr text-[10px] uppercase tracking-kicker text-stratum-muted mb-5">
            正确率 {percentage}%
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleRestart}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 border-[1px] border-stratum-line bg-transparent text-stratum-navy hover:bg-stratum-surface-low font-instr text-[10px] uppercase tracking-kicker transition-colors"
            >
              <RotateCcw className="w-3 h-3" strokeWidth={1.75} />
              重新测试
            </button>
            <button
              onClick={handleGenerateQuiz}
              disabled={isLoading}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-stratum-navy text-white hover:bg-stratum-navy-soft font-instr text-[10px] uppercase tracking-kicker disabled:opacity-40 transition-colors"
            >
              <Sparkles className="w-3 h-3" strokeWidth={1.75} />
              生成新题
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Question screen.
  return (
    <div className="space-y-4">
      {/* Progress bar */}
      <div className="border-[1px] border-stratum-line bg-white px-3 py-2.5">
        <div className="flex items-center justify-between mb-1.5">
          <span className="font-instr text-[10px] uppercase tracking-kicker text-stratum-muted tabular-nums">
            问题 {currentQuestionIndex + 1} / {questions.length}
          </span>
          <span className="font-instr text-[10px] uppercase tracking-kicker text-stratum-navy tabular-nums">
            得分 {score}
          </span>
        </div>
        <div className="h-1.5 bg-stratum-surface-low border-[0.5px] border-stratum-line overflow-hidden">
          <div
            className="h-full bg-stratum-navy transition-all duration-500"
            style={{ width: `${((currentQuestionIndex + 1) / questions.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Question card */}
      <div className="border-[1px] border-stratum-line bg-white px-4 py-4">
        <div className="flex items-center justify-between mb-3">
          {difficultyChip(currentQuestion.difficulty)}
        </div>

        <h3 className="font-display font-[700] text-[14px] leading-[1.5] text-stratum-navy mb-4">
          {currentQuestion.question}
        </h3>

        <div className="space-y-2">
          {currentQuestion.options.map((option, index) => {
            const isSelected = selectedAnswer === index
            const isCorrect = index === currentQuestion.correctAnswer
            const showResult = isAnswered

            let buttonClass = 'border-stratum-line bg-white hover:bg-stratum-surface-low text-stratum-ink'
            if (showResult) {
              if (isCorrect) {
                buttonClass = 'border-stratum-ok bg-stratum-ok-wash text-stratum-ink'
              } else if (isSelected && !isCorrect) {
                buttonClass = 'border-press bg-press/10 text-stratum-ink'
              } else {
                buttonClass = 'border-stratum-line bg-white text-stratum-muted opacity-70'
              }
            } else if (isSelected) {
              buttonClass = 'border-stratum-navy bg-stratum-surface-low text-stratum-ink'
            }

            return (
              <button
                key={index}
                onClick={() => handleSelectAnswer(index)}
                disabled={isAnswered}
                className={`w-full text-left px-3 py-2.5 border-[1px] transition-colors ${buttonClass} ${
                  isAnswered ? 'cursor-default' : 'cursor-pointer'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[12.5px] leading-[1.4] flex-1">{option}</span>
                  {showResult && isCorrect && (
                    <CheckCircle2 className="w-4 h-4 text-stratum-ok flex-shrink-0" strokeWidth={1.5} />
                  )}
                  {showResult && isSelected && !isCorrect && (
                    <XCircle className="w-4 h-4 text-press flex-shrink-0" strokeWidth={1.5} />
                  )}
                </div>
              </button>
            )
          })}
        </div>

        {/* Explanation (after answer) */}
        {isAnswered && (
          <div className="mt-4 px-3 py-2.5 border-[1px] border-stratum-blue/30 bg-stratum-blue/5">
            <div className="flex items-start gap-2">
              <Lightbulb className="w-3.5 h-3.5 text-stratum-blue mt-0.5 flex-shrink-0" strokeWidth={1.75} />
              <div>
                <p className="font-instr text-[10px] uppercase tracking-kicker text-stratum-blue mb-1">
                  解释
                </p>
                <p className="text-[12.5px] leading-[1.55] text-stratum-ink">
                  {currentQuestion.explanation}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="mt-4 flex gap-2">
          {!isAnswered ? (
            <button
              onClick={handleSubmitAnswer}
              disabled={selectedAnswer === null}
              className="flex-1 px-4 py-2 bg-stratum-navy text-white font-instr text-[10px] uppercase tracking-kicker hover:bg-stratum-navy-soft disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              提交答案
            </button>
          ) : (
            <button
              onClick={handleNextQuestion}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-stratum-ok text-white font-instr text-[10px] uppercase tracking-kicker hover:bg-stratum-ok/90 transition-colors"
            >
              {currentQuestionIndex < questions.length - 1 ? '下一题' : '查看结果'}
              <ArrowRight className="w-3 h-3" strokeWidth={1.75} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
