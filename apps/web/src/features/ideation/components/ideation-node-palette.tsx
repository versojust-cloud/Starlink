'use client'

import { Boxes } from 'lucide-react'
import { IDEATION_HUE, TOKENS } from '@/features/comfy/components/canvas-design-tokens'
import { IDEATION_PALETTE } from '../registries/ideation-node-registry'
import { useIdeationStore } from '../store/ideation-store'

/**
 * Left-rail palette. Each entry is:
 *   - clickable (drops a new node at a random center position) AND
 *   - draggable (canvas onDrop creates the node at exact drop coords)
 *
 * Drag payload: `application/starlink-ideation-kind` (string kind).
 */
export function IdeationNodePalette() {
  const addNode = useIdeationStore((s) => s.addNode)

  return (
    <aside className="flex w-72 shrink-0 flex-col gap-3 overflow-y-auto border-r border-white/[0.06] bg-slate-950/40 p-3 backdrop-blur-xl">
      <section className={`${TOKENS.surface.panel} p-3`}>
        <header className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-md border border-white/[0.08] bg-white/[0.03]">
              <Boxes className="h-3.5 w-3.5 text-slate-300" strokeWidth={1.75} />
            </div>
            <div>
              <p className={TOKENS.text.kicker}>Idea Library</p>
              <h3 className={TOKENS.text.h2}>9 类想法节点</h3>
            </div>
          </div>
          <span className="text-[10px] text-slate-500 tabular-nums">{IDEATION_PALETTE.length}</span>
        </header>

        <ul className="space-y-1.5">
          {IDEATION_PALETTE.map((item) => {
            const hue = IDEATION_HUE[item.kind]
            return (
              <li key={item.kind}>
                <button
                  type="button"
                  onClick={() => addNode(item.kind)}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(
                      'application/starlink-ideation-kind',
                      item.kind
                    )
                    e.dataTransfer.effectAllowed = 'copy'
                  }}
                  className="group flex w-full items-center gap-2.5 rounded-xl border border-white/[0.06] bg-slate-950/40 p-2 text-left transition-colors hover:border-white/[0.14] hover:bg-slate-900/60 cursor-grab active:cursor-grabbing"
                  aria-label={`添加 ${item.label} 节点`}
                >
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-sm ${hue.bg} ${hue.text}`}
                    aria-hidden
                  >
                    {item.icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`block ${TOKENS.text.h2} truncate`}>{item.label}</span>
                    <span className={`block ${TOKENS.text.meta} truncate`}>{item.description}</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </section>

      <section className={`${TOKENS.surface.panel} p-3`}>
        <p className={TOKENS.text.kicker}>Tips</p>
        <ul className="mt-2 space-y-1.5 text-[11px] leading-relaxed text-slate-400">
          <li>· 点击节点 = 加到画布中央</li>
          <li>· 拖拽节点 = 加到鼠标位置</li>
          <li>· 节点之间可拖线（顶/底圆点）</li>
          <li>· 点 ✏ 打开右栏编辑器</li>
        </ul>
      </section>
    </aside>
  )
}
