import { z } from 'zod'
import { taskStatusSchema, taskTypeSchema } from './task-events.js'

const isoDateTimeString = z.string().datetime()

export const kbStatusSchema = z.enum(['draft', 'processing', 'ready'])

export const knowledgeBaseSchema = z.object({
  id: z.string().min(1),
  workspaceId: z.string().min(1),
  name: z.string().min(1),
  status: kbStatusSchema,
  createdAt: isoDateTimeString,
  updatedAt: isoDateTimeString,
  publishedAt: isoDateTimeString.nullable().optional()
})

export const knowledgeTaskPayloadSchema = z.record(z.unknown())

export const knowledgeTaskSchema = z.object({
  id: z.string().min(1),
  workspaceId: z.string().min(1),
  kbId: z.string().min(1),
  type: taskTypeSchema,
  status: taskStatusSchema,
  payload: knowledgeTaskPayloadSchema.optional(),
  error: z.string().nullable().optional(),
  createdAt: isoDateTimeString,
  updatedAt: isoDateTimeString
})

export const kbTaskStatusSnapshotSchema = z.object({
  taskId: z.string().min(1),
  workspaceId: z.string().min(1),
  kbId: z.string().min(1),
  status: taskStatusSchema,
  taskType: taskTypeSchema,
  error: z.string().nullable().optional(),
  updatedAt: isoDateTimeString,
  lastEventId: z.string().min(1)
})

export const knowledgeBaseListResponseSchema = z.object({
  knowledgeBases: z.array(knowledgeBaseSchema).optional()
})

export const knowledgeBaseStatusResponseSchema = z.object({
  knowledgeBase: knowledgeBaseSchema.optional(),
  tasks: z.array(knowledgeTaskSchema).optional()
})

export const knowledgeSearchResultSchema = z.object({
  docId: z.string().min(1),
  snippet: z.string().min(1),
  score: z.number(),
  metadata: z.record(z.unknown()).optional()
})

export const knowledgeSearchResponseSchema = z.object({
  results: z.array(knowledgeSearchResultSchema).optional()
})

export type KbStatus = z.infer<typeof kbStatusSchema>
export type KnowledgeBase = z.infer<typeof knowledgeBaseSchema>
export type KnowledgeTask = z.infer<typeof knowledgeTaskSchema>
export type KbTaskStatusSnapshot = z.infer<typeof kbTaskStatusSnapshotSchema>
export type KnowledgeSearchResult = z.infer<typeof knowledgeSearchResultSchema>
