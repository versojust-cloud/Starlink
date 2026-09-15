import { DomainAnalystTool } from './domain-analyst.tool-base.js'

export default class FinanceAgentTool extends DomainAnalystTool {
  constructor() {
    super({
      toolName: 'finance_agent',
      label: '财务分析 Agent',
      description: '分析 CC-BMC 商业模型画布中的收入来源和成本结构维度',
      color: '#f59e0b',
      roleName: 'Finance_Agent',
      roleTitle: '财务分析专家',
      domains: ['收入来源', '成本结构'],
      questionDescription: '用户的财务分析问题'
    })
  }
}
