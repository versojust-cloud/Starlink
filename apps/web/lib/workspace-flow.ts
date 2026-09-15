export type WorkspaceStageId = 'intake' | 'analysis' | 'modeling' | 'delivery'

export type WorkspaceFlowKey =
  | 'knowledge'
  | 'translate'
  | 'deep-research'
  | 'insights'
  | 'experts'
  | 'macra'
  | 'flow'
  | 'canvas'
  | 'comfy'
  | 'agents'
  | 'seminar'
  | 'cultural-tools'

export type WorkspaceFlowNavGroup = 'primary' | 'tools' | 'collaboration' | 'delivery'

type WorkspaceFlowDefinition = {
  key: WorkspaceFlowKey
  label: string
  shortLabel: string
  description: string
  deliverable: string
  stageId: WorkspaceStageId
  segment: string
  navGroup: WorkspaceFlowNavGroup
}

type WorkspaceStageDefinition = {
  id: WorkspaceStageId
  label: string
  accent: string
  description: string
}

export type WorkspaceFlowItem = WorkspaceFlowDefinition & {
  href: string
}

export type WorkspaceFlowStage = WorkspaceStageDefinition & {
  items: WorkspaceFlowItem[]
}

export type WorkspaceFlowNavigationSection = {
  id: WorkspaceFlowNavGroup
  label: string
  items: WorkspaceFlowItem[]
}

export const workspaceFlowStages: WorkspaceStageDefinition[] = [
  {
    id: 'intake',
    label: '资料归集',
    accent: '01',
    description: '把外部文档、网页与多语内容整理为可复用的项目资产。'
  },
  {
    id: 'analysis',
    label: '研究分析',
    accent: '02',
    description: '将知识资产转为结构化洞察、对比结论与趋势判断。'
  },
  {
    id: 'modeling',
    label: '方案建模',
    accent: '03',
    description: '把研究结果沉淀到画布、Agent 和商业模型里形成可讨论方案。'
  },
  {
    id: 'delivery',
    label: '交付协作',
    accent: '04',
    description: '通过研讨、跨文化表达与输出包装，把方案推向执行与共识。'
  }
]

