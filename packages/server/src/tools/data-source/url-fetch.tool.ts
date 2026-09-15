import {
  BaseTool,
  type ToolDefinition,
  type ToolContext,
  type ToolMessage,
} from '@starlink/shared'

export default class UrlFetchTool extends BaseTool {
  readonly definition: ToolDefinition = {
    identity: {
      name: 'url-fetch',
      provider: 'builtin',
      version: '1.0.0',
    },
    display: {
      label: '网页抓取',
      description: '获取指定URL的网页内容，可选择性提取特定CSS选择器的文本',
      icon: '🌐',
      category: 'data_source',
      color: '#3b82f6',
    },
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: '目标网页URL',
          required: true,
        },
        selector: {
          type: 'string',
          description: 'CSS选择器，用于提取页面特定部分（可选）',
        },
      },
      required: ['url'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: '提取的文本内容' },
        url: { type: 'string', description: '请求的URL' },
      },
    },
    inputPorts: [
      { name: 'url', type: 'string', description: '目标网页URL', required: true },
      { name: 'selector', type: 'string', description: 'CSS选择器（可选）' },
    ],
    outputPorts: [
      { name: 'text', type: 'string', description: '提取的文本内容' },
      { name: 'url', type: 'string', description: '请求的URL' },
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
    const selector = input.selector as string | undefined

    yield { type: 'progress', percent: 0, message: '正在获取网页…' }

    try {
      const res = await fetch(url, {
        signal: context.abortSignal,
        headers: { 'User-Agent': 'Starlink/1.0' },
      })

      if (!res.ok) {
        yield { type: 'error', error: `HTTP ${res.status}: ${res.statusText}`, retryable: true }
        return
      }

      const html = await res.text()
      yield { type: 'progress', percent: 60, message: '正在解析内容…' }

      // Strip HTML tags to extract plain text
      let text = html
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()

      if (selector) {
        // Simple selector-based extraction hint (full DOM parsing would need a library)
        text = `[selector="${selector}" 提示: 服务端纯文本模式无法精确匹配CSS选择器，已返回完整页面文本]\n\n${text}`
      }

      yield { type: 'progress', percent: 100, message: '抓取完成' }
      yield { type: 'json', data: { text, url } }
    } catch (err) {
      yield { type: 'error', error: `网页获取失败: ${(err as Error).message}`, retryable: true }
    }
  }
}
