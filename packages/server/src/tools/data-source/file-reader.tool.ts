import { readFile } from 'node:fs/promises'
import {
  BaseTool,
  type ToolDefinition,
  type ToolContext,
  type ToolMessage,
} from '@starlink/shared'

export default class FileReaderTool extends BaseTool {
  readonly definition: ToolDefinition = {
    identity: {
      name: 'file-reader',
      provider: 'builtin',
      version: '1.0.0',
    },
    display: {
      label: '文件读取',
      description: '读取本地文件内容，支持文本和二进制文件',
      icon: '📄',
      category: 'data_source',
      color: '#3b82f6',
    },
    inputSchema: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: '文件路径',
          required: true,
        },
        mime: {
          type: 'string',
          description: '文件MIME类型（如 text/plain, application/json）',
          required: true,
        },
      },
      required: ['filePath', 'mime'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: '文件文本内容' },
        filePath: { type: 'string', description: '文件路径' },
        mime: { type: 'string', description: 'MIME类型' },
      },
    },
    inputPorts: [
      { name: 'filePath', type: 'string', description: '文件路径', required: true },
      { name: 'mime', type: 'string', description: '文件MIME类型', required: true },
    ],
    outputPorts: [
      { name: 'content', type: 'string', description: '文件文本内容' },
      { name: 'filePath', type: 'string', description: '文件路径' },
      { name: 'mime', type: 'string', description: 'MIME类型' },
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
    const filePath = input.filePath as string
    const mime = input.mime as string

    yield { type: 'progress', percent: 0, message: '正在读取文件…' }

    try {
      const isText = mime.startsWith('text/') || mime === 'application/json'
      const encoding = isText ? 'utf-8' : 'base64'
      const content = await readFile(filePath, { encoding })

      yield { type: 'progress', percent: 100, message: '读取完成' }
      yield { type: 'json', data: { content, filePath, mime } }
    } catch (err) {
      yield { type: 'error', error: `文件读取失败: ${(err as Error).message}`, retryable: false }
    }
  }
}
