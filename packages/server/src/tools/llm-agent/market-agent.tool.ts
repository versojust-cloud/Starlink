import { DomainAnalystTool } from './domain-analyst.tool-base.js'

export default class MarketAgentTool extends DomainAnalystTool {
  constructor() {
    super({
      toolName: 'market_agent',
      label: '市场分析 Agent',
      description: '分析 CC-BMC 商业模型画布中的客户细分、渠道通路、客户关系维度',
      color: '#f59e0b',
      roleName: 'Market_Agent',
      roleTitle: '市场分析专家',
      domains: ['客户细分', '渠道通路', '客户关系'],
      questionDescription: '用户的市场分析问题',
      evidenceEnabled: true
    })
  }
}
