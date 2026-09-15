/**
 * Preset flow templates — seed data for the template marketplace.
 */

import type { FlowDefinition } from '@starlink/shared'
import type { FlowStore } from '../application/flow-store.js'

export const BMC_TEMPLATE: FlowDefinition = {
  id: 'tpl-bmc',
  name: 'CC-BMC 商业分析',
  description: '使用市场/产品/财务 Agent 进行 9 维度商业模型画布分析',
  nodes: [
    { id: 'input-1', toolName: '__input', type: 'input', label: '用户输入', position: { x: 50, y: 200 }, config: {}, inputPorts: [], outputPorts: [{ name: 'question', type: 'string', description: '用户的商业问题' }] },
    { id: 'market-1', toolName: 'market_agent', type: 'agent', label: '市场分析', position: { x: 350, y: 50 }, config: {}, inputPorts: [{ name: 'question', type: 'string', description: '分析问题' }], outputPorts: [{ name: 'bmcCards', type: 'array', description: 'BMC 卡片' }] },
    { id: 'product-1', toolName: 'product_agent', type: 'agent', label: '产品策略', position: { x: 350, y: 200 }, config: {}, inputPorts: [{ name: 'question', type: 'string', description: '分析问题' }], outputPorts: [{ name: 'bmcCards', type: 'array', description: 'BMC 卡片' }] },
    { id: 'finance-1', toolName: 'finance_agent', type: 'agent', label: '财务分析', position: { x: 350, y: 350 }, config: {}, inputPorts: [{ name: 'question', type: 'string', description: '分析问题' }], outputPorts: [{ name: 'bmcCards', type: 'array', description: 'BMC 卡片' }] },
    { id: 'agg-1', toolName: 'aggregator', type: 'control', label: '聚合', position: { x: 650, y: 200 }, config: { strategy: 'concat' }, inputPorts: [{ name: 'inputs', type: 'array', description: '多个输入' }], outputPorts: [{ name: 'result', type: 'array', description: '聚合结果' }] },
    { id: 'critic-1', toolName: 'critic_agent', type: 'agent', label: '审查', position: { x: 900, y: 200 }, config: {}, inputPorts: [{ name: 'allNodes', type: 'array', description: '所有节点' }], outputPorts: [{ name: 'conflicts', type: 'array', description: '冲突列表' }] },
    { id: 'bmc-1', toolName: 'bmc_renderer', type: 'tool', label: 'BMC 渲染', position: { x: 1150, y: 200 }, config: {}, inputPorts: [{ name: 'nodes', type: 'array', description: 'BMC 节点' }], outputPorts: [{ name: 'canvas', type: 'object', description: 'BMC 画布' }] },
  ],
  edges: [
    { id: 'e1', source: 'input-1', sourcePort: 'question', target: 'market-1', targetPort: 'question' },
    { id: 'e2', source: 'input-1', sourcePort: 'question', target: 'product-1', targetPort: 'question' },
    { id: 'e3', source: 'input-1', sourcePort: 'question', target: 'finance-1', targetPort: 'question' },
    { id: 'e4', source: 'market-1', sourcePort: 'bmcCards', target: 'agg-1', targetPort: 'inputs' },
    { id: 'e5', source: 'product-1', sourcePort: 'bmcCards', target: 'agg-1', targetPort: 'inputs' },
    { id: 'e6', source: 'finance-1', sourcePort: 'bmcCards', target: 'agg-1', targetPort: 'inputs' },
    { id: 'e7', source: 'agg-1', sourcePort: 'result', target: 'critic-1', targetPort: 'allNodes' },
    { id: 'e8', source: 'agg-1', sourcePort: 'result', target: 'bmc-1', targetPort: 'nodes' },
  ],
  config: {},
}

