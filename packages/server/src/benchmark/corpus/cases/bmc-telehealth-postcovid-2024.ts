import type { BenchmarkCase } from '../../types.js'

export const bmcTelehealthPostcovid2024: BenchmarkCase = {
  case_id: 'bmc-telehealth-postcovid-2024',
  domain: 'digital-health',
  region: 'us',
  source: {
    kind: 'academic-paper',
    citation: "Christensen, Waldeck, Fogg (2017). The Innovator's Prescription (rev). + Kruse et al. (2018). J Med Syst 42."
  },
  input: {
    question:
      '为一家面向 T2D + 高血压慢病人群的美国远程医疗 + 远程监测设备初创公司设计 CC-BMC 画布，要求能与商业医保（如 UnitedHealth/Aetna）签合同。',
    workspace_knowledge: [
      {
        doc_id: 'us-chronic-2024',
        title: '美国慢病市场规模',
        content: '2024 年 T2D 患者 3700 万，高血压 1.2 亿；CPT 99457 (RPM) 报销率近年 +40%。'
      },
      {
        doc_id: 'payer-contract-patterns',
        title: 'Payer 合同结构',
        content: 'PMPM ($8-35)、FFS（CPT 报销）、VBC 共担储蓄三类。VBC margin 最好但门槛高。'
      }
    ],
    constraints: ['HIPAA 合规', '患者月费 ≤ $0', '18 月内签下 1 家 top-10 payer', '设备 BOM < $120']
  },
  expected_output: {
    dimensions: {
      CUSTOMER_SEGMENTS: {
        must_cover: ['T2D 中晚期患者', '高血压长期患者', '商业医保覆盖'],
        must_not_cover: ['Medicare-only', '自费用户']
      },
      VALUE_PROPOSITIONS: {
        must_cover: ['减少住院', '提升依从性', 'payer ROI'],
        must_not_cover: ['纯消费级健康应用', '无医生闭环 AI 自诊断']
      },
      REVENUE_STREAMS: {
        must_cover: ['PMPM', 'CPT 99457', 'VBC 分成'],
        must_not_cover: ['患者付费订阅']
      },
      KEY_PARTNERSHIPS: { must_cover: ['payer', '持证临床医生', '设备代工厂'] },
      KEY_RESOURCES: { must_cover: ['HIPAA 合规架构', '临床循证数据'] }
    },
    consistency_checks: [
      '患者月费=0 → 收入全部来自 payer/CPT/VBC',
      '设备 BOM<$120 → 成本结构需控制 CAC 补贴',
      'payer 合同 → 客户关系必须有 account-management + outcome-reporting'
    ]
  }
}
