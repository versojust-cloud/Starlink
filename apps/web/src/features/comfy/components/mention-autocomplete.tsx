'use client'

/**
 * Mention autocomplete popup (2026-05-04).
 *
 * Detects an unclosed `@` in the chat textarea, surfaces a floating
 * panel of all 11 backend agents (filtered by the typed query), and
 * commits the selected agent into the textarea as `@<id> `.
 *
 * Caller wires three things:
 *   - `value` / `onChange`    : controlled textarea state
 *   - `selectionStart`        : cursor position (used to find the `@` token)
 *   - `onPick(agentId)`       : called when user picks via Enter / Tab / click
 *
 * The popup itself is a positioned <div> below the textarea — no portal,
 * no Floating UI dependency. The textarea's caret position drives a single
 * left offset (column count × character width) which is good enough for
 * a textarea of fixed font size.
 */

import { useEffect, useMemo, useState } from 'react'
import {
  type AgentDescriptor,
  filterAgentsByQuery,
} from '../registries/agent-registry'
import { bylineAccent } from '@/shared/design-system/tokens-v2'

interface MentionAutocompleteProps {
  /** Controlled textarea value. */
  value: string
  /** Cursor position in the textarea. */
  selectionStart: number
  /** Called when the user commits a selection. The replacement is `@<id> `. */
  onPick: (newValue: string, newCursor: number) => void
  /** Called when the popup closes (user typed past `@`, hit Esc, picked, etc). */
  onClose?: () => void
  /** Anchor element — popup positions absolutely relative to this. */
  textareaRef: React.RefObject<HTMLTextAreaElement>
}

/**
 * Scan the textarea value backward from the cursor to find an unclosed
 * `@` token. Returns null if the cursor is not inside a mention region.
 *
 * Rules:
 *   - Must find an `@` between cursor and the most recent whitespace/newline
 *   - Anything between `@` and cursor is the query (no spaces allowed)
 *   - Position 0 of the textarea also counts as a valid `@` start
 */
export function findMentionToken(
  value: string,
  cursor: number
): { start: number; query: string } | null {
  if (cursor === 0) return null
  // Walk backward looking for '@', stop at whitespace or newline (those break the token).
  for (let i = cursor - 1; i >= 0; i--) {
    const ch = value[i]
    if (ch === '@') {
      // Valid only if @ is at start OR preceded by whitespace.
      if (i === 0 || /\s/.test(value[i - 1])) {
        const query = value.slice(i + 1, cursor)
        // Don't trigger for things like "user@example.com" mid-word.
        if (/\s/.test(query)) return null
        return { start: i, query }
      }
      return null
    }
    if (/\s/.test(ch)) return null
  }
  return null
}

