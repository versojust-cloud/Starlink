'use client'

import { memo, type ReactNode } from 'react'
import { Handle, Position } from 'reactflow'
import ReactMarkdown from 'react-markdown'
import { Edit3, Trash2 } from 'lucide-react'
import { IDEATION_HUE } from '@/features/comfy/components/canvas-design-tokens'
import type { IdeationNodeKind } from '../../types/ideation-types'

/**
 * Shared shell for every ideation node.
 *
 * Visual contract (refresh-2026-04 / Stitch + Comfy):
 *  - 1-px white/8 border on neutral slate-900/60 surface
 *  - 3-px inset accent border in the node-kind hue (semantic at a glance)
 *  - Header chip: hue-tinted icon square + label + kicker (kind name)
 *  - Body slot: caller renders content (markdown, badges, action rows…)
 *  - Bottom signature row: optional metaSlot from caller
 *  - Handles: top + bottom, hue-colored circles
 *
 * All hover/scale/glow are intentionally absent — caller MAY add
 * `selected` styling via the React Flow `selected` prop wrapping.
 */

export interface BaseIdeationNodeProps {
  /** node kind drives hue; pass through from data */
  kind: IdeationNodeKind
  icon: ReactNode
  /** displayed in the kicker label */
  kindLabel: string
  /** main title in the header */
  label: string
  /** optional badge to the right of the label */
  badgeSlot?: ReactNode
  /** main editable / display body */
  body: ReactNode
  /** optional row of meta chips below the body */
  metaSlot?: ReactNode
  /** width — default 320 px; cards with rich body can pass 360 */
  width?: number
  /** edit / delete buttons; if omitted, header has no actions */
  onEdit?: () => void
  onDelete?: () => void
}

function BaseIdeationNodeImpl({
  kind,
  icon,
  kindLabel,
  label,
  badgeSlot,
  body,
  metaSlot,
  width = 320,
  onEdit,
  onDelete
}: BaseIdeationNodeProps) {
  const hue = IDEATION_HUE[kind] ?? IDEATION_HUE['core-idea']

  return (
    <>
      <Handle
        type="target"
        position={Position.Top}
        style={{
          width: 10,
          height: 10,
          background: hue.hex,
          border: '2px solid rgb(2 6 23)'
        }}
      />

      <div
        className="group relative overflow-hidden rounded-xl border border-white/[0.08] bg-slate-900/60 backdrop-blur-xl transition-colors hover:border-white/[0.16]"
        style={{
          width,
          boxShadow: `inset 3px 0 0 0 ${hue.hex}`
        }}
      >
        {/* Header */}
        <div className={`flex items-start justify-between gap-2 border-b border-white/[0.06] px-3 py-2 ${hue.softBg}`}>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <div
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${hue.bg} ${hue.text}`}
              aria-hidden
            >
              {icon}
            </div>
            <div className="min-w-0 flex-1 leading-tight">
              <p className={`text-[10px] font-medium uppercase tracking-[0.16em] ${hue.text}`}>
                {kindLabel}
              </p>
              <h3 className="truncate text-[13px] font-semibold text-white">
                {label || '未命名'}
              </h3>
            </div>
            {badgeSlot}
          </div>

          {(onEdit || onDelete) && (
            <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
              {onEdit && (
                <button
                  type="button"
                  onClick={onEdit}
                  aria-label="编辑"
                  className="flex h-6 w-6 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-white/[0.06] hover:text-slate-100"
                >
                  <Edit3 className="h-3 w-3" strokeWidth={1.75} />
                </button>
              )}
              {onDelete && (
                <button
                  type="button"
                  onClick={onDelete}
                  aria-label="删除"
                  className="flex h-6 w-6 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-rose-400/10 hover:text-rose-300"
                >
                  <Trash2 className="h-3 w-3" strokeWidth={1.75} />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Body */}
        <div className="space-y-2 p-3">
          {body}
          {metaSlot}
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        style={{
          width: 10,
          height: 10,
          background: hue.hex,
          border: '2px solid rgb(2 6 23)'
        }}
      />
    </>
  )
}

export const BaseIdeationNode = memo(BaseIdeationNodeImpl)

/**
 * Convenience wrapper: render a markdown body with the standard prose styles
 * used across ideation nodes. Falls back to a placeholder when content is
 * empty so the node is never visually empty.
 */
export function MarkdownBody({ content, placeholder }: { content: string; placeholder: string }) {
  return (
    <div className="prose prose-sm prose-invert max-h-44 max-w-none overflow-y-auto rounded-md border border-white/[0.06] bg-slate-950/40 p-2.5 text-[12px] text-slate-200">
      <ReactMarkdown>{content || `*${placeholder}*`}</ReactMarkdown>
    </div>
  )
}

/** Tiny hue-tinted chip; used for status / severity / category metadata. */
export function MetaChip({
  kind,
  children
}: {
  kind: IdeationNodeKind
  children: ReactNode
}) {
  const hue = IDEATION_HUE[kind] ?? IDEATION_HUE['core-idea']
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] ${hue.chip}`}
    >
      {children}
    </span>
  )
}
