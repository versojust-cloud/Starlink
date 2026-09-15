import {
  BaseTool,
  type ToolDefinition,
  type ToolContext,
  type ToolMessage,
} from '@starlink/shared'
import type { Pool as PgPool } from 'pg'

export default class DatabaseQueryTool extends BaseTool {
  readonly definition: ToolDefinition = {
    identity: {
      name: 'database-query',
      provider: 'builtin',
      version: '1.0.0',
    },
    display: {
      label: '数据库查询',
      description: '通过SQL语句查询PostgreSQL数据库并返回结果',
      icon: '🗄️',
      category: 'data_source',
      color: '#3b82f6',
    },
    inputSchema: {
      type: 'object',
      properties: {
        connectionString: {
          type: 'string',
          description: 'PostgreSQL连接字符串',
          required: true,
        },
        query: {
          type: 'string',
          description: 'SQL查询语句',
          required: true,
        },
      },
      required: ['connectionString', 'query'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        rows: { type: 'array', description: '查询结果行' },
        rowCount: { type: 'number', description: '结果行数' },
      },
    },
    inputPorts: [
      { name: 'connectionString', type: 'string', description: 'PostgreSQL连接字符串', required: true },
      { name: 'query', type: 'string', description: 'SQL查询语句', required: true },
    ],
    outputPorts: [
      { name: 'rows', type: 'array', description: '查询结果行' },
      { name: 'rowCount', type: 'number', description: '结果行数' },
    ],
    credentials: {
      type: 'custom',
      fields: [
        {
          name: 'connectionString',
          label: '数据库连接字符串',
          type: 'password',
          required: true,
          placeholder: 'postgresql://user:pass@host:5432/db',
        },
      ],
    },
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
    const connectionString = input.connectionString as string
    const query = input.query as string

    yield { type: 'progress', percent: 0, message: '正在连接数据库…' }

    let PoolCtor: typeof PgPool

    try {
      const pg = await import('pg')
      PoolCtor = (pg.default?.Pool ?? pg.Pool) as typeof PgPool
    } catch {
      yield { type: 'error', error: '缺少 pg 依赖，请先安装: npm install pg', retryable: false }
      return
    }

    const pool = new PoolCtor({ connectionString })

    try {
      yield { type: 'progress', percent: 30, message: '正在执行查询…' }
      const result = await pool.query(query)

      yield { type: 'progress', percent: 100, message: '查询完成' }
      yield {
        type: 'json',
        data: {
          rows: result.rows as unknown as Record<string, unknown>[],
          rowCount: result.rowCount ?? 0,
        },
      }
    } catch (err) {
      yield { type: 'error', error: `数据库查询失败: ${(err as Error).message}`, retryable: true }
    } finally {
      await pool.end()
    }
  }
}
