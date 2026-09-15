'use client'

import { useEffect, useRef } from 'react'
import { Send, User, Wand2, X } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { TOKENS } from '@/features/comfy/components/canvas-design-tokens'
import {
  useIdeationStore,
  type ChatMessage,
  type IdeationMode
} from '../store/ideation-store'
import {
  TOTAL_STEPS,
  stepIndex,
  type StepId
} from '../conversation/ideation-conversation-engine'
import type { ScaffoldKind } from '../conversation/coach-engine'
import { StarlinkGlyph } from './starlink-glyph'

/**
 * Right-rail chat panel — Meflex-style scaffolded coach.
 *
 * Mode 1 ("Coach", default): AI watches the canvas, emits reflection prompts
 *   in this panel without auto-creating nodes. The user has full agency.
 *
 * Mode 2 ("Wizard"): scripted 7-waypoint ideation flow — each user answer
 *   commits a new node on the canvas with edges between successive steps.
 *   After step 7 the panel auto-falls-back to coach mode.
 *
 * Visual treatment is "navigator's coaching console":
 *   - AI bubbles carry a small monospace SCAFFOLD tag (WHY / EVIDENCE / META)
 *     so the user can scan the *kind* of coaching at a glance
 *   - Wizard progress is a horizontal waypoint metro-map with named labels
 *     (CORE → PAIN → VALUE → … ) instead of a generic percentage bar
 */

export function IdeationChatPanel() {
  const messages = useIdeationStore((s) => s.chatMessages)
  const draft = useIdeationStore((s) => s.chatDraft)
  const setDraft = useIdeationStore((s) => s.setChatDraft)
  const submit = useIdeationStore((s) => s.submitChatMessage)
  const mode = useIdeationStore((s) => s.mode)
  const wizardStep = useIdeationStore((s) => s.wizardStep)
  const startWizard = useIdeationStore((s) => s.startWizard)
  const exitWizard = useIdeationStore((s) => s.exitWizard)
  const coachThinking = useIdeationStore((s) => s.coachThinking)

  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [messages.length, coachThinking])

  return (
    <aside className="flex w-[420px] shrink-0 flex-col border-l border-white/[0.06] bg-slate-950/40 backdrop-blur-xl">
      {/* Header + mode toggle ----------------------------------------------- */}
      <header className={`shrink-0 ${TOKENS.surface.bar} border-b border-white/[0.06] px-3.5 py-2.5`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-cyan-400/10 text-cyan-300">
              <StarlinkGlyph size={14} />
            </div>
            <div className="leading-tight">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">
                AI Coach ·{' '}
                {mode === 'wizard' ? (
                  'wizard'
                ) : coachThinking ? (
                  // Instrument-panel "system busy" indicator: LED dot + steady
                  // text. The dot pulses (not the text) — easier to scan.
                  <span className="inline-flex items-center gap-1.5 text-cyan-300/85 align-baseline">
                    <span
                      aria-hidden
                      className="inline-block h-1.5 w-1.5 rounded-full bg-cyan-300 starlink-pulse"
                    />
                    observing…
                  </span>
                ) : (
                  'reflective'
                )}
              </p>
              <h3 className="text-[13px] font-semibold text-white">
                {mode === 'wizard' ? '七步引导' : '陪伴反思'}
              </h3>
            </div>
          </div>

          {mode === 'coach' ? (
            <button
              type="button"
              onClick={startWizard}
              className={TOKENS.button.ghost}
              aria-label="启动 7 步引导"
            >
              <Wand2 className="h-3 w-3" strokeWidth={1.75} />
              启动引导
            </button>
          ) : (
            <button
              type="button"
              onClick={exitWizard}
              className={TOKENS.button.ghost}
              aria-label="退出引导"
            >
              <X className="h-3 w-3" strokeWidth={1.75} />
              退出引导
            </button>
          )}
        </div>

        {mode === 'wizard' && wizardStep !== 'done' && (
          <WizardWaypointMap step={wizardStep} />
        )}
      </header>

      {/* Messages ----------------------------------------------------------- */}
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-4">
        {messages.map((m, idx) => (
          <ChatBubble
            key={m.id}
            message={m}
            isFirst={idx === 0}
            previousRole={idx > 0 ? messages[idx - 1].role : null}
          />
        ))}
        {coachThinking && <ThinkingBubble />}
      </div>

      {/* Input -------------------------------------------------------------- */}
      <div className="shrink-0 border-t border-white/[0.06] bg-slate-950/60 p-3">
        <div className={`${TOKENS.surface.input} flex items-end gap-2 p-1.5`}>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                submit()
              }
            }}
            rows={2}
            placeholder={
              mode === 'wizard'
                ? '回答 AI 的问题…  ⌘+Enter 提交'
                : '回应反思 / 提问 / 思考片段…  ⌘+Enter 提交'
            }
            className="block min-h-[36px] flex-1 resize-none bg-transparent px-2 py-1.5 text-[12px] leading-relaxed text-slate-100 outline-none placeholder:text-slate-500"
          />
          <button
            type="button"
            onClick={submit}
            disabled={!draft.trim()}
            className={`${TOKENS.button.primary} h-9 disabled:cursor-not-allowed`}
            aria-label="发送"
          >
            <Send className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
        </div>
        <ModeFootnote mode={mode} />
      </div>
    </aside>
  )
}

