import {
  BaseTool,
  type ToolDefinition,
  type ToolContext,
  type ToolMessage,
} from '@starlink/shared'

export default class LoopTool extends BaseTool {
  readonly definition: ToolDefinition = {
    identity: {
      name: 'loop',
      provider: 'builtin',
      version: '1.0.0',
    },
    display: {
      label: '循环迭代',
      description: '遍历列表中的每个元素，依次交给指定工具处理',
      icon: '🔄',
      category: 'control_flow',
      color: '#8b5cf6',
    },
    inputSchema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          description: '待迭代的元素列表',
          required: true,
        },
        toolRef: {
          type: 'string',
          description: '每次迭代调用的工具引用名称',
          required: true,
        },
      },
      required: ['items', 'toolRef'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        results: { type: 'array', description: '每次迭代的结果列表' },
        totalItems: { type: 'number', description: '总迭代次数' },
      },
    },
    inputPorts: [
      { name: 'items', type: 'array', description: '待迭代的元素列表', required: true },
      { name: 'toolRef', type: 'string', description: '工具引用名称', required: true },
    ],
    outputPorts: [
      { name: 'results', type: 'array', description: '每次迭代的结果列表' },
      { name: 'totalItems', type: 'number', description: '总迭代次数' },
    ],
    runtime: {
      timeout: 30000,
      retries: 1,
      cacheable: true,
      streamable: false,
      parallel: true,
    },
  }

  async *execute(
    input: Record<string, unknown>,
    _context: ToolContext,
  ): AsyncGenerator<ToolMessage> {
    const items = input.items as unknown[]
    const toolRef = input.toolRef as string
    const total = items.length

    yield { type: 'progress', percent: 0, message: `开始循环，共 ${total} 个元素` }

    // The actual tool invocation is delegated to the execution engine.
    // This node emits iteration metadata so the orchestrator can schedule
    // the referenced tool for each item.
    const results: Array<Record<string, unknown>> = []

    for (let i = 0; i < total; i++) {
      const percent = Math.round(((i + 1) / total) * 100)
      yield { type: 'progress', percent, message: `迭代 ${i + 1}/${total}` }

      results.push({
        index: i,
        item: items[i] as Record<string, unknown>,
        toolRef,
        status: 'pending',
      })
    }

    yield { type: 'progress', percent: 100, message: '循环完成' }
    yield {
      type: 'json',
      data: {
        results,
        totalItems: total,
      },
    }
  }
}
