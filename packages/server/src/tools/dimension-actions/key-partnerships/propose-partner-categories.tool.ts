/**
 * KEY_PARTNERSHIPS · propose_partner_categories (T1.C Tier B).
 *
 * Proposes partner categories the business needs (suppliers, channel
 * partners, technology, regulatory etc) with dependency-risk scoring.
 * LLM-driven — replaces the deleted stub.
 */

import {
  BaseTool,
  type ToolDefinition,
  type ToolContext,
  type ToolMessage
} from '@starlink/shared'
import { LLMClient } from '../../../services/llm-client.js'

export default class ProposePartnerCategoriesTool extends BaseTool {
  readonly definition: ToolDefinition = {
    identity: { name: 'key-partnerships.propose_partner_categories', provider: 'builtin', version: '1.0.0' },
    display: {
      label: '关键合作类别',
      description: '识别业务所需的合作伙伴类别（供应商 / 渠道 / 技术 / 监管等），并评估依赖风险',
      icon: '🔗',
      category: 'analysis',
      color: '#f59e0b'
    },
    inputSchema: {
      type: 'object',
      properties: {
        product_summary: { type: 'string', description: '产品 / 服务概述' },
        operating_model: { type: 'string', description: 'in-house / outsourced / hybrid' },
        regulated: { type: 'boolean', description: '是否处于监管行业（金融/医疗/教育等）', default: false }
      },
      required: ['product_summary', 'operating_model']
    },
    outputSchema: {
      type: 'object',
      properties: { partners: { type: 'array', description: 'Partner[] with category + risk band' } }
    },
    inputPorts: [
      { name: 'product_summary', type: 'string', description: '产品概述', required: true },
      { name: 'operating_model', type: 'string', description: '运营模式', required: true },
      { name: 'regulated', type: 'boolean', description: '受监管', default: false }
    ],
    outputPorts: [{ name: 'partners', type: 'array', description: '合作类别列表' }],
    runtime: { timeout: 30000, retries: 1, cacheable: true, streamable: false, parallel: true }
  }

  async *execute(input: Record<string, unknown>, _ctx: ToolContext): AsyncGenerator<ToolMessage> {
    const product = (input.product_summary as string) ?? ''
    const ops = (input.operating_model as string) ?? ''
    const regulated = Boolean(input.regulated ?? false)

    if (!product || !ops) {
      yield { type: 'error', error: 'product_summary and operating_model are required', retryable: false }
      return
    }

    yield { type: 'progress', percent: 10, message: '识别合作类别...' }

    const prompt =
      `你是商业模型战略专家。给定产品 + 运营模式 + 是否受监管，列出 3-5 个**类别级别** ` +
      `的关键合作（不要写具体公司名，写类别如"国内 acquiring bank"、"3PL 物流商"）。` +
      `每项标注 dependency_risk（去掉这条合作业务受多大影响：critical/major/minor）。\n\n` +
      `产品：${product}\n运营模式：${ops}\n监管行业：${regulated}\n\n` +
      `输出纯 JSON：{ "partners": [{ "category": "类别", "examples": ["示例1","示例2"], ` +
      `"dependency_risk": "critical|major|minor", "rationale": "≤30字" }] }`

    try {
      const client = new LLMClient()
      const response = await client.chat({
        messages: [
          { role: 'system', content: prompt },
          { role: 'user', content: '请识别合作类别。' }
        ]
      })
      const content = response.content ?? ''
      const match = content.match(/\{[\s\S]*\}/)
      const json = match ? match[0] : '{"partners":[]}'
      try {
        const parsed = JSON.parse(json) as { partners?: unknown[] }
        yield { type: 'json', data: { partners: parsed.partners ?? [] } }
      } catch {
        yield { type: 'error', error: 'JSON parse failed', retryable: true }
      }
    } catch (err) {
      yield {
        type: 'error',
        error: `propose_partner_categories failed: ${(err as Error).message}`,
        retryable: true
      }
    }
  }
}
