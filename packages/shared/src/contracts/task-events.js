import { z } from 'zod';
export const taskStatusSchema = z.enum(['pending', 'processing', 'succeeded', 'failed']);
export const taskTypeSchema = z.enum(['seed', 'file', 'url']);
export const taskEventTypeSchema = z.enum([
    'kb.task.created',
    'kb.task.processing',
    'kb.task.succeeded',
    'kb.task.failed'
]);
export const taskEventPayloadSchema = z.object({
    taskType: taskTypeSchema,
    error: z.string().optional(),
    metadata: z.record(z.unknown()).optional()
});
export const taskEventSchema = z.object({
    eventId: z.string().min(1),
    eventType: taskEventTypeSchema,
    version: z.literal('1.0'),
    occurredAt: z.string().datetime(),
    taskId: z.string().min(1),
    kbId: z.string().min(1),
    status: taskStatusSchema,
    payload: taskEventPayloadSchema
});
export const taskEventBatchSchema = z.object({
    events: z.array(taskEventSchema).min(1)
});
