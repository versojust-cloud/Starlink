/**
 * Masthead — top-of-page header for the Editorial Boardroom shell.
 *
 * Visual model: turn-of-the-century broadsheet masthead. Top row =
 * 5 horizontal regions (workspace name as masthead title, edition info,
 * agent attendance plates, conductor controls placeholder). Bottom of
 * masthead is a 1.5px rule-strong that separates it from the main grid.
 *
 * Strict tokens v2 only — no shadows, no gradients, no blur.
 */

import type { AgentByline } from '@/shared/design-system/tokens-v2'

export type AgentPresence = {
  /** Stable id used for keys + aria. */
  id: string
  /** Display name in Fraunces. */
  name: string
  /** Single-letter kicker (M / P / F / C / S). */
  initial: string
  /** Byline accent role (drives kicker tint). */
  role: AgentByline
  /** idle = grey · active = ash-1 · debating = press red. */
  status: 'idle' | 'active' | 'debating'
}

const STATUS_DOT: Record<AgentPresence['status'], string> = {
  idle:     'bg-paper-ash3',
  active:   'bg-paper',
  debating: 'bg-press',
}

const ROLE_TINT: Record<AgentByline, string> = {
  market:      'text-byline-market',
  product:     'text-byline-product',
  finance:     'text-byline-finance',
  critic:      'text-byline-critic',
  synthesizer: 'text-byline-synthesizer',
}

interface MastheadProps {
  /** Workspace title rendered as the masthead headline. */
  workspaceName: string
  /** Edition string ("Vol III · Issue 28 · 2026-05-01"). */
  edition?: string
  /** Agents currently present in the boardroom. */
  agents: AgentPresence[]
}

export function Masthead({ workspaceName, edition, agents }: MastheadProps) {
  return (
    <header className="border-b-[1.5px] border-paper/80 bg-grain-ink relative z-10">
      <div className="grid grid-cols-12 gap-6 px-8 py-5 items-end">
        {/* Far left — kicker stack */}
        <div className="col-span-3 flex flex-col gap-1 relative z-[1]">
          <span className="font-instr text-[10px] uppercase tracking-kicker text-paper-ash3">
            STARLINK · EDITORIAL BOARDROOM
          </span>
          {edition ? (
            <span className="font-instr text-[10px] tabular-nums text-ink-ash4">
              {edition}
            </span>
          ) : null}
        </div>

        {/* Center — workspace name as masthead title */}
        <h1
          className="col-span-6 font-display text-paper text-[32px] leading-[1.05] font-[700] truncate text-center relative z-[1]"
          title={workspaceName}
        >
          {workspaceName}
        </h1>

        {/* Far right — agent presence plates */}
        <ul className="col-span-3 flex flex-row items-center justify-end gap-3 relative z-[1]">
          {agents.length === 0 ? (
            <li className="font-instr text-[10px] uppercase tracking-kicker text-ink-ash4">
              SESSION IDLE
            </li>
          ) : (
            agents.map((agent) => (
              <li
                key={agent.id}
                className="flex items-center gap-2"
                aria-label={`${agent.name} (${agent.status})`}
              >
                <span
                  className={`font-display text-[14px] font-[700] ${ROLE_TINT[agent.role]}`}
                  aria-hidden="true"
                >
                  {agent.initial}
                </span>
                <span className="font-instr text-[10px] uppercase tracking-kicker text-paper">
                  {agent.name}
                </span>
                <span
                  className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[agent.status]}`}
                  aria-hidden="true"
                />
              </li>
            ))
          )}
        </ul>
      </div>
    </header>
  )
}
