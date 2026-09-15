import { z } from 'zod';
export const apiErrorSchema = z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.unknown()).optional()
});
export const apiSuccessSchema = (dataSchema) => z.object({
    ok: z.literal(true),
    data: dataSchema
});
export const apiFailureSchema = z.object({
    ok: z.literal(false),
    error: apiErrorSchema
});
