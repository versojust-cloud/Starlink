'use client'

import { CheckCircle2, Loader2, X } from 'lucide-react'
import { useComfyStore } from '../../store'
import { getToolById } from '../../registries/tool-registry'
import { TOKENS } from '../canvas-design-tokens'

const STATUS_LABELS = {
  idle: '待执行',
  running: '执行中',
  completed: '已完成',
  failed: '失败'
} as const

const STATUS_TONE = {
  idle: 'bg-white/[0.04] text-slate-400',
  running: 'bg-cyan-400/10 text-cyan-300',
  completed: 'bg-emerald-400/10 text-emerald-300',
  failed: 'bg-rose-400/10 text-rose-300'
} as const

/**
 * Tool drawer panel (refresh-2026-04).
 *
 * Refresh notes:
 *  - Header gradient tile dropped — tool icon now neutral with hue from
 *    `tool.accentClassName` reduced to a single accent color via opacity.
 *  - Status row inlined with the header (no separate row).
 *  - Width reduced 430 → 400 to match Linear / Notion drawer width.
 */
export function ToolDrawerPanel() {
  const activeToolId = useComfyStore((state) => state.activeToolId)
  const closeToolDrawer = useComfyStore((state) => state.closeToolDrawer)
  const runState = useComfyStore((state) =>
    activeToolId ? state.toolRunStates[activeToolId] : undefined
  )
  const tool = getToolById(activeToolId)

  if (!tool) return null

  const Icon = tool.icon
  const DrawerComponent = tool.DrawerComponent
  const status = runState?.status ?? 'idle'

  return (
    <div className="pointer-events-none absolute inset-y-0 right-0 z-40 flex justify-end">
      <aside
        className="pointer-events-auto flex h-full w-[400px] flex-col border-l border-white/[0.06] bg-slate-950/90 backdrop-blur-xl"
        role="dialog"
        aria-label={tool.name}
      >
        <header className="border-b border-white/[0.06] p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-2.5">
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-gradient-to-br ${tool.accentClassName} opacity-80`}
              >
                <Icon className="h-4 w-4 text-white" />
              </span>
              <div className="min-w-0">
                <p className={TOKENS.text.kicker}>{tool.command}</p>
                <h2 className={`mt-0.5 truncate ${TOKENS.text.h1}`}>{tool.name}</h2>
                <p className={`mt-1 ${TOKENS.text.meta} leading-relaxed line-clamp-2`}>
                  {tool.description}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={closeToolDrawer}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-white/[0.06] text-slate-400 transition-colors hover:border-white/[0.14] hover:text-white"
              aria-label="关闭工具抽屉"
            >
              <X className="h-3.5 w-3.5" strokeWidth={1.75} />
            </button>
          </div>

          <div className="mt-3 flex items-center justify-between gap-3">
            <span className={TOKENS.text.kicker}>Tool State</span>
            <span
              className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-medium ${STATUS_TONE[status]}`}
            >
              {status === 'running' ? (
                <Loader2 className="h-3 w-3 animate-spin" strokeWidth={2} />
              ) : status === 'completed' ? (
                <CheckCircle2 className="h-3 w-3" strokeWidth={2} />
              ) : (
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
              )}
              {STATUS_LABELS[status]}
            </span>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {DrawerComponent ? (
            <DrawerComponent tool={tool} />
          ) : (
            <div className="rounded-xl border border-dashed border-white/[0.08] bg-slate-950/30 p-5 text-[12px] text-slate-400">
              这个工具还没有配置 DrawerComponent。
            </div>
          )}
        </div>
      </aside>
    </div>
  )
}
