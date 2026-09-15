'use client'

import { Boxes, Plus } from 'lucide-react'
import { COMFY_NODE_PALETTE } from '../canvas-config'
import { useComfyShellContext } from '../workspace-shell-context'
import { NODE_HUE, TOKENS } from '../canvas-design-tokens'

/**
 * Node palette panel (refresh-2026-04).
 *
 * Refresh notes:
 *  - Replaced 12-px gradient-glow tile with monochrome card + hue-keyed icon
 *    chip. Hover state is a 1-px border + bg-tint, not a translate-y + glow.
 *  - "Plus" affordance reveals on hover; signals that clicking adds the node
 *    to canvas (matches Stitch / Linear "insert" patterns).
 *  - Drag-and-drop hook ready: payload = `application/starlink-node` JSON,
 *    consumed by canvas onDrop in canvas.tsx (still TODO — palette emits the
 *    drag, drop site needs a follow-up wire-up).
 */
export function NodePalettePanel() {
  const { onAddNode } = useComfyShellContext()

  return (
    <section className={`${TOKENS.surface.panel} p-3`}>
      <header className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-md border border-white/[0.08] bg-white/[0.03]">
            <Boxes className="h-3.5 w-3.5 text-slate-300" strokeWidth={1.75} />
          </div>
          <div>
            <p className={TOKENS.text.kicker}>Node Library</p>
            <h3 className={TOKENS.text.h2}>可拖拽业务组件</h3>
          </div>
        </div>
        <span className="text-[10px] text-slate-500 tabular-nums">
          {COMFY_NODE_PALETTE.length}
        </span>
      </header>

      <ul className="space-y-1.5">
        {COMFY_NODE_PALETTE.map((node) => {
          const hue = NODE_HUE[node.category] ?? NODE_HUE.misc
          return (
            <li key={node.type}>
              <button
                type="button"
                onClick={() => onAddNode(node.type)}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(
                    'application/starlink-node',
                    JSON.stringify({ type: node.type, label: node.label })
                  )
                  e.dataTransfer.effectAllowed = 'copy'
                }}
                className={`group flex w-full items-center gap-2.5 ${TOKENS.surface.card} cursor-grab p-2 text-left active:cursor-grabbing`}
                aria-label={`Add ${node.label} node`}
              >
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-sm ${hue.bg} ${hue.text}`}
                  aria-hidden
                >
                  {node.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block ${TOKENS.text.h2} truncate`}>{node.label}</span>
                  <span className={`block ${TOKENS.text.meta} truncate`}>{node.description}</span>
                </span>
                <Plus
                  className="h-3.5 w-3.5 shrink-0 text-slate-500 opacity-0 transition-opacity group-hover:opacity-100"
                  strokeWidth={1.75}
                />
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
