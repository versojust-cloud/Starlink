/**
 * Flow (workflow) type definitions.
 * A Flow is a directed graph of Tool nodes connected by data edges.
 */

import type { PortType } from '../tool-registry/types.js'

// ── Node ──────────────────────────────────────────────────

export interface FlowNodePort {
  name: string
  type: PortType
  description: string
  required?: boolean
}

export type FlowNodeType = 'agent' | 'tool' | 'control' | 'input' | 'output'

export interface FlowNodePosition {
  x: number
  y: number
}

export interface FlowNode {
  id: string
  toolName: string
  type: FlowNodeType
  label: string
  position: FlowNodePosition
  config: Record<string, unknown>
  inputPorts: FlowNodePort[]
  outputPorts: FlowNodePort[]
}

// ── Edge ──────────────────────────────────────────────────

export interface FlowEdge {
  id: string
  source: string
  sourcePort: string
  target: string
  targetPort: string
}

// ── Flow Definition ───────────────────────────────────────

export interface FlowConfig {
  maxExecutionTime?: number
  enableCache?: boolean
  defaultModel?: string
}

export interface FlowDefinition {
  id: string
  name: string
  description?: string
  nodes: FlowNode[]
  edges: FlowEdge[]
  config: FlowConfig
}
