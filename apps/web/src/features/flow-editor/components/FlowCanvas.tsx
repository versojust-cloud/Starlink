'use client'

import type { DragEvent } from 'react'
import ReactFlow, {
  Background,
  Controls,
  type Connection,
  type Node,
  type Edge,
  type NodeChange,
  type EdgeChange,
  BackgroundVariant,
} from 'reactflow'
import 'reactflow/dist/style.css'

import { BaseNode } from '../nodes/BaseNode'
import { AgentNode } from '../nodes/AgentNode'
import { ToolNode } from '../nodes/ToolNode'
import { ControlNode } from '../nodes/ControlNode'
import { InputNode } from '../nodes/InputNode'
import { OutputNode } from '../nodes/OutputNode'
import { DataEdge } from '../edges/DataEdge'
import { AnimatedEdge } from '../edges/AnimatedEdge'
import { FlowMiniMap } from './MiniMap'

const nodeTypes = {
  agent: AgentNode,
  tool: ToolNode,
  control: ControlNode,
  input: InputNode,
  output: OutputNode,
  base: BaseNode,
}

const edgeTypes = {
  data: DataEdge,
  animated: AnimatedEdge,
}

interface FlowCanvasProps {
  nodes: Node[]
  edges: Edge[]
  onNodesChange: (changes: NodeChange[]) => void
  onEdgesChange: (changes: EdgeChange[]) => void
  onConnect: (connection: Connection) => void
  onDrop: (event: DragEvent) => void
  onDragOver: (event: DragEvent) => void
  onNodeClick?: (event: React.MouseEvent, node: Node) => void
}

export function FlowCanvas({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onDrop,
  onDragOver,
  onNodeClick,
}: FlowCanvasProps) {
  return (
    <div className="flex-1 h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultEdgeOptions={{ type: 'data', animated: false }}
        fitView
        className="bg-slate-950"
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#334155" />
        <Controls className="!bg-slate-800 !border-slate-700 [&>button]:!bg-slate-800 [&>button]:!border-slate-700 [&>button]:!text-slate-300" />
        <FlowMiniMap />
      </ReactFlow>
    </div>
  )
}
