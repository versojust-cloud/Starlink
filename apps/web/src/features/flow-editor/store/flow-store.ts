import { create } from 'zustand'
import {
  type Node,
  type Edge,
  type Connection,
  type XYPosition,
  addEdge as rfAddEdge,
} from 'reactflow'
import { nanoid } from 'nanoid'

/* ---------- types ---------- */

export interface ToolDef {
  name: string
  label: string
  category: string
  icon?: string
  color?: string
  inputSchema?: Record<string, unknown>
  outputSchema?: Record<string, unknown>
  inputPorts?: { name: string; type: string; description?: string; required?: boolean }[]
  outputPorts?: { name: string; type: string; description?: string; required?: boolean }[]
}

export interface FlowDefinition {
  id: string | null
  name: string
  nodes: Node[]
  edges: Edge[]
}

export interface NodeConfig {
  [key: string]: unknown
}

/* ---------- state ---------- */

interface FlowState {
  nodes: Node[]
  edges: Edge[]
  selectedNodeId: string | null
  flowId: string | null
  flowName: string
  isDirty: boolean

  // actions
  addNode: (toolDef: ToolDef, position: XYPosition) => void
  removeNode: (id: string) => void
  updateNodeConfig: (nodeId: string, config: NodeConfig) => void
  addEdge: (connection: Connection) => void
  removeEdge: (id: string) => void
  setSelectedNode: (id: string | null) => void
  loadFlow: (definition: FlowDefinition) => void
  toFlowDefinition: () => FlowDefinition
  setFlowName: (name: string) => void
}

/* ---------- store ---------- */

export const useFlowStore = create<FlowState>((set, get) => ({
  nodes: [],
  edges: [],
  selectedNodeId: null,
  flowId: null,
  flowName: 'Untitled Flow',
  isDirty: false,

  addNode(toolDef, position) {
    const id = `node_${nanoid(8)}`
    const newNode: Node = {
      id,
      type: toolDef.name,
      position,
      data: {
        label: toolDef.label,
        toolName: toolDef.name,
        category: toolDef.category,
        icon: toolDef.icon,
        color: toolDef.color,
        config: {},
        inputPorts: toolDef.inputPorts ?? [],
        outputPorts: toolDef.outputPorts ?? [],
      },
    }
    set((s) => ({ nodes: [...s.nodes, newNode], isDirty: true }))
  },

  removeNode(id) {
    set((s) => ({
      nodes: s.nodes.filter((n) => n.id !== id),
      edges: s.edges.filter((e) => e.source !== id && e.target !== id),
      selectedNodeId: s.selectedNodeId === id ? null : s.selectedNodeId,
      isDirty: true,
    }))
  },

  updateNodeConfig(nodeId, config) {
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === nodeId
          ? { ...n, data: { ...n.data, config: { ...n.data.config, ...config } } }
          : n,
      ),
      isDirty: true,
    }))
  },

  addEdge(connection) {
    set((s) => ({
      edges: rfAddEdge(connection, s.edges),
      isDirty: true,
    }))
  },

  removeEdge(id) {
    set((s) => ({
      edges: s.edges.filter((e) => e.id !== id),
      isDirty: true,
    }))
  },

  setSelectedNode(id) {
    set({ selectedNodeId: id })
  },

  loadFlow(definition) {
    set({
      flowId: definition.id,
      flowName: definition.name,
      nodes: definition.nodes,
      edges: definition.edges,
      isDirty: false,
      selectedNodeId: null,
    })
  },

  toFlowDefinition() {
    const { flowId, flowName, nodes, edges } = get()
    return { id: flowId, name: flowName, nodes, edges }
  },

  setFlowName(name) {
    set({ flowName: name, isDirty: true })
  },
}))
