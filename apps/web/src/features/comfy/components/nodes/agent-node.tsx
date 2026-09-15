'use client'

import { memo, useState, useEffect } from 'react'
import { Handle, Position, type NodeProps } from 'reactflow'
import { Card, CardHeader, CardTitle, CardContent } from '@/shared/components/ui/card'
import { Badge } from '@/shared/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'
import { useComfyStore } from '../../store'
import { Bot, Loader2 } from 'lucide-react'

const AGENT_TYPES = [
  { value: 'data-analyst', label: 'Data Analyst', description: '数据分析专家' },
  { value: 'vision-reviewer', label: 'Vision Reviewer', description: '图像分析专家' },
  { value: 'content-writer', label: 'Content Writer', description: '内容创作者' },
  { value: 'code-reviewer', label: 'Code Reviewer', description: '代码审查员' }
]

export const AgentNode = memo(function AgentNode({ id }: NodeProps) {
  const updateNodeData = useComfyStore((state) => state.updateNodeData)
  const nodeData = useComfyStore((state) => state.nodeDataMap.get(id))
  const isExecuting = useComfyStore((state) => state.executingNodeId === id)
  const [agentType, setAgentType] = useState(nodeData?.agentType || 'data-analyst')
  const [instruction, setInstruction] = useState(nodeData?.systemInstruction || '')

  useEffect(() => {
    updateNodeData(id, {
      agentType,
      systemInstruction: instruction
    })
  }, [agentType, id, instruction, updateNodeData])

  const getStatusBadge = () => {
    if (isExecuting) {
      return <Badge className="bg-yellow-500"><Loader2 className="w-3 h-3 mr-1 animate-spin" />Thinking</Badge>
    }
    if (nodeData?.status === 'done') {
      return <Badge variant="success">Done</Badge>
    }
    if (nodeData?.status === 'error') {
      return <Badge variant="destructive">Error</Badge>
    }
    return <Badge variant="outline" className="text-zinc-400">Idle</Badge>
  }

  return (
    <>
      <Handle
        type="target"
        position={Position.Left}
        className="h-2.5 w-2.5 rounded-full border-2 border-slate-950 bg-cyan-400"
      />
      <Card
        className={`w-80 rounded-xl border border-white/[0.08] bg-slate-900/60 backdrop-blur-xl transition-colors hover:border-white/[0.16] canvas-panel-node ${isExecuting ? 'executing' : ''}`}
      >
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-[13px] font-semibold text-white">
            <Bot className="h-4 w-4 text-cyan-300" strokeWidth={1.75} />
            Agent Node
            {getStatusBadge()}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">Agent Type</label>
            <Select value={agentType} onValueChange={setAgentType}>
              <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-100">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-zinc-800 border-zinc-700">
                {AGENT_TYPES.map(type => (
                  <SelectItem
                    key={type.value}
                    value={type.value}
                    className="text-zinc-100 focus:bg-zinc-700"
                  >
                    <div>
                      <div className="font-medium">{type.label}</div>
                      <div className="text-xs text-zinc-400">{type.description}</div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-xs text-zinc-400 mb-1 block">System Instruction</label>
            <textarea
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder="输入系统指令..."
              className="w-full h-24 bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
            />
          </div>

          {nodeData?.error && (
            <div className="text-xs text-red-400 bg-red-500/10 p-2 rounded border border-red-500/20">
              {nodeData.error}
            </div>
          )}
        </CardContent>
        <Handle
          type="source"
          position={Position.Right}
          className="h-2.5 w-2.5 rounded-full border-2 border-slate-950 bg-emerald-400"
        />
      </Card>
    </>
  )
})
