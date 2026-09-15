import { z } from 'zod';
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
]);
export const canvasNodeSchema = z.object({
    id: z.string(),
    type: z.enum(['note', 'document', 'task', 'reference', 'image', 'web']),
    position: z.object({ x: z.number(), y: z.number() }),
    data: canvasNodeDataSchema
});
export const canvasEdgeSchema = z.object({
    id: z.string(),
    source: z.string(),
    target: z.string(),
    label: z.string().nullable().optional()
});
export const canvasGraphSchema = z.object({
    workspaceId: z.string(),
    nodes: z.array(canvasNodeSchema),
    edges: z.array(canvasEdgeSchema)
});
