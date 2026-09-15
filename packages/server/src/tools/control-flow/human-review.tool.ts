import {
  BaseTool,
  type ToolDefinition,
  type ToolContext,
  type ToolMessage,
} from '@starlink/shared'

export default class HumanReviewTool extends BaseTool {
  readonly definition: ToolDefinition = {
    identity: {
      name: 'human-review',
      provider: 'builtin',
      version: '1.0.0',
    },
    display: {
      label: '人工审核',
      description: '暂停流程等待人工审核确认，审核通过后继续执行',
      icon: '👤',
      category: 'control_flow',
      color: '#8b5cf6',
    },
    inputSchema: {
      type: 'object',
      properties: {
        data: {
          type: 'object',
          description: '需要审核的数据',
          required: true,
        },
        prompt: {
          type: 'string',
          description: '审核提示信息',
          required: true,
        },
      },
      required: ['data', 'prompt'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        approved: { type: 'boolean', description: '审核是否通过' },
        reviewerComment: { type: 'string', description: '审核者备注' },
        data: { type: 'object', description: '原始审核数据' },
      },
    },
    inputPorts: [
      { name: 'data', type: 'any', description: '需要审核的数据', required: true },
      { name: 'prompt', type: 'string', description: '审核提示信息', required: true },
    ],
    outputPorts: [
      { name: 'approved', type: 'boolean', description: '审核是否通过' },
      { name: 'reviewerComment', type: 'string', description: '审核者备注' },
      { name: 'data', type: 'object', description: '原始审核数据' },
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
    const data = input.data
    const prompt = input.prompt as string

    yield { type: 'progress', percent: 0, message: '等待人工审核…' }

    // Placeholder: in production this would pause the workflow and
    // create a review task via WebSocket / notification system.
    // The execution engine would suspend this node until a human
    // submits an approval or rejection via the UI.

    yield {
      type: 'progress',
      percent: 50,
      message: `审核请求已发送: ${prompt}`,
    }

    // For now, emit a pending state so the orchestrator knows
    // this node is waiting for external input.
    yield {
      type: 'json',
      data: {
        approved: false,
        reviewerComment: '',
        data: data as Record<string, unknown>,
        _status: 'waiting_for_review',
        _prompt: prompt,
      },
    }
  }
}
