import type { BenchmarkCase } from '../../types.js'

export const bmcResidentialSolarUs2024: BenchmarkCase = {
  case_id: 'bmc-residential-solar-us-2024',
  domain: 'cleantech-residential',
  region: 'us-california-texas',
  source: {
    kind: 'academic-paper',
    citation: 'Chesbrough, H. (2010). Long Range Planning 43. + Pollin, R. (2015). Greening the Global Economy. MIT Press.'
  },
  input: {
    question: '为美国 CA + TX 运营的住宅 solar + 储能安装商设计 CC-BMC 画布。零首付 + 月付 FaaS 模式。',
    workspace_knowledge: [
      {
        doc_id: 'us-solar-policy-2024',
        title: '美国 2024 住宅 solar 政策',
        content: 'IRA 30% ITC 至 2032；CA NEM 3.0 推动储能 attach rate 至 ~60%；TX 储能由断电恐慌驱动；20 年 PPA 月付 $120-180。'
      },
      {
        doc_id: 'installer-competitive',
        title: '安装商格局',
        content: 'Sunrun/SunPower/Tesla 头部 30% 市占；本地 mid-market 5000 家。差异化: 安装速度、能耗 app、融资条款。CAC $1500-3500。'
      }
    ],
    constraints: ['零首付必须', '仅 CA + TX', '不自有融资资金池', '签约到通电 ≤ 45 天']
  },
  expected_output: {
    dimensions: {
      CUSTOMER_SEGMENTS: {
        must_cover: ['CA 中产家庭', 'TX 断电焦虑家庭', '屋顶朝向合适'],
        must_not_cover: ['租房客', '商业地产']
      },
      VALUE_PROPOSITIONS: {
        must_cover: ['零首付', '能耗 app', '快速安装'],
        must_not_cover: ['最低月付']
      },
      REVENUE_STREAMS: {
        must_cover: ['20 年 PPA 月付', 'ITC 凭证转让'],
        must_not_cover: ['一次性售卖']
      },
      KEY_PARTNERSHIPS: { must_cover: ['PPA 投资商', '屋顶检测工程师', '组件/逆变器供应商'] },
      KEY_ACTIVITIES: {
        must_cover: ['安装施工', '并网报备', '长期运维'],
        must_not_cover: ['融资资金自营']
      },
      COST_STRUCTURE: { must_cover: ['组件 BOM', '安装人工', 'CAC', '融资成本'] }
    },
    consistency_checks: [
      '零首付 → KEY_PARTNERSHIPS 必须含 PPA 投资商',
      '仅 CA+TX → CHANNELS 聚焦两州',
      '45 天安装 → KEY_ACTIVITIES 含工程调度 / 许可加速'
    ]
  }
}
