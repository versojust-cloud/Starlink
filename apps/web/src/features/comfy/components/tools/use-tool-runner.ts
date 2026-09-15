'use client'

import { useCallback } from 'react'
import type { Node } from 'reactflow'
import { useComfyStore } from '../../store'
import type { ToolContext, ToolDescriptor } from '../../registries/tool-registry'

type ToolRunOptions = {
  summarize?: (result: unknown) => string
}

export function useToolInvoker() {
  const workspaceId = useComfyStore((state) => state.workspaceId)
  const currentConversationId = useComfyStore((state) => state.currentConversationId)
  const nodes = useComfyStore((state) => state.nodes)
  const setNodes = useComfyStore((state) => state.setNodes)
  const appendChatMessage = useComfyStore((state) => state.appendChatMessage)
  const setToolRunState = useComfyStore((state) => state.setToolRunState)

  return useCallback(
    async (tool: ToolDescriptor, input: unknown, options?: ToolRunOptions) => {
      const startedAt = new Date().toISOString()
      setToolRunState(tool.id, {
        status: 'running',
        startedAt,
        completedAt: null,
        error: null,
        resultSummary: null,
        result: null
      })

      try {
        const selectedNodeIds = nodes.filter((node) => node.selected).map((node) => node.id)
        const context: ToolContext = {
          workspaceId,
          conversationId: currentConversationId,
          selectedNodeIds,
          store: useComfyStore.getState(),
          addNode: (partialNode) => {
            const nextNode: Node = {
              id: partialNode.id ?? `${tool.id}-${Date.now()}`,
              type: partialNode.type ?? 'insight-note',
              position: partialNode.position ?? {
                x: Math.random() * 360 + 420,
                y: Math.random() * 260 + 180
              },
              data: partialNode.data ?? {}
            }
            setNodes((currentNodes) => [...currentNodes, nextNode])
          },
          appendChatMessage
        }

        const result = tool.invoke
          ? await tool.invoke(input, context)
          : { message: `${tool.name} 没有配置 invoke。` }

        tool.onResult?.(result, context)

        const resultSummary = options?.summarize?.(result) ?? `${tool.name} 执行完成`
        setToolRunState(tool.id, {
          status: 'completed',
          completedAt: new Date().toISOString(),
          error: null,
          resultSummary,
          result
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : `${tool.name} 执行失败`
        setToolRunState(tool.id, {
          status: 'failed',
          completedAt: new Date().toISOString(),
          error: message,
          resultSummary: message,
          result: null
        })
      }
    },
    [
      appendChatMessage,
      currentConversationId,
      nodes,
      setNodes,
      setToolRunState,
      workspaceId
    ]
  )
}

export function useToolRunner(tool: ToolDescriptor, options?: ToolRunOptions) {
  const invokeTool = useToolInvoker()

  return useCallback(
    (input: unknown) => invokeTool(tool, input, options),
    [invokeTool, options, tool]
  )
}
