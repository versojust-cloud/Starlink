'use client'

import { useCallback, useState, DragEvent } from 'react'
import { ReactFlowProvider, useNodesState, useEdgesState, addEdge, type Connection, type Node } from 'reactflow'
import { nanoid } from 'nanoid'
import { FlowCanvas } from './FlowCanvas'
import { NodePanel } from './NodePanel'
import { ConfigPanel } from './ConfigPanel'
import { ExecutionBar } from './ExecutionBar'
import { FlowToolbar } from './FlowToolbar'

interface FlowEditorProps {
  workspaceId: string
  flowId?: string
}

export function FlowEditor({ workspaceId }: FlowEditorProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [flowName, setFlowName] = useState('Untitled Flow')

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) => addEdge({ ...connection, type: 'data' }, eds))
    },
    [setEdges],
  )

  const onDragOver = useCallback((event: DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }, [])

  const onDrop = useCallback(
    (event: DragEvent) => {
      event.preventDefault()
      const toolData = event.dataTransfer.getData('application/starlink-tool')
      if (!toolData) return

      try {
        const toolDef = JSON.parse(toolData)
        const bounds = (event.target as HTMLElement).closest('.react-flow')?.getBoundingClientRect()
        if (!bounds) return

        const position = {
          x: event.clientX - bounds.left,
          y: event.clientY - bounds.top,
        }

        const nodeType = toolDef.category === 'llm_agent' ? 'agent'
          : toolDef.category === 'control_flow' ? 'control'
          : 'tool'

        const newNode: Node = {
          id: nanoid(),
          type: nodeType,
          position,
          data: {
            toolDef,
            config: {},
            status: 'pending',
          },
        }

        setNodes((nds) => [...nds, newNode])
      } catch {
        // Invalid drag data
      }
    },
    [setNodes],
  )

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNodeId(node.id)
  }, [])

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) ?? null

  return (
    <ReactFlowProvider>
      <div className="flex flex-col h-screen bg-slate-950 text-slate-200">
        <FlowToolbar
          flowName={flowName}
          onFlowNameChange={setFlowName}
          nodes={nodes}
          edges={edges}
        />
        <div className="flex flex-1 overflow-hidden">
          <NodePanel />
          <FlowCanvas
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onNodeClick={onNodeClick}
          />
          {selectedNode && (
            <ConfigPanel
              node={selectedNode}
              onUpdateConfig={(key, value) => {
                setNodes((nds) =>
                  nds.map((n) =>
                    n.id === selectedNodeId
                      ? { ...n, data: { ...n.data, config: { ...n.data.config, [key]: value } } }
                      : n,
                  ),
                )
              }}
              onClose={() => setSelectedNodeId(null)}
            />
          )}
        </div>
        <ExecutionBar workspaceId={workspaceId} />
      </div>
    </ReactFlowProvider>
  )
}
