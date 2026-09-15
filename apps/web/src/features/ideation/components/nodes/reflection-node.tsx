'use client'

import { MessageCircleQuestion, Check } from 'lucide-react'
import type { NodeProps } from 'reactflow'
import { BaseIdeationNode, MarkdownBody, MetaChip } from './base-ideation-node'
import type { ReflectionNodeData } from '../../types/ideation-types'
import { useIdeationStore } from '../../store/ideation-store'

const SCAFFOLD_LABEL = {
  why: '为什么',
  how: '如何',
  'so-what': '那又怎样',
  'evidence-needed': '需要证据',
  meta: 'Meta 综合'
} as const

/**
 * Reflection node — AI-generated prompts that nudge the user to deepen their
 * thinking. Visually muted (the user's nodes should dominate the canvas), but
 * with a clear "acknowledged" state so the user can mark prompts as handled.
 */
export function ReflectionNode({ id, data }: NodeProps<ReflectionNodeData>) {
  const removeNode = useIdeationStore((s) => s.removeNode)
  const openInspector = useIdeationStore((s) => s.openInspector)
  const updateNodeData = useIdeationStore((s) => s.updateNodeData)
  const scaffold = data.scaffold ?? 'why'
  const acknowledged = data.acknowledged ?? false

  return (
    <BaseIdeationNode
      kind="reflection"
      kindLabel={`AI · ${SCAFFOLD_LABEL[scaffold]}`}
      label={data.label || '反思引导'}
      icon={<MessageCircleQuestion className="h-3.5 w-3.5" strokeWidth={1.75} />}
      onEdit={() => openInspector(id)}
      onDelete={() => removeNode(id)}
      badgeSlot={
        acknowledged && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded bg-emerald-400/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-emerald-200">
            <Check className="h-2.5 w-2.5" strokeWidth={2} />
            已处理
          </span>
        )
      }
      body={
        <>
          <MarkdownBody
            content={data.content}
            placeholder="AI 还在思考你的画布……"
          />
          <button
            type="button"
            onClick={() =>
              updateNodeData<ReflectionNodeData>(id, {
                acknowledged: !acknowledged
              })
            }
            className={`inline-flex w-full items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-[11px] font-medium transition-colors ${
              acknowledged
                ? 'border-emerald-400/30 bg-emerald-400/[0.08] text-emerald-200 hover:bg-emerald-400/[0.12]'
                : 'border-indigo-400/30 bg-indigo-400/[0.08] text-indigo-200 hover:bg-indigo-400/[0.12]'
            }`}
          >
            {acknowledged ? '取消标记' : '标记为已处理'}
          </button>
        </>
      }
      metaSlot={<MetaChip kind="reflection">{SCAFFOLD_LABEL[scaffold]}</MetaChip>}
    />
  )
}