// =============================================================================
// Sub-components
// =============================================================================

const SCAFFOLD_LABEL: Record<ScaffoldKind, string> = {
  why: 'WHY',
  how: 'HOW',
  'so-what': 'SO WHAT',
  'evidence-needed': 'EVIDENCE',
  meta: 'META'
}

function ChatBubble({
  message,
  isFirst,
  previousRole
}: {
  message: ChatMessage
  isFirst: boolean
  previousRole: ChatMessage['role'] | null
}) {
  if (message.role === 'system') {
    return (
      <div className="flex items-center gap-2 py-1">
        <div className="h-px flex-1 bg-white/[0.06]" />
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-slate-500">
          {message.content}
        </p>
        <div className="h-px flex-1 bg-white/[0.06]" />
      </div>
    )
  }

  const isAi = message.role === 'ai'
  // tighten spacing when consecutive messages share a role (avoids double avatar)
  // — but ONLY for messages without a scaffold chip; scaffold chips serve as
  // their own section dividers, so consecutive coach reflections stay visually
  // distinct.
  const isFollowUp =
    !isFirst && previousRole === message.role && !message.scaffold

  if (isAi) {
    // Section delimiter: when the previous message was also AI, the user
    // is reading a NEW reflection on the same speaker. A faint hairline
    // above the scaffold chip signals "new section" without a banner.
    const showSectionDelimiter = !isFirst && previousRole === 'ai' && !!message.scaffold

    return (
      <article className={`group ${isFollowUp ? '-mt-2' : ''}`}>
        {showSectionDelimiter && (
          <div aria-hidden className="mb-2 ml-9 h-px w-12 bg-white/[0.05]" />
        )}
        {/* Scaffold chip + provenance tag — feels like a coaching tag, not a chatbot */}
        {message.scaffold && (
          <p className="mb-1.5 flex items-center gap-2 pl-9 font-mono text-[10px] uppercase tracking-[0.22em]">
            <span className="inline-block h-px w-3 bg-cyan-300/40" />
            <span className="text-cyan-300/80">{SCAFFOLD_LABEL[message.scaffold]}</span>
            {message.source && (
              <>
                <span className="text-slate-700">·</span>
                <SourceTag source={message.source} latencyMs={message.latencyMs} />
              </>
            )}
          </p>
        )}
        <div className="flex gap-2.5">
          {/* Coach avatar — stacked dots evoke the brand glyph */}
          <div className="shrink-0 self-start">
            {isFollowUp ? (
              // continuation marker — keeps a vertical rhythm but no repeated avatar
              <div className="h-7 w-7" aria-hidden />
            ) : (
              <div className="flex h-7 w-7 items-center justify-center rounded-md border border-white/[0.06] bg-cyan-400/[0.08] text-cyan-300">
                <StarlinkGlyph size={12} />
              </div>
            )}
          </div>
          {/* Bubble */}
          <div
            className="relative max-w-[88%] rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[12px] leading-relaxed text-slate-100"
            style={{ borderLeft: '2px solid rgba(103, 232, 249, 0.35)' }}
          >
            <div className="prose prose-sm prose-invert max-w-none [&_p]:m-0 [&_p+p]:mt-2 [&_strong]:font-semibold [&_strong]:text-white">
              <ReactMarkdown>{message.content}</ReactMarkdown>
            </div>
          </div>
        </div>
      </article>
    )
  }

  // User message — quieter, right-aligned, no scaffold tag
  return (
    <article className={`group flex flex-row-reverse gap-2.5 ${isFollowUp ? '-mt-2' : ''}`}>
      <div className="shrink-0 self-start">
        {isFollowUp ? (
          <div className="h-7 w-7" aria-hidden />
        ) : (
          <div className="flex h-7 w-7 items-center justify-center rounded-md border border-white/[0.06] bg-white/[0.04] text-slate-300">
            <User className="h-3.5 w-3.5" strokeWidth={1.75} />
          </div>
        )}
      </div>
      <div className="max-w-[78%] rounded-lg border border-cyan-300/15 bg-cyan-400/[0.06] px-3 py-2 text-[12px] leading-relaxed text-cyan-50">
        <div className="prose prose-sm prose-invert max-w-none [&_p]:m-0 [&_p+p]:mt-2 [&_strong]:font-semibold">
          <ReactMarkdown>{message.content}</ReactMarkdown>
        </div>
      </div>
    </article>
  )
}

