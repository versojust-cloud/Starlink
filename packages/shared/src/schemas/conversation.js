import { z } from 'zod';
import { canvasGraphSchema } from './canvas.js';
export const conversationStatusSchema = z.enum(['idle', 'running', 'failed', 'completed']);
export const conversationEventSchema = z.discriminatedUnion('type', [
    z.object({
        type: z.literal('graph/appended'),
        conversationId: z.string(),
        payload: canvasGraphSchema
    }),
    z.object({
        type: z.literal('graph/diff'),
        conversationId: z.string(),
        payload: z.object({
            nodes: z.array(canvasGraphSchema.shape.nodes.element).optional(),
            edges: z.array(canvasGraphSchema.shape.edges.element).optional()
        })
    }),
    z.object({
        type: z.literal('status'),
        conversationId: z.string(),
        status: conversationStatusSchema,
        message: z.string().optional()
    })
]);
export const conversationMetadataSchema = z.object({
    id: z.string(),
    createdAt: z.date(),
    updatedAt: z.date(),
    status: conversationStatusSchema,
    latestQuestion: z.string().optional()
});
export const knowledgeEvidenceSchema = z.object({
    docId: z.string(),
    snippet: z.string(),
    score: z.number(),
    metadata: z.record(z.unknown()).optional()
});
