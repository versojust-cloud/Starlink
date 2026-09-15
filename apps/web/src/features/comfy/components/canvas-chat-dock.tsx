'use client'

/**
 * Left-side chat dock — collapsible Stratum-styled chat panel that
 * surfaces the comfy store's chatInput / chatMessages / handleSendChat
 * pipeline. Reads:
 *   - chatMessages (history, role = user | assistant)
 *   - chatInput, setChatInput
 *   - isOrchestratorProcessing (disable send)
 * Writes:
 *   - appendChatMessage (user side)
 *   - callLangGraph(input, 'general') via parent onSendChat callback
 *
 * Visual: 360 px column anchored to the left, full-height under the
 * canvas header. Collapse → 48 × 48 round button on the canvas edge.
 */

import { useEffect, useRef, useState } from 'react'
import { MessageCircle, Send, Sparkles, X, ArrowRight, Copy, RefreshCw, Check } from 'lucide-react'
import { useComfyStore } from '../store'
import { useResizableDrawer, ResizeHandle } from '@/shared/hooks/use-resizable-drawer'
import { CanvasUserSkillChip } from './canvas-user-skill-chip'
import { MentionAutocomplete } from './mention-autocomplete'
import { getAgent } from '../registries/agent-registry'
import { renderAgentOutput } from '../registries/agent-output-renderer-registry'
import { bylineAccent } from '@/shared/design-system/tokens-v2'

type Props = {
  open: boolean
  onToggle: () => void
  onSend: () => void | Promise<void>
  /** Called when user clicks the meta-check "graduate to BMC" CTA. */
  onGraduate?: () => void
  workspaceId: string
}

/**
 * Per-assistant-message action row: Copy + (optional) Regenerate.
 * Renders below the message bubble in muted micro-icon row. Copy is
 * always shown; Regen only for @-mention messages where we know which
 * agent + prompt to re-fire.
 */
function MessageActions({
  content,
  mentionedAgent,
  onRegen,
}: {
  content: string
  mentionedAgent: string | undefined
  onRegen?: () => void
}) {
  const [copied, setCopied] = useState(false)
  const onCopy = () => {
    if (typeof navigator === 'undefined') return
    navigator.clipboard?.writeText(content).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    }).catch(() => {})
  }
  return (
    <div className="mt-1 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity"
         style={{ opacity: 0.5 }}
    >
      <button
        type="button"
        onClick={onCopy}
        className="flex items-center gap-1 font-mono text-[9px] tabular-nums text-stratum-muted hover:text-stratum-navy transition-colors uppercase tracking-[0.12em]"
        aria-label="复制"
      >
        {copied
          ? <><Check className="h-3 w-3" strokeWidth={2} /> 已复制</>
          : <><Copy className="h-3 w-3" strokeWidth={1.75} /> Copy</>
        }
      </button>
      {mentionedAgent && onRegen ? (
        <button
          type="button"
          onClick={onRegen}
          className="flex items-center gap-1 font-mono text-[9px] tabular-nums text-stratum-muted hover:text-stratum-navy transition-colors uppercase tracking-[0.12em]"
          aria-label="重新生成"
        >
          <RefreshCw className="h-3 w-3" strokeWidth={1.75} /> Regen
        </button>
      ) : null}
    </div>
  )
}

