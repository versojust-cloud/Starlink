import type { IngestionJob, InsightLog, KnowledgeEntry, KnowledgeStage } from '@/types/knowledge'

export const stageSummaries: Array<{
  key: KnowledgeStage | 'all'
  label: string
  description: string
  count: number
  delta?: string
}> = [
  { key: 'all', label: '全部条目', description: '知识库中的所有条目与状态', count: 28 },
  { key: 'uploaded', label: '待解析', description: '刚上传或待分配的资料', count: 6, delta: '+2' },
  { key: 'processing', label: '解析中', description: 'AI 正在提炼摘要与标签', count: 4, delta: '+1' },
  { key: 'ready', label: '待发布', description: '可生成洞察、写入画布或分享', count: 9 },
  { key: 'published', label: '已发布', description: '沉淀为模板或社群资源', count: 9 }
]

export const knowledgeEntries: KnowledgeEntry[] = [
  {
    id: 'kb-201',
    title: '2024 年 Q4 市场节奏策划案',
    stage: 'ready',
    tags: ['战略筹备', '市场洞察'],
    type: 'file',
    summary: '整合 12 份调研报告、重点时间节点与对标案例，可直接生成行动清单。',
    updatedAt: '2024-11-12',
    references: 8,
    owner: 'Jade',
    source: 'docs/q4-market-plan.pdf',
    nextActions: ['create-nodes', 'share-community']
  },
  {
    id: 'kb-202',
    title: '用户访谈：AI 笔记工作流痛点',
    stage: 'processing',
    tags: ['用户研究'],
    type: 'file',
    summary: '正在解析 6 位用户的访谈记录，聚焦协作与落地的问题。',
    updatedAt: '2024-11-11',
    references: 3,
    owner: 'Leo'
  },
  {
    id: 'kb-203',
    title: '竞品追踪：BranchCanvas vs. Miro',
    stage: 'published',
    tags: ['竞品分析', '运营复盘'],
    type: 'ai-summary',
    summary: 'AI 基于公开资料生成对比矩阵，包含价格策略、核心功能与渠道动作。',
    updatedAt: '2024-11-09',
    references: 5,
    owner: 'Mina',
    source: 'https://share.branching.chat/competitive',
    nextActions: ['publish-template']
  },
  {
    id: 'kb-204',
    title: '社群共创模板：年度策略拆解',
    stage: 'ready',
    tags: ['战略筹备', '运营复盘'],
    type: 'web',
    summary: '来自社群共创的文章，展示如何将年度目标拆解为季度行动与指标。',
    updatedAt: '2024-11-05',
    references: 7,
    owner: 'Ivy',
    source: 'https://co-create.branching.chat/articles/strategy-2024'
  },
  {
    id: 'kb-205',
    title: '内部培训：AI 画布最佳实践',
    stage: 'uploaded',
    tags: ['培训', '知识沉淀'],
    type: 'file',
    summary: '等待解析，将转换为可复用的培训模板与行动清单。',
    updatedAt: '2024-11-03',
    references: 0,
    owner: 'Alex'
  }
]

export const ingestionJobs: IngestionJob[] = [
  {
    id: 'job-201',
    fileName: '客户成功回访-202411.xlsx',
    stage: 'processing',
    progress: 62,
    submittedAt: '2024-11-11 13:40',
    owner: 'Mina'
  },
  {
    id: 'job-202',
    fileName: '共创对话纪要.md',
    stage: 'uploaded',
    progress: 10,
    submittedAt: '2024-11-11 09:55',
    owner: 'Leo'
  },
  {
    id: 'job-203',
    fileName: '行业周报-自动抓取',
    stage: 'completed',
    progress: 100,
    submittedAt: '2024-11-10 18:20',
    owner: 'Jade'
  }
]

export const insightHistory: InsightLog[] = [
  {
    id: 'insight-301',
    entryId: 'kb-201',
    question: '总结市场节奏策划案的关键假设及风险。',
    generatedAt: '2024-11-12 15:10',
    summary: '锁定节奏假设、关键阻塞与待验证指标，建议设置跟进节奏。',
    actions: ['写入画布节点', '创建行动项']
  },
  {
    id: 'insight-302',
    entryId: 'kb-204',
    question: '提炼年度策略拆解模板的重点。',
    generatedAt: '2024-11-10 10:32',
    summary: '模板可拆成目标→指标→行动→复盘四段，推荐纳入模板库。',
    actions: ['发布模板', '同步社群']
  }
]
