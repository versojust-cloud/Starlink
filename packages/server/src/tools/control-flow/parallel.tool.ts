import {
  BaseTool,
  type ToolDefinition,
  type ToolContext,
  type ToolMessage,
} from '@starlink/shared'

export default class ParallelTool extends BaseTool {
  readonly definition: ToolDefinition = {
    identity: {
      name: 'parallel',
      provider: 'builtin',
      version: '1.0.0',
    },
    display: {
      label: '并行执行',
      description: '结构化标记节点，指示下游分支可并行执行',
      icon: '⚡',
      category: 'control_flow',
      color: '#8b5cf6',
    },
    inputSchema: {
      type: 'object',
      properties: {
        inputs: {
          type: 'array',
          description: '传入的数据列表，将分发到并行分支',
          required: true,
        },
      },
      required: ['inputs'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        outputs: { type: 'array', description: '透传的数据列表' },
        count: { type: 'number', description: '并行分支数' },
      },
    },
    inputPorts: [
      { name: 'inputs', type: 'array', description: '传入的数据列表', required: true },
    ],
    outputPorts: [
      { name: 'outputs', type: 'array', description: '透传的数据列表' },
      { name: 'count', type: 'number', description: '并行分支数' },
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

    yield { type: 'progress', percent: 0, message: '准备并行分发…' }

    // Structural marker: pass through inputs unchanged for the orchestrator
    // The execution engine reads the outputPorts and fans out downstream nodes

    yield { type: 'progress', percent: 100, message: `并行分发 ${inputs.length} 个分支` }
    yield {
      type: 'json',
      data: {
        outputs: inputs as unknown as Record<string, unknown>[],
        count: inputs.length,
      },
    }
  }
}
