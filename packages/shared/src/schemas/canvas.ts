import { z } from 'zod'

export const canvasNodeDataSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('note'),
    title: z.string(),
    content: z.string(),
    subtitle: z.string().optional(),
    bullets: z.array(z.string()).optional(),
    variant: z
      .enum(['primary', 'list', 'insight', 'timeline-step', 'timeline-dimension', 'timeline-action'])
      .optional(),
    footerText: z.string().optional(),
    category: z.string().optional(),
    subCategory: z.string().optional(),
    status: z.string().optional(),
    meta: z.record(z.unknown()).optional()
  }),
  z.object({
    type: z.literal('document'),
    title: z.string(),
    summary: z.string(),
    references: z.number(),
    points: z.array(z.string()).optional()
  }),
  z.object({
    type: z.literal('task'),
    title: z.string(),
    assignee: z.string().optional(),
    dueDate: z.string().optional(),
    status: z.enum(['todo', 'in-progress', 'done'])
  }),
  z.object({
    type: z.literal('reference'),
    title: z.string(),
    source: z.string(),
    location: z.string()
  }),
  z.object({
    type: z.literal('image'),
    title: z.string(),
    url: z.string()
  }),
  z.object({
    type: z.literal('web'),
    title: z.string(),
    url: z.string(),
    description: z.string().optional()
  })
])

export const canvasNodeSchema = z.object({
  id: z.string(),
  type: z.enum(['note', 'document', 'task', 'reference', 'image', 'web']),
  position: z.object({ x: z.number(), y: z.number() }),
  data: canvasNodeDataSchema
})

/**
 * P11.13 · edge classification. Frontend uses this to apply per-class
 * styling (color / dash pattern / weight) so users can distinguish
 * rule-based BMC structure from LLM-suggested cross-dimension insights
 * from user-drawn manual connections.
 *
 *   'bmc-structure'  default  rule-based 9-edge BMC topology (服务于/触达/...)
 *   'llm-insight'             synthesizer LLM cross-dim suggestion
 *   'user-drawn'              user dragged from one handle to another
 *   'revision'                round N → N+1 cell replacement (future)
 */
export const canvasEdgeKindSchema = z.enum([
  'bmc-structure',
  'llm-insight',
  'user-drawn',
  'revision'
])
export type CanvasEdgeKind = z.infer<typeof canvasEdgeKindSchema>

export const canvasEdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  label: z.string().nullable().optional(),
  kind: canvasEdgeKindSchema.optional()
})

export const canvasGraphSchema = z.object({
  workspaceId: z.string(),
  nodes: z.array(canvasNodeSchema),
  edges: z.array(canvasEdgeSchema)
})

export type CanvasNodeData = z.infer<typeof canvasNodeDataSchema>
export type CanvasNode = z.infer<typeof canvasNodeSchema>
export type CanvasEdge = z.infer<typeof canvasEdgeSchema>
export type CanvasGraph = z.infer<typeof canvasGraphSchema>
