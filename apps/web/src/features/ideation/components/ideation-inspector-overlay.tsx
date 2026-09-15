'use client'

import { X } from 'lucide-react'
import { IDEATION_HUE, TOKENS } from '@/features/comfy/components/canvas-design-tokens'
import { useIdeationStore, useInspectedNode } from '../store/ideation-store'
import type { IdeationNodeData } from '../types/ideation-types'
import { TypedFields } from './ideation-inspector-fields'

/**
 * Inspector — overlay variant.
 *
 * Replaces the previous permanent right-rail inspector. The chat panel now
 * always occupies the right rail, so editing a node opens this as a centered
 * modal instead. Click backdrop or press the close button to dismiss.
 *
 * Stage A: edits label + content. Per-kind metadata (status, severity …)
 * lands in Stage C.
 */
export function IdeationInspectorOverlay() {
  const node = useInspectedNode()
  const closeInspector = useIdeationStore((s) => s.closeInspector)
  const updateNodeData = useIdeationStore((s) => s.updateNodeData)
  const removeNode = useIdeationStore((s) => s.removeNode)

  if (!node) return null
  const data = node.data
  const hue = IDEATION_HUE[data.kind] ?? IDEATION_HUE['core-idea']

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm"
      onClick={closeInspector}
      role="presentation"
    >
      <div
        className={`w-[480px] max-w-[calc(100vw-2rem)] ${TOKENS.surface.panel} max-h-[80vh] overflow-y-auto p-4`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <header className="mb-3 flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <span className={`flex h-8 w-8 items-center justify-center rounded-md ${hue.bg} ${hue.text}`}>
              ✎
            </span>
            <div>
              <p className={TOKENS.text.kicker}>Inspector · {data.kind}</p>
              <h3 className={TOKENS.text.h2}>编辑节点</h3>
            </div>
          </div>
          <button
            type="button"
            onClick={closeInspector}
            className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-white/[0.06] hover:text-slate-100"
            aria-label="关闭"
          >
            <X className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>
        </header>

        <div className="space-y-3">
          <div>
            <label className={`${TOKENS.text.kicker} block`}>标题</label>
            <input
              type="text"
              value={data.label}
              onChange={(e) =>
                updateNodeData(node.id, { label: e.target.value } as Partial<IdeationNodeData>)
              }
              className={`mt-1 block w-full ${TOKENS.surface.input} bg-slate-950/60 px-2.5 py-1.5 text-[13px] text-white outline-none placeholder:text-slate-500`}
              placeholder="一句话点题"
            />
          </div>

          <div>
            <label className={`${TOKENS.text.kicker} block`}>正文（Markdown）</label>
            <textarea
              value={data.content}
              onChange={(e) =>
                updateNodeData(node.id, { content: e.target.value } as Partial<IdeationNodeData>)
              }
              className={`mt-1 block h-44 w-full resize-none ${TOKENS.surface.input} bg-slate-950/60 px-2.5 py-2 text-[12px] leading-relaxed text-slate-100 outline-none placeholder:text-slate-500`}
              placeholder="支持 Markdown：列表 / 加粗 / 链接……"
            />
          </div>

          {/* Per-kind structured metadata — surfaces the fields each kind
              cares about (hypothesis status, risk severity, validation cost,
              etc) below the freeform body. */}
          <TypedFields node={node} />

          <div className="flex items-center gap-2 pt-2">
            <button
              type="button"
              onClick={closeInspector}
              className={TOKENS.button.primary}
            >
              完成
            </button>
            <button
              type="button"
              onClick={() => {
                if (window.confirm('删除此节点？')) {
                  removeNode(node.id)
                }
              }}
              className={`${TOKENS.button.ghost} ml-auto text-rose-300 hover:text-rose-200`}
            >
              删除节点
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