const COMPETITIVE_TEMPLATE: FlowDefinition = {
  id: 'tpl-competitive',
  name: '竞品分析',
  description: '对多家公司进行搜索、摘要、对比分析，生成图表和 PPT',
  nodes: [
    { id: 'input-1', toolName: '__input', type: 'input', label: '公司列表', position: { x: 50, y: 150 }, config: {}, inputPorts: [], outputPorts: [{ name: 'companies', type: 'array', description: '公司名称列表' }] },
    { id: 'search-1', toolName: 'web_search', type: 'tool', label: '网页搜索', position: { x: 300, y: 150 }, config: { maxResults: 5 }, inputPorts: [{ name: 'query', type: 'string', description: '搜索关键词' }], outputPorts: [{ name: 'results', type: 'array', description: '搜索结果' }] },
    { id: 'summary-1', toolName: 'summarizer', type: 'agent', label: '摘要', position: { x: 550, y: 150 }, config: {}, inputPorts: [{ name: 'text', type: 'string', description: '文本' }], outputPorts: [{ name: 'summary', type: 'string', description: '摘要' }] },
    { id: 'compare-1', toolName: 'competitive_compare', type: 'tool', label: '竞品对比', position: { x: 800, y: 150 }, config: {}, inputPorts: [{ name: 'companies', type: 'array', description: '公司' }, { name: 'dimensions', type: 'array', description: '维度' }], outputPorts: [{ name: 'matrix', type: 'object', description: '对比矩阵' }] },
    { id: 'chart-1', toolName: 'chart_generator', type: 'tool', label: '图表', position: { x: 1050, y: 150 }, config: { chartType: 'radar' }, inputPorts: [{ name: 'data', type: 'object', description: '数据' }], outputPorts: [{ name: 'chart', type: 'object', description: '图表配置' }] },
  ],
  edges: [
    { id: 'e1', source: 'input-1', sourcePort: 'companies', target: 'search-1', targetPort: 'query' },
    { id: 'e2', source: 'search-1', sourcePort: 'results', target: 'summary-1', targetPort: 'text' },
    { id: 'e3', source: 'input-1', sourcePort: 'companies', target: 'compare-1', targetPort: 'companies' },
    { id: 'e4', source: 'compare-1', sourcePort: 'matrix', target: 'chart-1', targetPort: 'data' },
  ],
  config: {},
}

const RESEARCH_TEMPLATE: FlowDefinition = {
  id: 'tpl-research',
  name: '知识库深度研究',
  description: '结合知识库检索和网页搜索，综合分析生成研究报告',
  nodes: [
    { id: 'input-1', toolName: '__input', type: 'input', label: '研究问题', position: { x: 50, y: 150 }, config: {}, inputPorts: [], outputPorts: [{ name: 'question', type: 'string', description: '研究问题' }] },
    { id: 'kb-1', toolName: 'knowledge_base', type: 'tool', label: '知识库', position: { x: 300, y: 80 }, config: { topK: 5 }, inputPorts: [{ name: 'query', type: 'string', description: '查询' }], outputPorts: [{ name: 'results', type: 'array', description: '文档片段' }] },
    { id: 'search-1', toolName: 'web_search', type: 'tool', label: '网页搜索', position: { x: 300, y: 250 }, config: { maxResults: 5 }, inputPorts: [{ name: 'query', type: 'string', description: '关键词' }], outputPorts: [{ name: 'results', type: 'array', description: '结果' }] },
    { id: 'agg-1', toolName: 'aggregator', type: 'control', label: '聚合', position: { x: 550, y: 150 }, config: { strategy: 'concat' }, inputPorts: [{ name: 'inputs', type: 'array', description: '多个输入' }], outputPorts: [{ name: 'result', type: 'object', description: '合并结果' }] },
    { id: 'chat-1', toolName: 'general_chat', type: 'agent', label: '综合分析', position: { x: 800, y: 150 }, config: { systemPrompt: '你是一位研究分析师，请根据提供的资料综合分析并回答问题，引用来源。' }, inputPorts: [{ name: 'messages', type: 'array', description: '消息' }], outputPorts: [{ name: 'response', type: 'string', description: '分析结果' }] },
  ],
  edges: [
    { id: 'e1', source: 'input-1', sourcePort: 'question', target: 'kb-1', targetPort: 'query' },
    { id: 'e2', source: 'input-1', sourcePort: 'question', target: 'search-1', targetPort: 'query' },
    { id: 'e3', source: 'kb-1', sourcePort: 'results', target: 'agg-1', targetPort: 'inputs' },
    { id: 'e4', source: 'search-1', sourcePort: 'results', target: 'agg-1', targetPort: 'inputs' },
    { id: 'e5', source: 'agg-1', sourcePort: 'result', target: 'chat-1', targetPort: 'messages' },
  ],
  config: {},
}

export async function seedFlowTemplates(flowStore: FlowStore): Promise<void> {
  const existing = await flowStore.listTemplates()
  if (existing.length > 0) return

  for (const template of [BMC_TEMPLATE, COMPETITIVE_TEMPLATE, RESEARCH_TEMPLATE]) {
    const record = await flowStore.createFlow('__system', template.name, template, '__system')
    await flowStore.saveAsTemplate(record.id, template.name)
  }
  console.log('[seed] Created 3 flow templates')
}
