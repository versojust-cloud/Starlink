'use client'

/**
 * ConversationRail — left-side ChatGPT-style conversation list.
 *
 * - Brand mark + "New chat" button at top
 * - Scrollable list of conversations grouped by recency (today / past 7d / older)
 * - Each row: title (editable inline) + delete (× on hover)
 * - Active row gets navy fill; idle is muted
 * - Bottom: link to canvas + workspace meta
 */

import { useMemo, useState } from 'react'
import { MessageSquarePlus, Trash2, MessageCircle, LayoutGrid, Pencil, Check, X } from 'lucide-react'
import type { ConversationSnapshot } from '../../comfy/store/conversations-persistence'

type Props = {
  conversations: ConversationSnapshot[]
  activeId: string
  workspaceId: string
  onCreate: () => void
  onSelect: (id: string) => void
  onRename: (id: string, title: string) => void
  onDelete: (id: string) => void
}

const groupByRecency = (conversations: ConversationSnapshot[]) => {
  const now = Date.now()
  const day = 24 * 60 * 60 * 1000
  const today: ConversationSnapshot[] = []
  const week:  ConversationSnapshot[] = []
  const older: ConversationSnapshot[] = []
  for (const c of conversations) {
    const ts = new Date(c.updatedAt).getTime()
    const ageDays = (now - ts) / day
    if (ageDays < 1) today.push(c)
    else if (ageDays < 7) week.push(c)
    else older.push(c)
  }
  const cmp = (a: ConversationSnapshot, b: ConversationSnapshot) =>
    new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  return {
    today: today.sort(cmp),
    week:  week.sort(cmp),
    older: older.sort(cmp),
  }
}

export function ConversationRail({
  conversations,
  activeId,
  workspaceId,
  onCreate,
  onSelect,
  onRename,
  onDelete,
}: Props) {
  const groups = useMemo(() => groupByRecency(conversations), [conversations])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftTitle, setDraftTitle] = useState('')

  const startEdit = (c: ConversationSnapshot) => {
    setEditingId(c.id)
    setDraftTitle(c.title)
  }
  const commitEdit = () => {
    if (editingId && draftTitle.trim()) onRename(editingId, draftTitle.trim())
    setEditingId(null)
    setDraftTitle('')
  }
  const cancelEdit = () => {
    setEditingId(null)
    setDraftTitle('')
  }

  const renderRow = (c: ConversationSnapshot) => {
    const isActive = c.id === activeId
    const isEditing = editingId === c.id
    return (
      <li key={c.id}>
        <div
          className={`group flex items-center gap-2 rounded-lg px-3 py-2 transition-colors ${
            isActive
              ? 'bg-stratum-navy text-white'
              : 'text-stratum-ink hover:bg-stratum-surface-low'
          }`}
        >
          <MessageCircle
            className={`h-3.5 w-3.5 shrink-0 ${isActive ? 'text-stratum-sky' : 'text-stratum-muted'}`}
            strokeWidth={1.75}
          />
          {isEditing ? (
            <>
              <input
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitEdit()
                  if (e.key === 'Escape') cancelEdit()
                }}
                autoFocus
                className="flex-1 bg-transparent text-[12px] font-medium outline-none border-b border-stratum-blue/60"
              />
              <button
                type="button"
                onClick={commitEdit}
                className="shrink-0 text-stratum-blue hover:text-stratum-sky"
                aria-label="保存"
              >
                <Check className="h-3.5 w-3.5" strokeWidth={2} />
              </button>
              <button
                type="button"
                onClick={cancelEdit}
                className="shrink-0 text-stratum-muted hover:text-stratum-danger"
                aria-label="取消"
              >
                <X className="h-3.5 w-3.5" strokeWidth={2} />
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => onSelect(c.id)}
                className="flex-1 truncate text-left font-body text-[12px] font-medium"
                title={c.title}
              >
                {c.title}
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  startEdit(c)
                }}
                className={`shrink-0 opacity-0 transition-opacity group-hover:opacity-100 ${
                  isActive ? 'text-white/70 hover:text-white' : 'text-stratum-muted hover:text-stratum-blue'
                }`}
                aria-label="重命名"
              >
                <Pencil className="h-3 w-3" strokeWidth={1.75} />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  if (confirm(`删除会话 "${c.title}"?`)) onDelete(c.id)
                }}
                className={`shrink-0 opacity-0 transition-opacity group-hover:opacity-100 ${
                  isActive ? 'text-white/70 hover:text-stratum-sky' : 'text-stratum-muted hover:text-stratum-danger'
                }`}
                aria-label="删除"
              >
                <Trash2 className="h-3 w-3" strokeWidth={1.75} />
              </button>
            </>
          )}
        </div>
      </li>
    )
  }

  const renderGroup = (label: string, list: ConversationSnapshot[]) => {
    if (list.length === 0) return null
    return (
      <div className="mb-2">
        <p className="px-3 mb-1 font-body text-[10px] font-semibold uppercase tracking-[0.18em] text-stratum-muted">
          {label}
        </p>
        <ul className="space-y-0.5">{list.map(renderRow)}</ul>
      </div>
    )
  }

  return (
    <aside className="flex h-full w-[280px] shrink-0 flex-col border-r border-stratum-line bg-white">
      {/* Brand + new chat */}
      <header className="flex items-center justify-between gap-2 px-4 py-4 border-b border-stratum-line">
        <div className="flex items-center gap-2 min-w-0">
          <span
            aria-hidden="true"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-stratum-navy text-white text-[16px] leading-none"
          >
            ◇
          </span>
          <div className="flex flex-col leading-tight min-w-0">
            <p className="font-display font-[700] text-stratum-navy text-[14px] tracking-tight truncate">
              Starlink
            </p>
            <p className="font-body text-[10px] uppercase tracking-[0.18em] text-stratum-blue">
              MACRA
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onCreate}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-stratum-line bg-stratum-surface-low text-stratum-navy hover:border-stratum-blue/40 hover:bg-white hover:text-stratum-blue transition-colors"
          aria-label="新建会话"
          title="新建会话"
        >
          <MessageSquarePlus className="h-4 w-4" strokeWidth={1.75} />
        </button>
      </header>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto px-2 py-3">
        {renderGroup('今天', groups.today)}
        {renderGroup('过去 7 天', groups.week)}
        {renderGroup('更早', groups.older)}
      </div>

      {/* Bottom: canvas link */}
      <div className="border-t border-stratum-line p-3 space-y-1.5">
        <a
          href={`/canvas/${workspaceId}`}
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-stratum-ink hover:bg-stratum-surface-low transition-colors"
        >
          <LayoutGrid className="h-4 w-4 text-stratum-blue" strokeWidth={1.75} />
          <span className="font-body text-[12px] font-medium">智绘画布</span>
          <span className="ml-auto font-body text-[9px] uppercase tracking-[0.18em] text-stratum-muted">
            CANVAS
          </span>
        </a>
        <p className="px-3 font-body text-[10px] text-stratum-muted">
          Workspace · <span className="font-mono text-stratum-ink">{workspaceId}</span>
        </p>
      </div>
    </aside>
  )
}
