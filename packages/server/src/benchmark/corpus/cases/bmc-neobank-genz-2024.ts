import type { BenchmarkCase } from '../../types.js'

export const bmcNeobankGenz2024: BenchmarkCase = {
  case_id: 'bmc-neobank-genz-2024',
  domain: 'fintech-consumer',
  region: 'southeast-asia',
  source: {
    kind: 'academic-paper',
    citation: 'King, B. (2018). Bank 4.0. Wiley. + Puschmann, T. (2017). Fintech. BISE 59.'
  },
  input: {
    question: '为一家面向东南亚 Gen Z（18-28 岁）的手机优先 neobank 设计 CC-BMC，重点覆盖低 ARPU 单位经济与信任构建。',
    workspace_knowledge: [
      {
        doc_id: 'sea-genz-fintech-2024',
        title: '东南亚 Gen Z fintech 行为',
        content: '印尼/菲律宾/越南 Gen Z 中 72% 拥手机但仅 41% 拥银行账户；月均余额 $80。'
      },
      {
        doc_id: 'neobank-unit-econ',
        title: 'Neobank 单位经济模型',
        content: '欧美 CAC $30-80，LTV/CAC 破 3 需 18-24 月；主要收入来自 interchange fee + 跨境汇款。'
      }
    ],
    constraints: ['持有 e-money license', '月 ARPU $1-3', '不碰高息贷', '2 年达 interchange + 汇款 fee 正现金流']
  },
  expected_output: {
    dimensions: {
      CUSTOMER_SEGMENTS: {
        must_cover: ['Gen Z 无银行户人群', '学生 + 初入职场', '跨境汇款高频用户'],
        must_not_cover: ['高净值客户', '小微企业主']
      },
      VALUE_PROPOSITIONS: {
        must_cover: ['零门槛开户', '低摩擦跨境汇款', '金融素养养成'],
        must_not_cover: ['高收益理财', '信用卡']
      },
      REVENUE_STREAMS: {
        must_cover: ['interchange fee', '跨境汇款 fee'],
        must_not_cover: ['高息短期贷款']
      },
      CHANNELS: { must_cover: ['应用商店 ASO', '社交媒体网红', '线下推广员'] },
      CUSTOMER_RELATIONSHIPS: { must_cover: ['社群', '游戏化激励', '同伴推荐'] }
    },
    consistency_checks: [
      '不做高息贷 → 收入以 interchange + 汇款 + 订阅为主',
      '月 ARPU $1-3 → CAC 必须 $8-25',
      'Gen Z 低金融素养 → 客户关系含教育/游戏化引擎'
    ]
  }
}
