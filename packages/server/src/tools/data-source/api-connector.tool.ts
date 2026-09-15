import {
  BaseTool,
  type ToolDefinition,
  type ToolContext,
  type ToolMessage,
} from '@starlink/shared'

export default class ApiConnectorTool extends BaseTool {
  readonly definition: ToolDefinition = {
    identity: {
      name: 'api-connector',
      provider: 'builtin',
      version: '1.0.0',
    },
    display: {
      label: 'API连接器',
      description: '通用HTTP客户端，支持自定义请求方法、请求头和请求体',
      icon: '🔗',
      category: 'data_source',
      color: '#3b82f6',
    },
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: '请求URL',
          required: true,
        },
        method: {
          type: 'string',
          description: 'HTTP方法',
          required: true,
          enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
          default: 'GET',
        },
        headers: {
          type: 'object',
          description: '自定义请求头（可选）',
        },
        body: {
          type: 'object',
          description: '请求体（可选，用于POST/PUT/PATCH）',
        },
      },
      required: ['url', 'method'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        status: { type: 'number', description: 'HTTP状态码' },
        headers: { type: 'object', description: '响应头' },
        data: { type: 'object', description: '响应数据' },
      },
    },
    inputPorts: [
      { name: 'url', type: 'string', description: '请求URL', required: true },
      { name: 'method', type: 'string', description: 'HTTP方法', required: true },
      { name: 'headers', type: 'object', description: '自定义请求头' },
      { name: 'body', type: 'object', description: '请求体' },
    ],
    outputPorts: [
      { name: 'status', type: 'number', description: 'HTTP状态码' },
      { name: 'headers', type: 'object', description: '响应头' },
      { name: 'data', type: 'any', description: '响应数据' },
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
    context: ToolContext,
  ): AsyncGenerator<ToolMessage> {
    const url = input.url as string
    const method = (input.method as string) ?? 'GET'
    const headers = (input.headers as Record<string, string>) ?? {}
    const body = input.body as Record<string, unknown> | undefined

    yield { type: 'progress', percent: 0, message: `正在发送 ${method} 请求…` }

    try {
      const init: RequestInit = {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        signal: context.abortSignal,
      }

      if (body && ['POST', 'PUT', 'PATCH'].includes(method)) {
        init.body = JSON.stringify(body)
      }

      const res = await fetch(url, init)
      const contentType = res.headers.get('content-type') ?? ''

      let data: unknown
      if (contentType.includes('application/json')) {
        data = await res.json()
      } else {
        data = await res.text()
      }

      const responseHeaders: Record<string, string> = {}
      res.headers.forEach((v, k) => {
        responseHeaders[k] = v
      })

      yield { type: 'progress', percent: 100, message: '请求完成' }
      yield {
        type: 'json',
        data: {
          status: res.status,
          headers: responseHeaders,
          data: data as Record<string, unknown>,
        },
      }
    } catch (err) {
      yield { type: 'error', error: `API请求失败: ${(err as Error).message}`, retryable: true }
    }
  }
}
