import { DomainAnalystTool } from './domain-analyst.tool-base.js'

export default class ProductAgentTool extends DomainAnalystTool {
  constructor() {
    super({
      toolName: 'product_agent',
      label: '产品策略 Agent',
      description: '分析 CC-BMC 商业模型画布中的价值主张、核心资源、关键业务、重要合作维度',
      color: '#f59e0b',
      roleName: 'Product_Agent',
      roleTitle: '产品策略专家',
      domains: ['价值主张', '核心资源', '关键业务', '重要合作'],
      questionDescription: '用户的产品策略问题'
    })
  }
}
