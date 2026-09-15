import {
  BaseTool,
  type ToolDefinition,
  type ToolContext,
  type ToolMessage,
} from '@starlink/shared'

export default class RouterTool extends BaseTool {
  readonly definition: ToolDefinition = {
    identity: {
      name: 'router',
      provider: 'builtin',
      version: '1.0.0',
    },
    display: {
      label: '条件路由',
      description: '根据条件表达式将数据路由到匹配的分支',
      icon: '🔀',
      category: 'control_flow',
      color: '#8b5cf6',
    },
    inputSchema: {
      type: 'object',
      properties: {
        condition: {
          type: 'string',
          description: '条件字段名或表达式',
          required: true,
        },
        value: {
          type: 'string',
          description: '待匹配的值',
          required: true,
        },
        branches: {
          type: 'array',
          description: '分支列表，每项包含 match 和 output',
          required: true,
        },
      },
      required: ['condition', 'value', 'branches'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        matched: { type: 'boolean', description: '是否匹配到分支' },
        branch: { type: 'object', description: '匹配的分支' },
        index: { type: 'number', description: '匹配的分支索引' },
      },
    },
    inputPorts: [
      { name: 'condition', type: 'string', description: '条件字段名或表达式', required: true },
      { name: 'value', type: 'any', description: '待匹配的值', required: true },
      { name: 'branches', type: 'array', description: '分支列表', required: true },
    ],
    outputPorts: [
      { name: 'matched', type: 'boolean', description: '是否匹配到分支' },
      { name: 'branch', type: 'object', description: '匹配的分支' },
      { name: 'index', type: 'number', description: '匹配的分支索引' },
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
    const condition = input.condition as string
    const value = input.value
    const branches = input.branches as Array<Record<string, unknown>>

    yield { type: 'progress', percent: 0, message: '正在评估条件…' }

    let matchedIndex = -1
    let matchedBranch: Record<string, unknown> | null = null

    for (let i = 0; i < branches.length; i++) {
      const branch = branches[i]
      const matchValue = branch.match

      // Support equality comparison, "default" catch-all, and simple operators
      if (matchValue === 'default') {
        if (matchedIndex === -1) {
          matchedIndex = i
          matchedBranch = branch
        }
        continue
      }

      if (matchValue === value || String(matchValue) === String(value)) {
        matchedIndex = i
        matchedBranch = branch
        break
      }

      // Simple operator support: ">", "<", ">=", "<="
      if (typeof matchValue === 'string' && typeof value === 'number') {
        const opMatch = /^([><=!]+)\s*(.+)$/.exec(matchValue)
        if (opMatch) {
          const [, op, num] = opMatch
          const n = Number(num)
          if (
            (op === '>' && value > n) ||
            (op === '<' && value < n) ||
            (op === '>=' && value >= n) ||
            (op === '<=' && value <= n) ||
            (op === '==' && value === n) ||
            (op === '!=' && value !== n)
          ) {
            matchedIndex = i
            matchedBranch = branch
            break
          }
        }
      }
    }

    yield { type: 'progress', percent: 100, message: '路由完成' }
    yield {
      type: 'json',
      data: {
        matched: matchedBranch !== null,
        branch: matchedBranch ?? {},
        index: matchedIndex,
      },
    }
  }
}
