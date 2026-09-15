import type { BenchmarkCase } from '../../types.js'

export const bmcCreatorNewsletter2024: BenchmarkCase = {
  case_id: 'bmc-creator-newsletter-2024',
  domain: 'creator-economy-platform',
  region: 'global',
  source: {
    kind: 'academic-paper',
    citation: 'Parker, Van Alstyne, Choudary (2016). Platform Revolution. Norton. + Reichheld, F. (2003). HBR.'
  },
  input: {
    question: '为面向独立 creator 中腰部的 newsletter + podcast 一体化发布平台设计 CC-BMC，对标 Substack/beehiiv，提供 audience-discovery graph。',
    workspace_knowledge: [
      {
        doc_id: 'creator-platform-2024',
        title: '2024 Creator 平台生态',
        content: 'Substack 3M+ creator，头部 5% 拿 80% 订阅收入；中腰部 creator 第一痛点是"获客靠自己"。'
      },
      {
        doc_id: 'creator-platform-econ',
        title: 'Creator 平台单位经济',
        content: 'Substack take 10% + Stripe 手续费；CAC: 头部 0 成本，中腰部需 social ads $50-300/creator + 1:1 onboarding。'
      }
    ],
    constraints: ['Take rate ≤ 10%', '不主推头部 creator', 'audience-discovery graph 必须保护互导价值', '3 年 ARR $20M+']
  },
  expected_output: {
    dimensions: {
      CUSTOMER_SEGMENTS: {
        must_cover: ['中腰部 creator（$5k-30k ARR）', '跨 topic 协作需求', '非头部'],
        must_not_cover: ['头部 creator', '纯企业媒体']
      },
      VALUE_PROPOSITIONS: {
        must_cover: ['audience discovery graph', '低 take rate', 'newsletter + podcast 一体'],
        must_not_cover: ['推头部 creator', '完全匿名工具化']
      },
      REVENUE_STREAMS: {
        must_cover: ['订阅 take rate 10%', '付费推荐功能增值'],
        must_not_cover: ['广告变现', '头部独家签约']
      },
      CHANNELS: { must_cover: ['creator 社交圈推荐', 'niche 社区', 'creator-to-creator 邀请'] },
      KEY_RESOURCES: { must_cover: ['discovery graph 算法', '跨 topic 推荐数据', '低手续费支付栈'] },
      CUSTOMER_RELATIONSHIPS: { must_cover: ['1:1 onboarding（中腰部）', '社区', 'creator 成功案例库'] }
    },
    consistency_checks: [
      'Take rate ≤10% → 成本必须剥离高额 payments 中介',
      'audience graph 差异化 → KEY_RESOURCES 含推荐算法团队',
      '定位中腰部 → 客户关系必须含 onboarding 支持'
    ]
  }
}
