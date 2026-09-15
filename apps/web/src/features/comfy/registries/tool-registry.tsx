import type { ComponentType } from 'react'
import type { Node } from 'reactflow'
import type { ComfyStore } from '../store'
import { createRegistry } from './base-registry'

export type ToolInvocationMode =
  | 'inline-drawer'
  | 'slash-command'
  | 'context-menu'
  | 'agent-auto'

export type ToolCategory = 'research' | 'translation' | 'knowledge' | 'expert' | 'utility'

export type ToolIcon = ComponentType<{ className?: string }>

export type ToolDrawerComponentProps = {
  tool: ToolDescriptor
}

export type ToolContext = {
  workspaceId: string
  conversationId: string | null
  selectedNodeIds: string[]
  store: ComfyStore
  addNode: (node: Partial<Node>) => void
  appendChatMessage: ComfyStore['appendChatMessage']
}

export type ToolDescriptor<TInput = unknown, TResult = unknown> = {
  id: string
  command: `@${string}`
  name: string
  description: string
  category: ToolCategory
  icon: ToolIcon
  accentClassName: string
  modes: ToolInvocationMode[]
  DrawerComponent?: ComponentType<ToolDrawerComponentProps>
  invoke?: (input: TInput, context: ToolContext) => Promise<TResult>
  onResult?: (result: TResult, context: ToolContext) => void
}

export const toolRegistry = createRegistry<ToolDescriptor>()

export function registerTool<TInput = unknown, TResult = unknown>(tool: ToolDescriptor<TInput, TResult>) {
  toolRegistry.register(tool as ToolDescriptor)
}

export function getToolById(toolId: string | null) {
  if (!toolId) return undefined
  return toolRegistry.get(toolId)
}

export function getToolPaletteItems() {
  return toolRegistry
    .all()
    .filter((tool) => tool.modes.includes('inline-drawer') || tool.modes.includes('slash-command'))
}