export function MentionAutocomplete({
  value,
  selectionStart,
  onPick,
  onClose,
  textareaRef,
}: MentionAutocompleteProps) {
  const token = findMentionToken(value, selectionStart)
  const filtered = useMemo<readonly AgentDescriptor[]>(
    () => (token ? filterAgentsByQuery(token.query) : []),
    [token]
  )
  const [activeIndex, setActiveIndex] = useState(0)

  // Reset selection when the filter set changes.
  useEffect(() => {
    setActiveIndex(0)
  }, [token?.query])

  // Keyboard navigation when popup is open.
  useEffect(() => {
    if (!token || filtered.length === 0) return
    const ta = textareaRef.current
    if (!ta) return

    const handler = (e: KeyboardEvent) => {
      if (!token) return
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIndex((i) => (i + 1) % filtered.length)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIndex((i) => (i - 1 + filtered.length) % filtered.length)
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        // Only intercept when we have a selection; let plain Enter send normally.
        e.preventDefault()
        commit(filtered[activeIndex])
      } else if (e.key === 'Escape') {
        e.preventDefault()
        onClose?.()
      }
    }

    ta.addEventListener('keydown', handler)
    return () => ta.removeEventListener('keydown', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, filtered, activeIndex])

  if (!token || filtered.length === 0) return null

  function commit(agent: AgentDescriptor) {
    if (!token) return
    const before = value.slice(0, token.start)
    const after = value.slice(selectionStart)
    const insertion = `@${agent.id} `
    const newValue = before + insertion + after
    const newCursor = before.length + insertion.length
    onPick(newValue, newCursor)
  }

  // Group filtered agents by category — Editorial Boardroom v2 style:
  // four typed sections (生成者 / 评议者 / 辩论 / 工具) with kicker labels
  // separating each. Active index is still flat 0..n-1, so rendering
  // tracks a running counter to know which row is active.
  const GROUP_LABELS: Record<AgentDescriptor['group'], string> = {
    generators: '生成者 · BMC 三专家',
    advisors:   '评议者 · 需画布 BMC',
    debate:     '辩论 · 单边批判 / 裁决',
    utility:    '工具 · 通用 / 深度研究',
  }
  const groupOrder: AgentDescriptor['group'][] = ['generators', 'advisors', 'debate', 'utility']
  const grouped: Record<string, AgentDescriptor[]> = {}
  for (const a of filtered) {
    if (!grouped[a.group]) grouped[a.group] = []
    grouped[a.group].push(a)
  }

  let runningIdx = -1

  return (
    <div
      role="listbox"
      aria-label="选择 agent"
      className="absolute bottom-full left-2 right-2 mb-2 z-30 max-h-72 overflow-y-auto bg-white border-[1px] border-stratum-line shadow-md"
      style={{
        // Match BMC card: muted edge bar on the left for instant visual
        // continuity with the canvas. Use the active agent's byline so
        // the strip "follows" the selection.
        boxShadow: filtered[activeIndex]
          ? `inset 3px 0 0 0 ${bylineAccent[filtered[activeIndex].byline]}, 0 4px 12px rgba(10,10,10,0.06)`
          : '0 4px 12px rgba(10,10,10,0.06)',
      }}
    >
      {/* Newspaper-kicker header: Geist mono + tracking, NOT cool blue */}
      <div className="flex items-baseline justify-between border-b-[0.5px] border-stratum-line px-3 py-2">
        <span className="font-body text-[9px] font-bold uppercase tracking-[0.18em] text-stratum-navy">
          @ 唤起 AGENT
        </span>
        <span className="font-mono text-[9px] tabular-nums text-stratum-muted">
          {filtered.length} / 11
        </span>
      </div>

      {groupOrder.map((groupKey) => {
        const list = grouped[groupKey]
        if (!list || list.length === 0) return null
        return (
          <div key={groupKey}>
            {/* Section header — newspaper kicker style */}
            <div className="px-3 pt-2 pb-1 bg-stratum-surface-low/40 border-b-[0.5px] border-stratum-line">
              <span className="font-body text-[9px] font-semibold uppercase tracking-[0.18em] text-stratum-muted">
                {GROUP_LABELS[groupKey]}
              </span>
            </div>
            <ul>
              {list.map((agent) => {
                runningIdx += 1
                const myIdx = runningIdx
                const accent = bylineAccent[agent.byline]
                const isActive = myIdx === activeIndex
                return (
                  <li
                    key={agent.id}
                    role="option"
                    aria-selected={isActive}
                    onMouseEnter={() => setActiveIndex(myIdx)}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      commit(agent)
                    }}
                    className="flex items-center gap-3 px-3 py-2 cursor-pointer text-[12px] transition-colors hover:bg-stratum-surface-low/60"
                    style={isActive ? {
                      backgroundColor: 'rgba(10,10,10,0.04)',
                      boxShadow: `inset 3px 0 0 0 ${accent}`,
                    } : undefined}
                  >
                    {/* Byline glyph: Fraunces letter on byline-tinted square.
                        opponent → dashed border. judge → rounded circle. */}
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center font-display font-[700] text-[14px] text-white ${
                        agent.variant === 'judge' ? 'rounded-full' : 'rounded-[2px]'
                      } ${agent.variant === 'opponent' ? 'border-[1.5px] border-dashed' : ''}`}
                      style={{
                        backgroundColor: agent.variant === 'opponent' ? 'transparent' : accent,
                        borderColor: agent.variant === 'opponent' ? accent : undefined,
                        color: agent.variant === 'opponent' ? accent : 'white',
                      }}
                      aria-hidden
                    >
                      {agent.glyph}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className="font-display font-[700] text-stratum-navy truncate text-[13px] tracking-[0.01em]">
                          {agent.displayName}
                        </span>
                        <span className="font-mono text-[10px] text-stratum-muted truncate">
                          @{agent.id}
                        </span>
                      </div>
                      <div className="font-body text-[11px] text-stratum-muted truncate leading-snug">
                        {agent.shortDescription}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        )
      })}

      {/* Footer keymap — uppercase tracking matches kicker tone */}
      <div className="flex items-center justify-between gap-3 border-t-[0.5px] border-stratum-line px-3 py-1.5 bg-stratum-surface-low/40">
        <span className="font-mono text-[9px] tabular-nums text-stratum-muted">
          ↑↓ 选 · ⏎/⇥ 唤起 · ⎋ 取消
        </span>
      </div>
    </div>
  )
}
