import { z } from 'zod';
export declare const apiErrorSchema: z.ZodObject<{
    code: z.ZodString;
    message: z.ZodString;
    details: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    code: string;
    message: string;
    details?: Record<string, unknown> | undefined;
}, {
    code: string;
    message: string;
    details?: Record<string, unknown> | undefined;
}>;
export declare const apiSuccessSchema: <T extends z.ZodTypeAny>(dataSchema: T) => z.ZodObject<{
    ok: z.ZodLiteral<true>;
    data: T;
}, "strip", z.ZodTypeAny, {
    ok: true;
    data: z.output<T>;
}, {
    ok: true;
    data: z.input<T>;
}>;
export declare const apiFailureSchema: z.ZodObject<{
    ok: z.ZodLiteral<false>;
    error: z.ZodObject<{
        code: z.ZodString;
        message: z.ZodString;
        details: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    }, "strip", z.ZodTypeAny, {
        code: string;
        message: string;
        details?: Record<string, unknown> | undefined;
    }, {
        code: string;
        message: string;
        details?: Record<string, unknown> | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    ok: false;
    error: {
        code: string;
        message: string;
        details?: Record<string, unknown> | undefined;
    };
}, {
    ok: false;
    error: {
        code: string;
        message: string;
        details?: Record<string, unknown> | undefined;
    };
}>;
export type ApiError = z.infer<typeof apiErrorSchema>;
