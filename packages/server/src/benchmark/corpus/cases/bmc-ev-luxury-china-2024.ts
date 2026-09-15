import type { BenchmarkCase } from '../../types.js'

export const bmcEvLuxuryChina2024: BenchmarkCase = {
  case_id: 'bmc-ev-luxury-china-2024',
  domain: 'electric-vehicle',
  region: 'china',
  source: {
    kind: 'academic-paper',
    citation: 'Liu, F., Chen, J. (2023). Platform Transitions in the Chinese EV Market. Journal of Business Research 155.'
  },
  input: {
    question:
      '为一家定位 30-50 万元价位段的中国本土高端新能源车品牌设计 CC-BMC 画布，要求不依赖政府补贴，3 年内正现金流。',
    workspace_knowledge: [
      {
        doc_id: 'cn-ev-market-2024',
        title: '2024 年中国新能源汽车市场',
        content: '2024 年中国 NEV 渗透率 43%；20-40 万价位段增速 35%；用户智能化权重已超续航。'
      },
      {
        doc_id: 'cn-luxury-consumer',
        title: '中国高端消费行为研究',
        content: '30-50 万车主 62% 为 35-50 岁城市中产；OTA + 品牌社区 + 长途服务网络是三大差异化因子。'
      }
    ],
    constraints: ['不依赖政府补贴', '3 年内正现金流', '不做自建工厂（代工为主）', 'SKU 控制在 2-3 款']
  },
  expected_output: {
    dimensions: {
      CUSTOMER_SEGMENTS: {
        must_cover: ['城市中产家庭', '二次购车', '智能化偏好用户'],
        must_not_cover: ['补贴依赖客户', '一线限牌刚需（低价）'],
        min_confidence: 0.7
      },
      VALUE_PROPOSITIONS: {
        must_cover: ['OTA 升级', '长途补能网络', '品牌社区'],
        must_not_cover: ['最低价', '最长续航（单维度）']
      },
      KEY_RESOURCES: {
        must_cover: ['算法团队', '品牌资产', '补能网络'],
        must_not_cover: ['自建总装厂']
      },
      KEY_PARTNERSHIPS: {
        must_cover: ['代工厂', '电池供应商', '充电网络运营商']
      },
      REVENUE_STREAMS: {
        must_cover: ['整车销售', 'FSD/OTA 订阅', '增值服务'],
        must_not_cover: ['单纯补贴套利']
      },
      COST_STRUCTURE: {
        must_cover: ['BOM', '研发', '营销/品牌', '售后网络']
      }
    },
    consistency_checks: [
      '3 年正现金流约束 → 研发/营销投入必须阶段性克制',
      '不做自建厂 → KEY_ACTIVITIES 不得包含整车制造',
      '高端 + 城市中产 → 定价不能走价格战'
    ]
  }
}
