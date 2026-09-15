/**
 * KEY_RESOURCES · classify_resources (T1.C Tier B).
 *
 * Classifies the resources a business needs by type (physical / IP /
 * human / financial) with moat-strength scoring. LLM-driven — replaces
 * the deleted stub.
 */

import {
  BaseTool,
  type ToolDefinition,
  type ToolContext,
  type ToolMessage
} from '@starlink/shared'
import { LLMClient } from '../../../services/llm-client.js'

export default class ClassifyResourcesTool extends BaseTool {
  readonly definition: ToolDefinition = {
    identity: { name: 'key-resources.classify_resources', provider: 'builtin', version: '1.0.0' },
    display: {
      label: '核心资源分类',
      description: '识别为兑现价值主张所需的核心资源（物理 / 知识产权 / 人力 / 资金），评估护城河强度',
      icon: '🏗️',
      category: 'analysis',
      color: '#f59e0b'
    },
    inputSchema: {
      type: 'object',
      properties: {
        product_summary: { type: 'string', description: '产品 / 服务概述' },
        value_proposition: { type: 'string', description: '价值主张' },
        stage: { type: 'string', description: 'idea / mvp / growth / mature', default: 'mvp' }
      },
      required: ['product_summary', 'value_proposition']
    },
    outputSchema: {
      type: 'object',
      properties: { resources: { type: 'array', description: 'Resource[] with type + moat_band' } }
    },
    inputPorts: [
      { name: 'product_summary', type: 'string', description: '产品概述', required: true },
      { name: 'value_proposition', type: 'string', description: '价值主张', required: true },
      { name: 'stage', type: 'string', description: '阶段', default: 'mvp' }
    ],
    outputPorts: [{ name: 'resources', type: 'array', description: '核心资源列表' }],
    runtime: { timeout: 30000, retries: 1, cacheable: true, streamable: false, parallel: true }
  }

  async *execute(input: Record<string, unknown>, _ctx: ToolContext): AsyncGenerator<ToolMessage> {
    const product = (input.product_summary as string) ?? ''
    const valueProp = (input.value_proposition as string) ?? ''
    const stage = (input.stage as string) ?? 'mvp'

    if (!product || !valueProp) {
      yield { type: 'error', error: 'product_summary and value_proposition are required', retryable: false }
      return
    }

    yield { type: 'progress', percent: 10, message: '分类核心资源...' }

    const prompt =
      `你是核心资源 / 护城河战略专家。给定产品 + 价值主张 + 阶段，列出 3-6 个核心资源。` +
      `每项标注 type（physical / intellectual / human / financial）+ moat_band（strong / mid / weak）。` +
      `**不要列出"团队"或"软件"等空洞标签，要具体到为何这条对该价值主张构成护城河**。\n\n` +
      `产品：${product}\n价值主张：${valueProp}\n阶段：${stage}\n\n` +
      `输出纯 JSON：{ "resources": [{ "name": "资源名", "type": "physical|intellectual|human|financial", ` +
      `"moat_band": "strong|mid|weak", "rationale": "≤30字" }] }`

    try {
      const client = new LLMClient()
      const response = await client.chat({
        messages: [
          { role: 'system', content: prompt },
          { role: 'user', content: '请分类核心资源。' }
        ]
      })
      const content = response.content ?? ''
      const match = content.match(/\{[\s\S]*\}/)
      const json = match ? match[0] : '{"resources":[]}'
      try {
        const parsed = JSON.parse(json) as { resources?: unknown[] }
        yield { type: 'json', data: { resources: parsed.resources ?? [] } }
      } catch {
        yield { type: 'error', error: 'JSON parse failed', retryable: true }
      }
    } catch (err) {
      yield {
        type: 'error',
        error: `classify_resources failed: ${(err as Error).message}`,
        retryable: true
      }
    }
  }
}
