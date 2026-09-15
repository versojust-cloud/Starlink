import type { BenchmarkCase } from '../../types.js'

export const bmcNicheSportsStreaming2024: BenchmarkCase = {
  case_id: 'bmc-niche-sports-streaming-2024',
  domain: 'media-streaming-niche',
  region: 'global',
  source: {
    kind: 'academic-paper',
    citation: 'Lotz, A. D. (2018). We Now Disrupt This Broadcast. MIT Press. + Evens & Donders (2018). Palgrave.'
  },
  input: {
    question: '为专注 mountain biking + gravel cycling 的全球小众体育流媒体平台设计 CC-BMC，无顶级赛事独家权情况下构建可持续订阅。',
    workspace_knowledge: [
      {
        doc_id: 'niche-sports-audience',
        title: '小众体育受众与付费意愿',
        content: '全球 MTB/gravel 活跃 6000 万；核心粘性 200 万愿月付 $8-15；80% 男性 25-55 岁。'
      },
      {
        doc_id: 'niche-rights-cost',
        title: '小众赛事版权成本',
        content: '顶级（UCI/Crankworx）独家 $2-5M/yr；中腰部打包 $50k-300k/yr；原创内容 $5k-30k/部。'
      }
    ],
    constraints: ['不争顶级赛事独家权', '月订阅 ≤ $10 全球一致', '原创内容占比 ≥ 60%', '3 年内付费用户 ≥ 50 万']
  },
  expected_output: {
    dimensions: {
      CUSTOMER_SEGMENTS: {
        must_cover: ['MTB/gravel 高粘性爱好者', '25-55 岁', '愿月付内容'],
        must_not_cover: ['随手看 YouTube 低粘性', '主流体育迷']
      },
      VALUE_PROPOSITIONS: {
        must_cover: ['深度原创纪录片', '社区社交', '多机位直播'],
        must_not_cover: ['顶级赛事独家', '免费无广告']
      },
      REVENUE_STREAMS: {
        must_cover: ['月订阅 $10', '品牌植入/赞助'],
        must_not_cover: ['纯广告免费', '顶级赛事 PPV']
      },
      KEY_PARTNERSHIPS: { must_cover: ['中腰部赛事组委', '顶流 creator', '装备品牌'] },
      KEY_RESOURCES: { must_cover: ['原创制作团队', 'creator 网络', '内容版权库'] },
      KEY_ACTIVITIES: { must_cover: ['原创内容制作', 'creator 签约', '社区运营'] }
    },
    consistency_checks: [
      '不争独家顶级权 → KEY_PARTNERSHIPS 不含 UCI',
      '原创比例 60% → KEY_RESOURCES 制作团队规模匹配',
      '全球统一 $10 → CHANNELS 不引地区差异化定价'
    ]
  }
}
