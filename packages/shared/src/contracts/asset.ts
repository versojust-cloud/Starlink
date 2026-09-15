import { z } from 'zod'

const isoDateTimeString = z.string().datetime()

export const assetStatusSchema = z.enum([
  'draft',
  'processing',
  'ready',
  'published',
  'archived',
  'error'
])

export const workspaceAssetSchema = z.object({
  assetId: z.string().min(1),
  workspaceId: z.string().min(1),
  assetType: z.string().min(1),
  title: z.string().min(1),
  sourceModule: z.string().min(1),
  sourceTaskId: z.string().nullable().optional(),
  metadata: z.record(z.unknown()),
  content: z.unknown(),
  version: z.number().int().nonnegative(),
  status: assetStatusSchema,
  createdBy: z.string().min(1),
  createdAt: isoDateTimeString,
  updatedAt: isoDateTimeString
})

export const workspaceAssetListResponseSchema = z.object({
  workspaceAssets: z.array(workspaceAssetSchema)
})

export const communityPostInputSchema = z.object({
  workspaceId: z.string().min(1),
  title: z.string().min(1),
  body: z.string().min(1),
  tags: z.array(z.string().min(1)).default([]),
  authorName: z.string().min(1),
  authorRole: z.string().nullable().optional()
})

export const practiceMessageSchema = z.object({
  id: z.string().min(1),
  role: z.string().min(1),
  content: z.string(),
  timestamp: z.number(),
  feedback: z.string().optional()
})

export const practiceInsightSchema = z.object({
  title: z.string().min(1),
  detail: z.string().min(1)
})

export const practiceResourceSchema = z.object({
  title: z.string().min(1),
  url: z.string().min(1).optional()
})

export const practiceSessionInputSchema = z.object({
  workspaceId: z.string().min(1),
  scenarioId: z.string().min(1),
  scenarioTitle: z.string().min(1).optional(),
  messages: z.array(practiceMessageSchema),
  insights: z.array(practiceInsightSchema).default([]),
  resources: z.array(practiceResourceSchema).default([]),
  quickReplies: z.array(z.string()).default([]),
  lastUpdated: isoDateTimeString.optional()
})

export type WorkspaceAsset = z.infer<typeof workspaceAssetSchema>
export type CommunityPostInput = z.infer<typeof communityPostInputSchema>
export type PracticeSessionInput = z.infer<typeof practiceSessionInputSchema>
