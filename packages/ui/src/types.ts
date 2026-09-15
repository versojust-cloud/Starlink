export type TimelineNode = {
  id: string
  type: string
  position: { x: number; y: number }
  data: Record<string, unknown>
}

export type TimelineEdge = {
  id: string
  source: string
  target: string
  label?: string | null
}

export type TimelineIteration = {
  id: string
  version: number
  summary: string
  createdAt: string
  nodes: TimelineNode[]
  edges: TimelineEdge[]
}

export type AnalyzeRequest = {
  tenantId: string
  userId: string
  taskId: string
  question: string
  timeline: TimelineNode[]
  edges: TimelineEdge[]
}

export type AnalyzeResponse = {
  nodes: TimelineNode[]
  edges: TimelineEdge[]
  summary: string
  iteration?: TimelineIteration
}
