import { z } from 'zod';
export declare const taskStatusSchema: z.ZodEnum<["pending", "processing", "succeeded", "failed"]>;
export declare const taskTypeSchema: z.ZodEnum<["seed", "file", "url"]>;
export declare const taskEventTypeSchema: z.ZodEnum<["kb.task.created", "kb.task.processing", "kb.task.succeeded", "kb.task.failed"]>;
export declare const taskEventPayloadSchema: z.ZodObject<{
    taskType: z.ZodEnum<["seed", "file", "url"]>;
    error: z.ZodOptional<z.ZodString>;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    taskType: "seed" | "file" | "url";
    error?: string | undefined;
    metadata?: Record<string, unknown> | undefined;
}, {
    taskType: "seed" | "file" | "url";
    error?: string | undefined;
    metadata?: Record<string, unknown> | undefined;
}>;
export declare const taskEventSchema: z.ZodObject<{
    eventId: z.ZodString;
    eventType: z.ZodEnum<["kb.task.created", "kb.task.processing", "kb.task.succeeded", "kb.task.failed"]>;
    version: z.ZodLiteral<"1.0">;
    occurredAt: z.ZodString;
    taskId: z.ZodString;
    kbId: z.ZodString;
    status: z.ZodEnum<["pending", "processing", "succeeded", "failed"]>;
    payload: z.ZodObject<{
        taskType: z.ZodEnum<["seed", "file", "url"]>;
        error: z.ZodOptional<z.ZodString>;
        metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    }, "strip", z.ZodTypeAny, {
        taskType: "seed" | "file" | "url";
        error?: string | undefined;
        metadata?: Record<string, unknown> | undefined;
    }, {
        taskType: "seed" | "file" | "url";
        error?: string | undefined;
        metadata?: Record<string, unknown> | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    status: "pending" | "processing" | "succeeded" | "failed";
    version: "1.0";
    payload: {
        taskType: "seed" | "file" | "url";
        error?: string | undefined;
        metadata?: Record<string, unknown> | undefined;
    };
    eventId: string;
    eventType: "kb.task.created" | "kb.task.processing" | "kb.task.succeeded" | "kb.task.failed";
    occurredAt: string;
    taskId: string;
    kbId: string;
}, {
    status: "pending" | "processing" | "succeeded" | "failed";
    version: "1.0";
    payload: {
        taskType: "seed" | "file" | "url";
        error?: string | undefined;
        metadata?: Record<string, unknown> | undefined;
    };
    eventId: string;
    eventType: "kb.task.created" | "kb.task.processing" | "kb.task.succeeded" | "kb.task.failed";
    occurredAt: string;
    taskId: string;
    kbId: string;
}>;
export declare const taskEventBatchSchema: z.ZodObject<{
    events: z.ZodArray<z.ZodObject<{
        eventId: z.ZodString;
        eventType: z.ZodEnum<["kb.task.created", "kb.task.processing", "kb.task.succeeded", "kb.task.failed"]>;
        version: z.ZodLiteral<"1.0">;
        occurredAt: z.ZodString;
        taskId: z.ZodString;
        kbId: z.ZodString;
        status: z.ZodEnum<["pending", "processing", "succeeded", "failed"]>;
        payload: z.ZodObject<{
            taskType: z.ZodEnum<["seed", "file", "url"]>;
            error: z.ZodOptional<z.ZodString>;
            metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        }, "strip", z.ZodTypeAny, {
            taskType: "seed" | "file" | "url";
            error?: string | undefined;
            metadata?: Record<string, unknown> | undefined;
        }, {
            taskType: "seed" | "file" | "url";
            error?: string | undefined;
            metadata?: Record<string, unknown> | undefined;
        }>;
    }, "strip", z.ZodTypeAny, {
        status: "pending" | "processing" | "succeeded" | "failed";
        version: "1.0";
        payload: {
            taskType: "seed" | "file" | "url";
            error?: string | undefined;
            metadata?: Record<string, unknown> | undefined;
        };
        eventId: string;
        eventType: "kb.task.created" | "kb.task.processing" | "kb.task.succeeded" | "kb.task.failed";
        occurredAt: string;
        taskId: string;
        kbId: string;
    }, {
        status: "pending" | "processing" | "succeeded" | "failed";
        version: "1.0";
        payload: {
            taskType: "seed" | "file" | "url";
            error?: string | undefined;
            metadata?: Record<string, unknown> | undefined;
        };
        eventId: string;
        eventType: "kb.task.created" | "kb.task.processing" | "kb.task.succeeded" | "kb.task.failed";
        occurredAt: string;
        taskId: string;
        kbId: string;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    events: {
        status: "pending" | "processing" | "succeeded" | "failed";
        version: "1.0";
        payload: {
            taskType: "seed" | "file" | "url";
            error?: string | undefined;
            metadata?: Record<string, unknown> | undefined;
        };
        eventId: string;
        eventType: "kb.task.created" | "kb.task.processing" | "kb.task.succeeded" | "kb.task.failed";
        occurredAt: string;
        taskId: string;
        kbId: string;
    }[];
}, {
    events: {
        status: "pending" | "processing" | "succeeded" | "failed";
        version: "1.0";
        payload: {
            taskType: "seed" | "file" | "url";
            error?: string | undefined;
            metadata?: Record<string, unknown> | undefined;
        };
        eventId: string;
        eventType: "kb.task.created" | "kb.task.processing" | "kb.task.succeeded" | "kb.task.failed";
        occurredAt: string;
        taskId: string;
        kbId: string;
    }[];
}>;
export type TaskStatus = z.infer<typeof taskStatusSchema>;
export type TaskType = z.infer<typeof taskTypeSchema>;
export type TaskEventType = z.infer<typeof taskEventTypeSchema>;
export type TaskEvent = z.infer<typeof taskEventSchema>;