/**
 * Provenance tag rendered next to the scaffold chip on AI messages.
 *
 * Tells the user whether the prompt came from:
 *   - the live LLM (DeepSeek) — `LLM 1.4s`  (latency rendered as a
 *     subordinate annotation at 65% opacity, no extra `·` separator —
 *     reads as an instrument readout)
 *   - the local scripted fallback — `LOCAL`
 *   - a hard error — `OFFLINE`
 *
 * Visible to keep the UX academically honest about which engine produced
 * each reflection.
 */
function SourceTag({
  source,
  latencyMs
}: {
  source: NonNullable<ChatMessage['source']>
  latencyMs?: number
}) {
  if (source === 'llm') {
    return (
      <span className="text-cyan-300/60">
        LLM
        {typeof latencyMs === 'number' && latencyMs > 0 && (
          // Latency is subordinate to the LLM tag — render it tighter (no
          // separator dot, smaller spacing) and at lower opacity. Feels like
          // a unit annotation `1.2s`, not a co-equal datum.
          <span className="ml-1 tabular-nums opacity-65 normal-nums">
            {(latencyMs / 1000).toFixed(1)}s
          </span>
        )}
      </span>
    )
  }
  if (source === 'scripted') {
    return <span className="text-slate-500">LOCAL</span>
  }
  return <span className="text-amber-400/70">OFFLINE</span>
}

/**
 * Thinking bubble — rendered while a reflection is in-flight.
 *
 * Visual treatment is a navigator's RADAR SWEEP, not a chatbot ellipsis:
 * a 1-px hairline travels left→right across the bottom of the bubble,
 * looping until the LLM responds. Distinctive of the brand (consistent
 * with the navigator metaphor) and immediately distinguishable from the
 * "three bouncing dots" used by every messaging app.
 *
 * Kicker says "Observing" (matches the body 'AI 正在观察画布' and the
 * header status `observing…` — single semantic vocabulary).
 *
 * Bubble shape exactly mirrors the AI bubble so layout doesn't jump when
 * the real reply replaces this placeholder.
 */
