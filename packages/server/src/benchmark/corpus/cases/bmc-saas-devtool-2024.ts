import type { BenchmarkCase } from '../../types.js'

export const bmcSaasDevtool2024: BenchmarkCase = {
  case_id: 'bmc-saas-devtool-2024',
  domain: 'saas-developer-tools',
  region: 'global',
  source: {
    kind: 'academic-paper',
    citation:
      'Cusumano, M. A., Yoffie, D. B. (2020). Platform vs. Product: Strategies for the Modern Developer-Tools Market. HBR 98(1).'
  },
  input: {
    question:
      '为一款面向中小团队的云原生 CI/CD 开发者工具（年费 $20-40/席位）设计 CC-BMC 商业模型画布，重点覆盖增长阶段的客户获取路径与留存策略。',
    workspace_knowledge: [
      {
        doc_id: 'devtools-market-2024',
        title: '2024 全球开发者工具市场报告',
        content: '2024 年开发者工具市场 TAM 约 $58B，CI/CD 细分约 $12B，主要增长来自中小团队 self-serve 采购。'
      },
      {
        doc_id: 'dev-segment-survey',
        title: '开发者偏好调研 N=1240',
        content: "67% 受访者把 'bootstrap 难度' 列为关键因素；89% 决策者是工程师本人。"
      }
    ],
    constraints: ['不依赖企业销售团队（PLG-first）', '一年内不融资', '可与 GitHub Actions 共存']
  },
  expected_output: {
    dimensions: {
      CUSTOMER_SEGMENTS: {
        must_cover: ['中小团队工程师', 'self-serve 采购', '开源维护者'],
        must_not_cover: ['大企业采购', '非技术 VP'],
        min_confidence: 0.7
      },
      VALUE_PROPOSITIONS: {
        must_cover: ['快速 bootstrap', '与 GitHub Actions 互补'],
        must_not_cover: ['100% 取代 GitHub Actions']
      },
      REVENUE_STREAMS: {
        must_cover: ['按席位订阅', '免费增值 free tier'],
        must_not_cover: ['一次性授权']
      },
      CHANNELS: {
        must_cover: ['官网 self-serve', 'GitHub Marketplace', '开发者社区'],
        must_not_cover: ['电销']
      }
    },
    consistency_checks: [
      '客户是工程师 → 渠道必须含开发者社区类触点',
      '单位经济为正 → 免费增值必须有明确转化触发器',
      'self-serve → 客户关系不能高度依赖 1v1'
    ]
  }
}
