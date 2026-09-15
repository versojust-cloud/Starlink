import {
  BaseTool,
  type ToolDefinition,
  type ToolContext,
  type ToolMessage,
} from '@starlink/shared'

export default class AggregatorTool extends BaseTool {
  readonly definition: ToolDefinition = {
    identity: {
      name: 'aggregator',
      provider: 'builtin',
      version: '1.0.0',
    },
    display: {
      label: '数据聚合',
      description: '将多个输入数据按指定策略合并为单一输出',
      icon: '📦',
      category: 'control_flow',
      color: '#8b5cf6',
    },
    inputSchema: {
      type: 'object',
      properties: {
        inputs: {
          type: 'array',
          description: '待聚合的输入数据列表',
          required: true,
        },
        strategy: {
          type: 'string',
          description: '聚合策略',
          required: true,
          enum: ['merge', 'concat', 'first'],
          default: 'merge',
        },
      },
      required: ['inputs', 'strategy'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        result: { type: 'object', description: '聚合后的结果' },
        strategy: { type: 'string', description: '使用的聚合策略' },
      },
    },
    inputPorts: [
      { name: 'inputs', type: 'array', description: '待聚合的输入数据列表', required: true },
      { name: 'strategy', type: 'string', description: '聚合策略', required: true },
    ],
    outputPorts: [
      { name: 'result', type: 'any', description: '聚合后的结果' },
      { name: 'strategy', type: 'string', description: '使用的聚合策略' },
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
    const inputs = input.inputs as unknown[]
    const strategy = (input.strategy as 'merge' | 'concat' | 'first') ?? 'merge'

    yield { type: 'progress', percent: 0, message: `正在聚合（策略: ${strategy}）…` }

    let result: unknown

    switch (strategy) {
      case 'merge': {
        // Deep-merge all object inputs into one
        const merged: Record<string, unknown> = {}
        for (const item of inputs) {
          if (item && typeof item === 'object' && !Array.isArray(item)) {
            Object.assign(merged, item)
          }
        }
        result = merged
        break
      }
      case 'concat': {
        // Concatenate all inputs into a flat array
        const concatenated: unknown[] = []
        for (const item of inputs) {
          if (Array.isArray(item)) {
            concatenated.push(...item)
          } else {
            concatenated.push(item)
          }
        }
        result = concatenated
        break
      }
      case 'first': {
        // Return the first non-null input
        result = inputs.find((item) => item !== null && item !== undefined) ?? null
        break
      }
      default:
        yield { type: 'error', error: `未知聚合策略: ${strategy as string}`, retryable: false }
        return
    }

    yield { type: 'progress', percent: 100, message: '聚合完成' }
    yield {
      type: 'json',
      data: {
        result: result as Record<string, unknown>,
        strategy,
      },
    }
  }
}