function ThinkingBubble() {
  return (
    <article className="group">
      <p className="mb-1.5 flex items-center gap-2 pl-9 font-mono text-[10px] uppercase tracking-[0.22em] text-cyan-300/80">
        <span className="inline-block h-px w-3 bg-cyan-300/40" />
        <span>Observing</span>
        <span className="text-slate-700">·</span>
        <span className="text-cyan-300/60 starlink-pulse">LLM</span>
      </p>
      <div className="flex gap-2.5">
        <div className="shrink-0 self-start">
          <div className="flex h-7 w-7 items-center justify-center rounded-md border border-white/[0.06] bg-cyan-400/[0.08] text-cyan-300">
            <StarlinkGlyph size={12} />
          </div>
        </div>
        <div
          className="relative max-w-[88%] overflow-hidden rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 text-[12px] leading-relaxed text-slate-400"
          style={{ borderLeft: '2px solid rgba(103, 232, 249, 0.35)' }}
        >
          <span>AI 正在观察画布</span>
          {/* Radar sweep: a 1-px hairline travels across the bottom of the bubble. */}
          <span
            aria-hidden
            className="pointer-events-none absolute bottom-0 h-px w-1/3 bg-cyan-300/60"
            style={{ animation: 'starlinkSweep 2s ease-in-out infinite' }}
          />
        </div>
      </div>
    </article>
  )
}

// =============================================================================
// Wizard waypoint map — replaces the generic progress bar.
//
// Renders 7 named waypoints horizontally with a connecting rail. Active
// waypoint is filled cyan + label visible; passed ones are filled but muted;
// future ones are hollow. Looks like a metro line / navigator's checkpoint
// sequence — not a percentage bar.
// =============================================================================

interface Waypoint {
  step: StepId
  short: string
  full: string
}

const WAYPOINTS: Waypoint[] = [
  { step: 'core-idea', short: 'IDEA', full: '核心想法' },
  { step: 'customer-pain', short: 'PAIN', full: '客户痛点' },
  { step: 'value-angle', short: 'VALUE', full: '价值角度' },
  { step: 'hypothesis', short: 'HYPO', full: '假设' },
  { step: 'validation', short: 'TEST', full: '验证' },
  { step: 'revenue', short: 'REV', full: '收入' },
  { step: 'risk', short: 'RISK', full: '风险' },
  { step: 'meta', short: 'META', full: 'Meta 综合' }
]

function WizardWaypointMap({ step }: { step: StepId }) {
  const idx = stepIndex(step)
  const activeWaypoint = WAYPOINTS[Math.min(idx, WAYPOINTS.length - 1)]

  return (
    <div className="mt-3 space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-cyan-300/80">
          waypoint {String(Math.min(idx + 1, TOTAL_STEPS)).padStart(2, '0')}
          <span className="mx-1 text-slate-700">/</span>
          {String(TOTAL_STEPS).padStart(2, '0')}
        </span>
        <span className="text-[11px] font-medium text-white">{activeWaypoint?.full}</span>
      </div>
      {/* The waypoint rail */}
      <div className="relative flex items-center">
        {/* underlying rail */}
        <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-white/[0.06]" />
        {/* progressed segment */}
        <div
          className="absolute left-0 top-1/2 h-px -translate-y-1/2 bg-cyan-300/60 transition-all duration-500"
          style={{
            width: `${(idx / (WAYPOINTS.length - 1)) * 100}%`
          }}
        />
        <div className="relative flex w-full items-center justify-between">
          {WAYPOINTS.map((wp, i) => {
            const passed = i < idx
            const active = i === idx
            return (
              <span
                key={wp.step}
                className={`block h-1.5 w-1.5 rounded-full transition-colors ${
                  active
                    ? 'bg-cyan-300 ring-2 ring-cyan-300/30'
                    : passed
                      ? 'bg-cyan-300/70'
                      : 'bg-slate-700'
                }`}
                title={wp.full}
                aria-label={wp.full}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}

function ModeFootnote({ mode }: { mode: IdeationMode }) {
  return (
    <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.16em] text-slate-500">
      {mode === 'wizard' ? (
        <>
          <span className="text-cyan-300/80">{'// wizard'}</span> 每个回答会自动加成画布节点
        </>
      ) : (
        <>
          <span className="text-cyan-300/80">{'// coach'}</span> 我观察画布、出反思问题、不会改你的画布
        </>
      )}
    </p>
  )
}
