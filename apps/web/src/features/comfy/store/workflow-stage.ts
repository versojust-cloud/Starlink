export type WorkflowStage =
  | 'idle'
  | 'input'
  | 'thinking'
  | 'output'
  | 'review'
  | 'revising'
  | 'failed'
  | 'cancelled'

export const WORKFLOW_STAGE_LABELS: Record<WorkflowStage, string> = {
  idle: '待机',
  input: '输入中',
  thinking: '分析中',
  output: '已产出',
  review: '待决策',
  revising: '修订中',
  failed: '失败',
  cancelled: '已取消'
}

export const WORKFLOW_STAGE_ORDER: WorkflowStage[] = [
  'idle',
  'input',
  'thinking',
  'review',
  'revising',
  'output'
]

const WORKFLOW_TRANSITIONS: Record<WorkflowStage, WorkflowStage[]> = {
  idle: ['input', 'thinking', 'cancelled'],
  input: ['idle', 'thinking', 'failed', 'cancelled'],
  thinking: ['output', 'review', 'failed', 'cancelled'],
  output: ['input', 'thinking', 'review', 'failed', 'cancelled'],
  review: ['revising', 'output', 'failed', 'cancelled'],
  revising: ['thinking', 'output', 'review', 'failed', 'cancelled'],
  failed: ['input', 'thinking', 'cancelled'],
  cancelled: ['idle', 'input', 'thinking']
}

export function canTransitionWorkflowStage(from: WorkflowStage, to: WorkflowStage) {
  return from === to || WORKFLOW_TRANSITIONS[from].includes(to)
}

