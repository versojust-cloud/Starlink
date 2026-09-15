import type { BenchmarkCase } from '../../types.js'

export const bmcVectordbEnterprise2024: BenchmarkCase = {
  case_id: 'bmc-vectordb-enterprise-2024',
  domain: 'enterprise-ai-infra',
  region: 'global',
  source: {
    kind: 'academic-paper',
    citation: 'Zott, C., Amit, R. (2010). Long Range Planning 43. + Nambisan et al. (2017). MISQ 41.'
  },
  input: {
    question: '为一家企业级 vector DB + 检索编排平台设计 CC-BMC 画布，目标 Fortune-1000 内部 AI 平台团队，兼容三大云不被锁定。',
    workspace_knowledge: [
      {
        doc_id: 'enterprise-rag-2024',
        title: '2024 企业 RAG 落地成熟度',
        content: '78% Fortune-1000 已启动 RAG 项目；83% 失败归因于"检索质量不稳定"；预算 $300k-1.5M/yr。'
      },
      {
        doc_id: 'vector-db-landscape',
        title: 'Vector DB 竞争格局',
        content: '主流: Pinecone / Weaviate / Chroma / Milvus / pgvector；差异化: hybrid search 质量、多租户、私有部署、compliance。'
      }
    ],
    constraints: ['必须支持 self-hosted / VPC 部署', '不能仅锁 AWS', 'ARR > $200k 客户占 ≥70%', 'SOC2 + HIPAA 合规']
  },
  expected_output: {
    dimensions: {
      CUSTOMER_SEGMENTS: {
        must_cover: ['Fortune-1000 AI 平台团队', '受监管行业（金融/医疗）'],
        must_not_cover: ['消费级开发者', '个人副业项目']
      },
      VALUE_PROPOSITIONS: {
        must_cover: ['多租户隔离', '私有部署', 'hybrid search 质量', '企业合规'],
        must_not_cover: ['最便宜', 'serverless-only']
      },
      REVENUE_STREAMS: {
        must_cover: ['按集群 / 按查询 tier 订阅', '企业年度许可'],
        must_not_cover: ['广告', '免费增值无限版']
      },
      CHANNELS: { must_cover: ['直销', '云市场 listing', '系统集成商合作'] },
      KEY_PARTNERSHIPS: { must_cover: ['三大云 coopetition', '系统集成商', '合规审计机构'] }
    },
    consistency_checks: [
      'self-hosted → KEY_ACTIVITIES 必须含 on-prem 部署工具',
      'ARR >$200k 占主 → 渠道直销权重高于 marketplace',
      '合规约束 → 成本必须显式 compliance 审计费'
    ]
  }
}
