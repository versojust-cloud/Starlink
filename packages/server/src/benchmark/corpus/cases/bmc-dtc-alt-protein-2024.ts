import type { BenchmarkCase } from '../../types.js'

export const bmcDtcAltProtein2024: BenchmarkCase = {
  case_id: 'bmc-dtc-alt-protein-2024',
  domain: 'dtc-consumer-goods',
  region: 'eu',
  source: {
    kind: 'academic-paper',
    citation: 'Govindarajan, V., Srinivas, S. (2013). HBR. + Post, M. J. (2014). Cultured meat from stem cells. Meat Science 98.'
  },
  input: {
    question: '为直面欧盟消费者（D2C）的替代蛋白食品品牌（精准发酵）设计 CC-BMC 画布。冷链即食盒装 €9-14 SKU。',
    workspace_knowledge: [
      {
        doc_id: 'eu-altprotein-2024',
        title: 'EU 替代蛋白市场',
        content: '2024 年 EU 替代蛋白零售 ~€2.1B，增速 9%；核心 25-44 岁城市白领 / 高学历女性。'
      },
      {
        doc_id: 'cold-chain-dtc-econ',
        title: 'DTC 冷链单位经济',
        content: '冷链 DTC 单笔配送 €3-6；AOV 需 ≥€40 才能打正运费；复购率 <25% 时 CAC LTV 倒挂。'
      }
    ],
    constraints: ['不靠零售批发渠道', '碳标签需第三方认证', '前 18 月 AOV ≥ €45', '包装 100% 可回收/堆肥']
  },
  expected_output: {
    dimensions: {
      CUSTOMER_SEGMENTS: {
        must_cover: ['25-44 岁城市白领', '重视动物福利', '环保意识强'],
        must_not_cover: ['价格敏感型家庭', 'B2B 餐饮批发客户']
      },
      VALUE_PROPOSITIONS: {
        must_cover: ['可验证低碳足迹', '即食便捷', '精准发酵创新'],
        must_not_cover: ['最便宜', '批发给连锁餐厅']
      },
      CHANNELS: {
        must_cover: ['品牌官网 D2C', 'Instagram/TikTok 内容', '订阅盒'],
        must_not_cover: ['大型商超批发', '便利店铺货']
      },
      KEY_PARTNERSHIPS: { must_cover: ['冷链物流伙伴', '认证机构', '精准发酵代工厂'] },
      COST_STRUCTURE: { must_cover: ['原料 + 发酵', '冷链配送', '品牌营销'] }
    },
    consistency_checks: [
      '不靠批发 → 渠道 100% 自有 + 电商',
      'AOV ≥ €45 → 价格带 / 订阅包策略必须支持',
      '碳标签要求 → KEY_RESOURCES 必须含 LCA 数据能力'
    ]
  }
}
