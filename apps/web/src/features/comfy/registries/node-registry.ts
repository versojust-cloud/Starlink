import type { ComponentType } from 'react'
import type { NodeProps } from 'reactflow'
import { AgentAvatarNode } from '../components/nodes/agent-avatar-node'
import { CanvasImageNode } from '../components/nodes/canvas-image-node'
import { CanvasNoteNode } from '../components/nodes/canvas-note-node'
import { CCBMCCardNode } from '../components/nodes/cc-bmc-card-node'
import { ConflictAlertNode } from '../components/nodes/conflict-alert-node'
import { DataSourceNode } from '../components/nodes/data-source-node'
import { InsightNoteNode } from '../components/nodes/insight-note-node'
import { PlanNode } from '../components/nodes/plan-node'
import { ReportCardNode } from '../components/nodes/report-card-node'
import { createRegistry } from './base-registry'

type NodePaletteCategory = 'bmc' | 'agent' | 'data' | 'insight' | 'misc'

export type NodeDescriptor = {
  id: string
  type: string
  label: string
  icon?: string
  component: ComponentType<NodeProps>
  palette?: {
    gradient: string
    description: string
    category: NodePaletteCategory
  }
  defaultData?: () => unknown
}

const registry = createRegistry<NodeDescriptor>()

function registerNode(descriptor: Omit<NodeDescriptor, 'id'>) {
  registry.register({
    ...descriptor,
    id: descriptor.type
  })
}

registerNode({
  type: 'agent-avatar',
  label: 'AI 顾问',
  icon: '🤖',
  component: AgentAvatarNode,
  palette: {
    gradient: 'from-emerald-400 to-emerald-500',
    description: '虚拟专家顾问',
    category: 'agent'
  }
})

;[
  'cc-bmc-card',
  'cc-bmc-customer-segments',
  'cc-bmc-customer-relationships',
  'cc-bmc-channels',
  'cc-bmc-value-propositions',
  'cc-bmc-revenue-streams',
  'cc-bmc-key-activities',
  'cc-bmc-key-resources',
  'cc-bmc-key-partnerships',
  'cc-bmc-cost-structure'
].forEach((type) => {
  registerNode({
    type,
    label: '商业卡片',
    icon: '💎',
    component: CCBMCCardNode,
    palette: type === 'cc-bmc-card'
      ? {
          gradient: 'from-amber-400 to-amber-500',
          description: '核心业务模型卡片',
          category: 'bmc'
        }
      : undefined
  })
})

registerNode({
  type: 'conflict-alert',
  label: '冲突提醒',
  component: ConflictAlertNode
})

registerNode({
  type: 'insight-note',
  label: '洞察便签',
  icon: '💡',
  component: InsightNoteNode,
  palette: {
    gradient: 'from-blue-400 to-blue-500',
    description: 'AI 生成的洞察',
    category: 'insight'
  }
})

registerNode({
  type: 'plan-node',
  label: '计划节点',
  component: PlanNode
})

registerNode({
  type: 'data-source',
  label: '数据源',
  icon: '🗂️',
  component: DataSourceNode,
  palette: {
    gradient: 'from-cyan-400 to-sky-500',
    description: '研究资料与数据输入',
    category: 'data'
  }
})

registerNode({
  type: 'canvas-note',
  label: '画布便签',
  component: CanvasNoteNode
})

registerNode({
  type: 'report-card',
  label: '整份报告',
  icon: '📋',
  component: ReportCardNode,
  palette: {
    gradient: 'from-slate-700 to-slate-900',
    description: 'report-writer 输出的整份商业报告',
    category: 'insight'
  }
})

registerNode({
  type: 'canvas-image',
  label: '画布图片',
  component: CanvasImageNode
})

export const nodeRegistry = registry

export function getReactFlowNodeTypes() {
  return Object.fromEntries(
    nodeRegistry.all().map((descriptor) => [descriptor.type, descriptor.component])
  )
}

export function getNodePaletteItems() {
  return nodeRegistry
    .all()
    .filter((descriptor) => descriptor.palette)
    .map((descriptor) => ({
      type: descriptor.type,
      label: descriptor.label,
      icon: descriptor.icon ?? '•',
      gradient: descriptor.palette?.gradient ?? 'from-slate-400 to-slate-500',
      description: descriptor.palette?.description ?? '',
      // Expose category so the panel can pick a hue token from
      // canvas-design-tokens.NODE_HUE without re-deriving it from gradient.
      category: descriptor.palette?.category ?? 'misc'
    }))
}
