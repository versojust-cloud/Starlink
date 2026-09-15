/**
 * Canvas layout registry — pluggable strategies for arranging hydrated
 * nodes on the canvas. The default strategy is the canonical 9-cell
 * BMC grid; future strategies (Lean Canvas, Value Prop Canvas, free
 * form) plug in via `registerCanvasLayout`.
 *
 * Extension: drop a new file under store/ that calls
 * registerCanvasLayout('lean-canvas', applyLeanLayout) at module load.
 * The store's hydrateFromConversation reads the activeLayoutId and
 * dispatches the corresponding strategy. UI can switch layouts by
 * setting state.activeLayoutId.
 */

import type { Node } from 'reactflow'
import { applyBmcLayout, applyFreeformLayout } from './apply-bmc-layout'

export type CanvasLayoutId = 'bmc-9-grid' | 'free-form' | (string & {})

type LayoutStrategy = <T extends Node>(nodes: T[]) => T[]

const REGISTRY = new Map<CanvasLayoutId, { label: string; description: string; apply: LayoutStrategy }>()

REGISTRY.set('bmc-9-grid', {
  label: 'BMC 九宫格',
  description: '客户细分 / 价值主张 / 收入来源 — 经典 9 cell 分布',
  apply: applyBmcLayout,
})

REGISTRY.set('free-form', {
  label: '自由布局',
  description: '9 BMC cell 锚定到经典网格，其余节点（insight / report / mention）保留 server 位置可自由拖动',
  apply: applyFreeformLayout,
})

export function registerCanvasLayout(
  id: CanvasLayoutId,
  descriptor: { label: string; description: string; apply: LayoutStrategy }
): void {
  REGISTRY.set(id, descriptor)
}

export function applyCanvasLayout<T extends Node>(id: CanvasLayoutId, nodes: T[]): T[] {
  const strategy = REGISTRY.get(id) ?? REGISTRY.get('bmc-9-grid')
  return strategy ? strategy.apply(nodes) : nodes
}

export function listCanvasLayouts(): Array<{ id: CanvasLayoutId; label: string; description: string }> {
  return Array.from(REGISTRY.entries()).map(([id, d]) => ({ id, label: d.label, description: d.description }))
}
