import type { ComponentType } from 'react'
import type { NodeProps } from 'reactflow'
import { CoreIdeaNode } from '../components/nodes/core-idea-node'
import { CustomerPainNode } from '../components/nodes/customer-pain-node'
import { ValueAngleNode } from '../components/nodes/value-angle-node'
import { HypothesisNode } from '../components/nodes/hypothesis-node'
import { ValidationChannelNode } from '../components/nodes/validation-channel-node'
import { RevenueNode } from '../components/nodes/revenue-node'
import { RiskNode } from '../components/nodes/risk-node'
import { EvidenceNode } from '../components/nodes/evidence-node'
import { ReflectionNode } from '../components/nodes/reflection-node'
import type { IdeationPaletteItem } from '../types/ideation-types'

/**
 * Mapping consumed by ReactFlow's `nodeTypes` prop. Keys MUST match
 * IdeationNodeKind so React Flow can resolve `node.type` → component.
 */
export const ideationNodeTypes: Record<string, ComponentType<NodeProps>> = {
  'core-idea': CoreIdeaNode as unknown as ComponentType<NodeProps>,
  'customer-pain': CustomerPainNode as unknown as ComponentType<NodeProps>,
  'value-angle': ValueAngleNode as unknown as ComponentType<NodeProps>,
  hypothesis: HypothesisNode as unknown as ComponentType<NodeProps>,
  'validation-channel': ValidationChannelNode as unknown as ComponentType<NodeProps>,
  revenue: RevenueNode as unknown as ComponentType<NodeProps>,
  risk: RiskNode as unknown as ComponentType<NodeProps>,
  evidence: EvidenceNode as unknown as ComponentType<NodeProps>,
  reflection: ReflectionNode as unknown as ComponentType<NodeProps>
}

/**
 * Palette entries — drives the left rail. Order matches the typical creative
 * flow (root idea → who hurts → why us → ……).
 */
export const IDEATION_PALETTE: IdeationPaletteItem[] = [
  {
    kind: 'core-idea',
    label: '核心想法',
    icon: '✦',
    description: '一句话描述你想做什么'
  },
  {
    kind: 'customer-pain',
    label: '客户痛点',
    icon: '☹',
    description: '谁在哪里痛？多痛？多频繁？'
  },
  {
    kind: 'value-angle',
    label: '价值角度',
    icon: '◆',
    description: '你给的价值 / 差异化点'
  },
  {
    kind: 'hypothesis',
    label: '假设',
    icon: '◊',
    description: '可证伪的具体猜想'
  },
  {
    kind: 'validation-channel',
    label: '验证渠道',
    icon: '◉',
    description: '怎么 cheap 验证假设'
  },
  {
    kind: 'revenue',
    label: '收入流',
    icon: '↑',
    description: '商业模式与定价假设'
  },
  {
    kind: 'risk',
    label: '风险',
    icon: '!',
    description: '什么会让它走不下去'
  },
  {
    kind: 'evidence',
    label: '证据',
    icon: '◈',
    description: '一手 / 二手 / 数据支撑'
  },
  {
    kind: 'reflection',
    label: 'AI 反思',
    icon: '?',
    description: 'AI 主动产出的引导问句'
  }
]
