import type { BenchmarkCase } from '../../types.js'

export const bmcMoocProfessionalCert2024: BenchmarkCase = {
  case_id: 'bmc-mooc-professional-cert-2024',
  domain: 'edtech-reskilling',
  region: 'global',
  source: {
    kind: 'academic-paper',
    citation: 'Christensen, Horn, Caldera, Soares (2011). Disrupting College. CAP. + Shah, D. (2023). MOOCs in 2023.'
  },
  input: {
    question: '为 MOOC 平台的"中期职业转型（转 AI/数据）"专业证书产品线设计 CC-BMC 画布，目标 3-10 年经验非技术从业者。',
    workspace_knowledge: [
      {
        doc_id: 'reskill-market-2024',
        title: '中期职业转型市场',
        content: '2024 年全球中期职业转型培训 $47B；"转技术"类占 22%；雇主侧 30% 对 Coursera-Stanford 等品牌 signaling 加分。'
      },
      {
        doc_id: 'cohort-vs-self-paced',
        title: 'Cohort 制 vs 自学',
        content: 'Cohort 制定价 $2k-15k 完成率 70-85%；自学型 $30-60/mo 完成率 <20%；用户愿付 20-40x 溢价。'
      }
    ],
    constraints: ['不做大学学分转换', '完成率 ≥60%', '与 5+ 雇主建立 hire 通道', '定价 $1.5k-4k/bundle']
  },
  expected_output: {
    dimensions: {
      CUSTOMER_SEGMENTS: {
        must_cover: ['3-10 年经验非技术从业者', '转 AI/data 诉求', '有学习预算'],
        must_not_cover: ['应届毕业生', '纯兴趣学习者']
      },
      VALUE_PROPOSITIONS: {
        must_cover: ['雇主签证信号', 'cohort 社群', 'project-based 能力证明'],
        must_not_cover: ['无限课程库', '学分转换']
      },
      REVENUE_STREAMS: {
        must_cover: ['专业证书 bundle 一次性付费', '雇主赞助代付'],
        must_not_cover: ['按课时订阅', '免费广告模式']
      },
      KEY_PARTNERSHIPS: { must_cover: ['雇主 hire 通道', '业界导师网络'] },
      CUSTOMER_RELATIONSHIPS: {
        must_cover: ['cohort 同伴', '1v1 mentor', '职业发展顾问'],
        must_not_cover: ['完全自学无互动']
      }
    },
    consistency_checks: [
      'cohort 制 + 完成率 60% → 客户关系必须有 mentor/同伴系统',
      '雇主 hire 通道 → KEY_PARTNERSHIPS + 营销渠道含企业合作',
      '定价 $1.5k-4k → 不同时支持纯订阅模式'
    ]
  }
}
