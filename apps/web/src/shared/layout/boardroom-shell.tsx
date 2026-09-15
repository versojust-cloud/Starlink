/**
 * BoardroomShell — top-level frame for the Editorial Boardroom redesign.
 *
 * Composition:
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │ <Masthead/>                                                  │
 *   ├────────────┬───────────────────────────────────┬─────────────┤
 *   │ <Stacks/>  │ <Frontpage/> (BMC 9-cell)         │ <Wire/>     │
 *   ├────────────┴───────────────────────────────────┴─────────────┤
 *   │ <Conductor/>                                                  │
 *   └──────────────────────────────────────────────────────────────┘
 *
 * Pure layout component — receives its 4 panel children as props so
 * different routes can swap the contents without re-implementing the
 * shell. P2 (this commit) ships the shell + a /v2 demo route. P3
 * wires the actual data sources (Yjs / GraphQL / agent stream).
 */

import type { ReactNode } from 'react'

interface BoardroomShellProps {
  masthead: ReactNode
  stacks: ReactNode
  frontpage: ReactNode
  wire: ReactNode
  conductor: ReactNode
}

export function BoardroomShell({
  masthead,
  stacks,
  frontpage,
  wire,
  conductor,
}: BoardroomShellProps) {
  return (
    <div className="flex h-screen w-screen flex-col bg-ink text-paper font-body antialiased overflow-hidden">
      {masthead}

      {/* Main 12-col grid — Stacks 3 / Frontpage 6 / Wire 3 */}
      <main
        className="grid flex-1 min-h-0"
        style={{ gridTemplateColumns: '3fr 6fr 3fr' }}
      >
        {stacks}
        {frontpage}
        {wire}
      </main>

      {conductor}
    </div>
  )
}