export function CanvasChatDock({ open, onToggle, onSend, onGraduate, workspaceId }: Props) {
  const chatInput = useComfyStore((s) => s.chatInput)
  const setChatInput = useComfyStore((s) => s.setChatInput)
  const chatMessages = useComfyStore((s) => s.chatMessages)
  const isProcessing = useComfyStore((s) => s.isOrchestratorProcessing)
  const chatReflecting = useComfyStore((s) => s.chatReflecting)

  const scrollRef = useRef<HTMLDivElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const [selStart, setSelStart] = useState(0)

  // P12 fix N3 · track when the user last had the dock open. While the
  // dock is open we keep this in lockstep with chatMessages.length so the
  // blue "unread" dot disappears as soon as the user opens chat. While
  // the dock is closed we freeze it, so messages arriving in the
  // meantime register as unread. Previous behaviour: dot showed whenever
  // there were >1 messages — i.e. forever after the welcome bubble.
  const [lastSeenLength, setLastSeenLength] = useState<number>(chatMessages.length)
  useEffect(() => {
    if (open) setLastSeenLength(chatMessages.length)
  }, [open, chatMessages.length])
  const unreadCount = open ? 0 : Math.max(0, chatMessages.length - lastSeenLength)

  useEffect(() => {
    if (!scrollRef.current) return
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [chatMessages.length, open])

  // P12 · resizable. Hook must run unconditionally before any early
  // return (rules-of-hooks). The width is only consumed in the open
  // branch below.
  const { width, startDrag } = useResizableDrawer({
    storageKey: 'starlink:chatDock:width',
    defaultWidth: 360,
    minWidth: 280,
    maxWidth: 720,
    direction: 'right'
  })

  if (!open) {
    return (
      <button
        type="button"
        onClick={onToggle}
        className="absolute top-1/2 left-4 -translate-y-1/2 z-10 flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-lg border border-stratum-line text-stratum-navy hover:text-stratum-blue transition-colors pointer-events-auto"
        aria-label={unreadCount > 0 ? `打开对话（${unreadCount} 条未读）` : '打开对话'}
      >
        <MessageCircle className="h-5 w-5" strokeWidth={1.75} />
        {unreadCount > 0 ? (
          <span
            aria-hidden="true"
            className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-stratum-blue border-2 border-white"
          />
        ) : null}
      </button>
    )
  }

  const handleKey = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      if (chatInput.trim() && !isProcessing && !chatReflecting) void onSend()
    }
  }

  return (
    <aside
      className="absolute left-4 top-4 bottom-4 z-10 flex flex-col bg-white border-[1px] border-stratum-line shadow-md pointer-events-auto"
      role="region"
      aria-label="多 Agent 对话"
      style={{
        width,
        // BMC-card aesthetic: 3px ink-tinted left edge instead of round corners.
        // Reads as "this surface is part of the editorial canvas family".
        boxShadow: 'inset 3px 0 0 0 #2A2826, 0 4px 14px rgba(10,10,10,0.08)'
      }}
    >
      <ResizeHandle edge="right" onMouseDown={startDrag} />
      <header className="flex items-center justify-between px-4 py-3 border-b-[0.5px] border-stratum-line">
        <div>
          <p className="font-body text-[9px] font-bold uppercase tracking-[0.18em] text-stratum-muted">
            CHAT · 11-AGENT 对话
          </p>
          <h3 className="font-display font-[700] text-[15px] tracking-tight text-stratum-navy uppercase mt-0.5">
            实时协作
          </h3>
        </div>
        <button
          type="button"
          onClick={onToggle}
          className="flex h-7 w-7 items-center justify-center text-stratum-muted hover:bg-stratum-surface-low hover:text-stratum-navy transition-colors"
          aria-label="收起对话"
        >
          <X className="h-3.5 w-3.5" strokeWidth={1.75} />
        </button>
      </header>

      {/* User-skill chip — collapsible "AI 已了解的你" surface */}
      <div className="px-3 pt-2 pb-1">
        <CanvasUserSkillChip workspaceId={workspaceId} />
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3 bg-stratum-surface-low/30">
        {chatMessages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center px-4 gap-3">
            <Sparkles className="h-5 w-5 text-stratum-muted" strokeWidth={1.5} />
            <div className="space-y-2">
              <p className="font-body text-[12px] text-stratum-ink leading-relaxed">
                直接发问让 supervisor 路由到合适的专家。
              </p>
              <div className="space-y-1 text-left">
                <p className="font-mono text-[10px] text-stratum-muted">
                  <span className="font-bold text-stratum-navy">@</span> 唤起特定 agent
                </p>
                <p className="font-mono text-[10px] text-stratum-muted">
                  <span className="font-bold text-stratum-navy">/wizard</span> 7 步结构化引导
                </p>
                <p className="font-mono text-[10px] text-stratum-muted">
                  <span className="font-bold text-stratum-navy">/clear</span> 清空对话
                </p>
                <p className="font-mono text-[10px] text-stratum-muted">
                  <span className="font-bold text-stratum-navy">/agents</span> 列出 11 个 agent
                </p>
              </div>
            </div>
          </div>
        ) : (
          chatMessages.map((msg, idx) => {
            const isUser = msg.role === 'user'
            const m = msg as typeof msg & {
              scaffold?: 'why' | 'how' | 'so_what' | 'evidence_needed' | 'meta'
              source?: string
              isMetaCheck?: boolean
              isWizard?: boolean
            }
            const scaffoldLabel: Record<string, string> = {
              why: 'WHY · 为什么',
              how: 'HOW · 怎么做',
              so_what: 'SO WHAT · 意味着',
              evidence_needed: 'EVIDENCE · 待求证',
              meta: 'META · 反思',
            }
            // P12 · server-side persistence warning. Surfaces silent
            // canvas_graphs / memory_items write failures as a
            // non-blocking yellow ⚠ alert so the user knows they may
            // need to reload/retry without aborting the conversation.
            if (m.source === 'persistence-warning') {
              return (
                <div key={idx} className="flex gap-2">
                  <span
                    aria-hidden="true"
                    className="shrink-0 flex h-6 w-6 items-center justify-center rounded-full bg-amber-500 text-white font-body text-[10px] font-bold"
                  >
                    ⚠
                  </span>
                  <div className="max-w-[88%] rounded-md bg-amber-50 border border-amber-300 p-3 shadow-sm">
                    <span className="inline-flex items-center gap-1 rounded bg-amber-200 px-2 py-0.5 font-body text-[9px] font-bold uppercase tracking-[0.18em] text-amber-900 mb-2">
                      PERSISTENCE · 持久化提示
                    </span>
                    <p className="font-body text-[12px] leading-[1.55] text-amber-900 whitespace-pre-wrap break-words">
                      {msg.content}
                    </p>
                  </div>
                </div>
              )
            }

            // Meta-check renders as a special "graduate" card (AI 自评
            // 探索完整度) with a "✦ 开始生成 BMC" CTA. The latest one
            // (highest idx) is the actionable one; older ones become
            // archived advice.
            const isLatestMetaCheck =
              m.isMetaCheck &&
              idx === chatMessages.length - 1
            if (m.isMetaCheck) {
              return (
                <div key={idx} className="flex gap-2">
                  <span
                    aria-hidden="true"
                    className="shrink-0 flex h-6 w-6 items-center justify-center rounded-full bg-stratum-blue text-white font-body text-[10px] font-bold"
                  >
                    ✦
                  </span>
                  <div className="max-w-[88%] rounded-xl bg-stratum-blue/10 border border-stratum-blue/30 p-3 shadow-sm">
                    <span className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 font-body text-[9px] font-bold uppercase tracking-[0.18em] text-stratum-blue mb-2">
                      META · AI 自评探索完整度
                    </span>
                    <p className="font-body text-[12px] leading-[1.55] text-stratum-ink whitespace-pre-wrap break-words">
                      {msg.content}
                    </p>
                    {isLatestMetaCheck && onGraduate ? (
                      <button
                        type="button"
                        onClick={onGraduate}
                        className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-stratum-navy px-3 py-1.5 font-body text-[11px] font-bold text-white hover:bg-stratum-navy-soft transition-colors w-full justify-center"
                      >
                        <Sparkles className="h-3.5 w-3.5 text-stratum-sky" strokeWidth={2} fill="#89CEFF" />
                        探索完毕 · 开始生成 BMC
                        <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
                      </button>
                    ) : null}
                  </div>
                </div>
              )
            }
            // @-mention assistant message: render with the agent's
            // byline accent strip + glyph + display name. Refused
            // mentions show a muted variant.
            const mEx = m as typeof m & { mentionedAgent?: string; refused?: boolean }
            const mentionAgent = !isUser && mEx.mentionedAgent ? getAgent(mEx.mentionedAgent) : undefined
            const mentionAccent = mentionAgent ? bylineAccent[mentionAgent.byline] : undefined

            return (
              <div
                key={idx}
                className={`flex gap-2 ${isUser ? 'flex-row-reverse' : ''}`}
              >
                <span
                  aria-hidden="true"
                  className={`shrink-0 flex h-6 w-6 items-center justify-center font-body text-[10px] font-bold ${
                    mentionAgent
                      ? `text-white ${mentionAgent.variant === 'judge' ? 'rounded-full' : 'rounded'} ${mentionAgent.variant === 'opponent' ? 'border-2 border-dashed' : ''}`
                      : `rounded-full ${isUser ? 'bg-stratum-navy text-white' : 'bg-stratum-blue/10 text-stratum-blue'}`
                  }`}
                  style={
                    mentionAgent
                      ? {
                          backgroundColor: mentionAccent,
                          borderColor: mentionAgent.variant === 'opponent' ? mentionAccent : undefined,
                        }
                      : undefined
                  }
                >
                  {isUser ? 'U' : mentionAgent ? mentionAgent.glyph : 'A'}
                </span>
                <div className={`max-w-[82%] flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
                  {!isUser && mentionAgent ? (
                    <span
                      className="mb-1 inline-flex items-center gap-1 px-2 py-0.5 font-body text-[9px] font-bold uppercase tracking-[0.18em] text-white"
                      style={{ backgroundColor: mentionAccent }}
                    >
                      {mentionAgent.displayName}
                      {mEx.refused ? <span className="ml-0.5 opacity-80">· 拒绝</span> : null}
                    </span>
                  ) : !isUser && m.scaffold ? (
                    <span className="mb-1 inline-flex items-center gap-1 bg-stratum-blue/10 px-2 py-0.5 font-body text-[9px] font-bold uppercase tracking-[0.18em] text-stratum-blue">
                      {scaffoldLabel[m.scaffold] ?? m.scaffold}
                      {m.source === 'scripted' ? <span className="ml-0.5 opacity-60">· 脚手架</span> : null}
                      {m.source === 'error' ? <span className="ml-0.5 text-stratum-danger">· 错误</span> : null}
                    </span>
                  ) : !isUser && m.isWizard ? (
                    <span className="mb-1 inline-flex items-center gap-1 bg-stratum-navy text-white px-2 py-0.5 font-body text-[9px] font-bold uppercase tracking-[0.18em]">
                      WIZARD · 7 步引导
                      {m.source === 'error' ? <span className="ml-0.5 text-stratum-sky">· 错误</span> : null}
                    </span>
                  ) : null}
                  <div
                    className={`px-3 py-2 font-body text-[12px] leading-[1.6] shadow-sm border-[1px] ${
                      isUser
                        ? 'bg-stratum-navy text-white border-stratum-navy'
                        : mentionAgent && mEx.refused
                        ? 'bg-white border-stratum-danger/30 text-stratum-muted'
                        : 'bg-white border-stratum-line text-stratum-ink'
                    }`}
                    style={
                      mentionAgent && !mEx.refused
                        ? { boxShadow: `inset 3px 0 0 0 ${mentionAccent}` }
                        : undefined
                    }
                  >
                    {isUser ? (
                      <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                    ) : (
                      // Route assistant messages through the renderer
                      // registry. Agents with dedicated renderers (critic /
                      // deep-research / moderator) get structured output;
                      // others fall through to default markdown.
                      renderAgentOutput({
                        surface: 'chat',
                        content: msg.content || '',
                        agentId: mEx.mentionedAgent,
                      })
                    )}
                  </div>
                  {/* Per-message actions for assistant turns: Copy + Regenerate */}
                  {!isUser ? (
                    <MessageActions
                      content={msg.content}
                      mentionedAgent={mEx.mentionedAgent}
                      onRegen={mEx.mentionedAgent ? () => {
                        // Regen: find the user message immediately preceding
                        // this assistant message in chat history and re-call
                        // mentionAgent with the same agent + prompt.
                        const prev = chatMessages[idx - 1]
                        if (!prev || prev.role !== 'user') return
                        const userMsg = prev.content
                        // user content for mention is "@<id> <body>" — strip prefix
                        const stripped = userMsg.replace(/^@[a-z][a-z0-9-]+\s+/i, '')
                        const mention = useComfyStore.getState().mentionAgent
                        void mention(mEx.mentionedAgent!, stripped)
                      } : undefined}
                    />
                  ) : null}
                </div>
              </div>
            )
          })
        )}
        {chatReflecting ? (
          <div className="flex gap-2">
            <span
              aria-hidden="true"
              className="shrink-0 flex h-6 w-6 items-center justify-center rounded-full bg-stratum-blue/10 text-stratum-blue font-body text-[10px] font-bold"
            >
              A
            </span>
            <div className="flex flex-col items-start">
              <div className="rounded-lg px-3 py-2.5 bg-stratum-surface-low border border-stratum-line shadow-sm">
                <span className="inline-flex items-center gap-1.5">
                  <span
                    aria-hidden="true"
                    className="h-1.5 w-1.5 rounded-full bg-stratum-blue animate-bounce"
                    style={{ animationDelay: '0ms', animationDuration: '0.9s' }}
                  />
                  <span
                    aria-hidden="true"
                    className="h-1.5 w-1.5 rounded-full bg-stratum-blue animate-bounce"
                    style={{ animationDelay: '160ms', animationDuration: '0.9s' }}
                  />
                  <span
                    aria-hidden="true"
                    className="h-1.5 w-1.5 rounded-full bg-stratum-blue animate-bounce"
                    style={{ animationDelay: '320ms', animationDuration: '0.9s' }}
                  />
                  <span className="ml-1 font-body text-[11px] text-stratum-muted">
                    教练正在反问中…
                  </span>
                </span>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="border-t border-stratum-line p-3 bg-stratum-surface-low/50 rounded-b-2xl relative">
        {/* @-mention popup: positions itself absolutely above the textarea
            row when an unclosed @ token is detected at the cursor. */}
        <MentionAutocomplete
          value={chatInput}
          selectionStart={selStart}
          textareaRef={textareaRef}
          onPick={(newValue, newCursor) => {
            setChatInput(newValue)
            // schedule cursor restoration after React updates the textarea value
            requestAnimationFrame(() => {
              const ta = textareaRef.current
              if (ta) {
                ta.focus()
                ta.setSelectionRange(newCursor, newCursor)
                setSelStart(newCursor)
              }
            })
          }}
        />
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={chatInput}
            onChange={(e) => {
              setChatInput(e.target.value)
              setSelStart(e.target.selectionStart ?? e.target.value.length)
            }}
            onKeyUp={(e) => setSelStart(e.currentTarget.selectionStart ?? 0)}
            onClick={(e) => setSelStart(e.currentTarget.selectionStart ?? 0)}
            onKeyDown={handleKey}
            placeholder="向 agent 团队提问…（Enter 发送 / Shift+Enter 换行 / @ 唤起 agent）"
            disabled={isProcessing || chatReflecting}
            rows={2}
            className="flex-1 resize-none rounded-lg border border-stratum-line bg-white px-3 py-2 font-body text-[12px] text-stratum-navy outline-none transition-colors placeholder:text-stratum-muted focus:border-stratum-blue focus:ring-1 focus:ring-stratum-blue/30 disabled:opacity-50"
          />
          <button
            type="button"
            onClick={() => void onSend()}
            disabled={!chatInput.trim() || isProcessing || chatReflecting}
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-stratum-navy text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed hover:bg-stratum-navy-soft"
            aria-label="发送"
          >
            <Send className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>
      </div>
    </aside>
  )
}
