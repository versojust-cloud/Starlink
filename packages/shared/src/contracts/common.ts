import { z } from 'zod'

export const apiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.record(z.unknown()).optional()
})

export const apiSuccessSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    ok: z.literal(true),
    data: dataSchema
  })

export const apiFailureSchema = z.object({
  ok: z.literal(false),
  error: apiErrorSchema
})

export type ApiError = z.infer<typeof apiErrorSchema>
