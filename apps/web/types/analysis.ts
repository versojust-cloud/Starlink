export type AnalysisSubQuestion = {
  title: string
  prompt: string
}

export type AnalysisDimension = {
  label: string
  insight: string
}

export type AnalysisActionItem = {
  title: string
  description: string
  suggestedOwner?: string
}

export type AnalysisResult = {
  question: string
  summary: string
  subQuestions: AnalysisSubQuestion[]
  dimensions: AnalysisDimension[]
  actionItems: AnalysisActionItem[]
}