const workspaceFlowDefinitions: WorkspaceFlowDefinition[] = [
  {
    key: 'knowledge',
    label: '知识库',
    shortLabel: '知识',
    description: '导入文件、网页和文本种子，建立项目知识底座。',
    deliverable: '沉淀可检索、可发布的资料库',
    stageId: 'intake',
    segment: 'knowledge',
    navGroup: 'tools'
  },
  {
    key: 'translate',
    label: '快速翻译',
    shortLabel: '翻译',
    description: '处理跨语种内容，为研究和汇报统一语言上下文。',
    deliverable: '得到可直接分析的统一语言版本',
    stageId: 'intake',
    segment: 'translate',
    navGroup: 'tools'
  },
  {
    key: 'deep-research',
    label: '深度研究',
    shortLabel: '研究',
    description: '围绕问题发起多源研究，获得概览、关键发现和建议。',
    deliverable: '生成主题研究报告与参考来源',
    stageId: 'analysis',
    segment: 'deep-research',
    navGroup: 'tools'
  },
  {
    key: 'insights',
    label: '数据洞察',
    shortLabel: '洞察',
    description: '上传结构化数据并生成图表、摘要和异常信号。',
    deliverable: '形成数据图表与结论摘要',
    stageId: 'analysis',
    segment: 'insights',
    navGroup: 'tools'
  },
  {
    key: 'experts',
    label: '专家协作',
    shortLabel: '专家',
    description: '以统一专家面板查看多角色观点、分歧、阶段推进与收敛建议。',
    deliverable: '得到专家协作摘要、冲突点与行动建议',
    stageId: 'modeling',
    segment: 'experts',
    navGroup: 'tools'
  },
  {
    key: 'macra',
    label: 'MACRA 分析',
    shortLabel: 'MACRA',
    description: '多智能体协同分析商业问题，生成 CC-BMC 九宫格与冲突视图。',
    deliverable: 'CC-BMC 九宫格画布、冲突检测报告',
    stageId: 'modeling',
    segment: 'macra',
    navGroup: 'primary'
  },
  {
    key: 'flow',
    label: '工作流编辑器',
    shortLabel: '工作流',
    description: '可视化拖拽 Tool 和 Agent 节点，自定义分析流程。',
    deliverable: '可复用分析工作流模板',
    stageId: 'modeling',
    segment: 'flow',
    navGroup: 'tools'
  },
  {
    key: 'canvas',
    label: '智慧画布',
    shortLabel: '画布',
    description: '将问题拆解、证据引用、策略推演与行动路径统一到工作区主战场。',
    deliverable: '形成主问题树、节点结构和行动脉络',
    stageId: 'modeling',
    segment: 'canvas',
    navGroup: 'primary'
  },
  {
    key: 'comfy',
    label: '智绘商业画布',
    shortLabel: '商业',
    description: '以商业模型视角重构方案，沉淀价值主张与关键资源。',
    deliverable: '输出商业模型与策略路径',
    stageId: 'modeling',
    segment: 'comfy',
    navGroup: 'collaboration'
  },
  {
    key: 'agents',
    label: 'Agent 面板',
    shortLabel: 'Agent',
    description: '查看各个 Agent 的规划、执行、质询和决策产出。',
    deliverable: '明确每个 Agent 的贡献与分歧点',
    stageId: 'modeling',
    segment: 'agents',
    navGroup: 'collaboration'
  },
  {
    key: 'seminar',
    label: '研讨会',
    shortLabel: '研讨',
    description: '把 Agent 观点拉到统一议程，完成模拟讨论与决策收敛。',
    deliverable: '形成共识、冲突记录和行动建议',
    stageId: 'delivery',
    segment: 'seminar',
    navGroup: 'collaboration'
  },
  {
    key: 'cultural-tools',
    label: '跨文化助手',
    shortLabel: '跨文化',
    description: '进行话术润色、场景模拟与策略报告封装，支撑对外表达。',
    deliverable: '完成跨文化沟通、表达与报告交付',
    stageId: 'delivery',
    segment: 'cultural-tools',
    navGroup: 'delivery'
  }
]

function buildWorkspaceHref(workspaceId: string, segment: string) {
  return segment ? `/workspace/${workspaceId}/${segment}` : `/workspace/${workspaceId}`
}

export function getWorkspaceFlow(workspaceId: string): WorkspaceFlowItem[] {
  return workspaceFlowDefinitions.map((item) => ({
    ...item,
    href: buildWorkspaceHref(workspaceId, item.segment)
  }))
}

export function getWorkspaceFlowByKey(workspaceId: string, key: WorkspaceFlowKey) {
  return getWorkspaceFlow(workspaceId).find((item) => item.key === key) ?? null
}

export function getWorkspaceNavigationSections(workspaceId: string): WorkspaceFlowNavigationSection[] {
  const items = getWorkspaceFlow(workspaceId)
  const definitions: Array<{ id: WorkspaceFlowNavGroup; label: string }> = [
    { id: 'primary', label: '主战场' },
    { id: 'tools', label: '工具页' },
    { id: 'collaboration', label: '协作层' },
    { id: 'delivery', label: '输出层' }
  ]

  return definitions.map((definition) => ({
    ...definition,
    items: items.filter((item) => item.navGroup === definition.id)
  }))
}

export function getWorkspaceFlowContext(workspaceId: string, pathname: string) {
  const items = getWorkspaceFlow(workspaceId)
  const activeItem =
    items.find((item) => {
      return pathname.startsWith(item.href)
    }) ?? items[0]

  const activeIndex = items.findIndex((item) => item.key === activeItem.key)
  const stages: WorkspaceFlowStage[] = workspaceFlowStages.map((stage) => ({
    ...stage,
    items: items.filter((item) => item.stageId === stage.id)
  }))
  const activeStage = stages.find((stage) => stage.id === activeItem.stageId) ?? stages[0]

  return {
    items,
    stages,
    activeItem,
    activeStage,
    previousItem: activeIndex > 0 ? items[activeIndex - 1] : null,
    nextItem: activeIndex < items.length - 1 ? items[activeIndex + 1] : null
  }
}
