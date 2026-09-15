import { getWorkspaceFlow, type WorkspaceFlowKey, type WorkspaceStageId } from './workspace-flow'

export type MonitoredPageId =
  | 'monitor'
  | 'dashboard'
  | 'community'
  | 'practice'
  | 'practice-session'
  | WorkspaceFlowKey

type PageTier = 'system' | 'workspace' | 'support'

export type MonitoredPage = {
  id: MonitoredPageId
  title: string
  href: string
  routePattern: string
  tier: PageTier
  stageId?: WorkspaceStageId
  summary: string
  inputs: string[]
  outputs: string[]
  nextIds: MonitoredPageId[]
}

const systemPageDefinitions: Array<Omit<MonitoredPage, 'href'>> = [
  {
    id: 'monitor',
    title: '页面监控台',
    routePattern: '/monitor',
    tier: 'system',
    summary: '汇总系统页面、阶段完成度、数据源状态和结构风险的巡检视图。',
    inputs: ['工作区标识', '知识库状态', '画布图谱', '研讨运行时'],
    outputs: ['阶段完成度', '风险清单', '页面关系矩阵'],
    nextIds: ['dashboard', 'canvas']
  },
  {
    id: 'dashboard',
    title: '系统总控台',
    routePattern: '/dashboard',
    tier: 'system',
    summary: '作为唯一系统入口，负责选项目、恢复阶段和跳转补充模块。',
    inputs: ['工作区列表', '流程恢复点', '模块入口'],
    outputs: ['工作区跳转', '主链路总览'],
    nextIds: ['knowledge', 'macra', 'canvas', 'community', 'practice']
  },
  {
    id: 'community',
    title: '社区中心',
    routePattern: '/community',
    tier: 'support',
    summary: '承接分享、反馈和案例复用，不参与主链路推进。',
    inputs: ['项目结论', '对外内容'],
    outputs: ['讨论反馈', '社区案例'],
    nextIds: ['dashboard']
  },
  {
    id: 'practice',
    title: '跨文化练习',
    routePattern: '/practice',
    tier: 'support',
    summary: '在正式对外表达前进行模拟练习和即时反馈。',
    inputs: ['沟通场景', '练习目标'],
    outputs: ['评分', '建议话术', '场景记录'],
    nextIds: ['practice-session', 'cultural-tools']
  },
  {
    id: 'practice-session',
    title: '练习会话',
    routePattern: '/practice/[scenarioId]',
    tier: 'support',
    summary: '进入具体场景对练，沉淀一轮完整练习过程。',
    inputs: ['选定场景', '用户对话'],
    outputs: ['会话记录', '反馈评分'],
    nextIds: ['cultural-tools']
  }
]

export function getMonitoredPages(workspaceId: string) {
  const workflowPages: MonitoredPage[] = getWorkspaceFlow(workspaceId).map((item) => ({
    id: item.key,
    title: item.label,
    href: item.href,
    routePattern: item.segment
      ? `/workspace/[workspaceId]/${item.segment}`
      : '/workspace/[workspaceId]',
    tier: 'workspace',
    stageId: item.stageId,
    summary: item.description,
    inputs: getWorkflowInputs(item.key),
    outputs: [item.deliverable],
    nextIds: getWorkflowNextIds(item.key)
  }))

  const systemPages: MonitoredPage[] = systemPageDefinitions.map((page) => ({
    ...page,
    href: resolveSystemHref(page.id)
  }))

  return [...systemPages, ...workflowPages]
}

function resolveSystemHref(pageId: MonitoredPageId) {
  switch (pageId) {
    case 'monitor':
      return '/monitor'
    case 'dashboard':
      return '/dashboard'
    case 'community':
      return '/community'
    case 'practice':
      return '/practice'
    case 'practice-session':
      return '/practice/demo'
    default:
      return '/dashboard'
  }
}

function getWorkflowInputs(key: WorkspaceFlowKey) {
  switch (key) {
    case 'knowledge':
      return ['文件', '网页链接', '文本种子']
    case 'translate':
      return ['原始文本', '目标语种']
    case 'deep-research':
      return ['研究问题', '知识背景']
    case 'insights':
      return ['表格数据', '图表需求']
    case 'experts':
      return ['Agent 观点', 'Seminar 轨迹', '画布上下文']
    case 'macra':
      return ['商业问题', '知识背景', '工作区图谱']
    case 'flow':
      return ['工作流模板', '节点工具', '执行顺序']
    case 'canvas':
      return ['研究结论', '节点引用', '问题拆解']
    case 'comfy':
      return ['商业问题', '价值假设']
    case 'agents':
      return ['画布节点', 'Agent 运行结果']
    case 'seminar':
      return ['Agent 观点', '冲突项', '执行方案']
    case 'cultural-tools':
      return ['研讨结论', '沟通目标', '报告素材']
  }
}

function getWorkflowNextIds(key: WorkspaceFlowKey): MonitoredPageId[] {
  switch (key) {
    case 'knowledge':
      return ['translate', 'deep-research', 'insights', 'canvas']
    case 'translate':
      return ['knowledge', 'deep-research']
    case 'deep-research':
      return ['canvas']
    case 'insights':
      return ['canvas']
    case 'experts':
      return ['macra', 'canvas', 'agents', 'seminar']
    case 'macra':
      return ['flow', 'canvas', 'comfy']
    case 'flow':
      return ['macra', 'canvas']
    case 'canvas':
      return ['macra', 'experts', 'comfy', 'agents', 'seminar']
    case 'comfy':
      return ['agents', 'seminar']
    case 'agents':
      return ['seminar']
    case 'seminar':
      return ['cultural-tools']
    case 'cultural-tools':
      return ['community']
  }
}
