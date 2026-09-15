import { z } from 'zod';
export declare const conversationStatusSchema: z.ZodEnum<["idle", "running", "failed", "completed"]>;
export declare const conversationEventSchema: z.ZodDiscriminatedUnion<"type", [z.ZodObject<{
    type: z.ZodLiteral<"graph/appended">;
    conversationId: z.ZodString;
    payload: z.ZodObject<{
        workspaceId: z.ZodString;
        nodes: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            type: z.ZodEnum<["note", "document", "task", "reference", "image", "web"]>;
            position: z.ZodObject<{
                x: z.ZodNumber;
                y: z.ZodNumber;
            }, "strip", z.ZodTypeAny, {
                x: number;
                y: number;
            }, {
                x: number;
                y: number;
            }>;
            data: z.ZodDiscriminatedUnion<"type", [z.ZodObject<{
                type: z.ZodLiteral<"note">;
                title: z.ZodString;
                content: z.ZodString;
                subtitle: z.ZodOptional<z.ZodString>;
                bullets: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
                variant: z.ZodOptional<z.ZodEnum<["primary", "list", "insight", "timeline-step", "timeline-dimension", "timeline-action"]>>;
                footerText: z.ZodOptional<z.ZodString>;
                category: z.ZodOptional<z.ZodString>;
                subCategory: z.ZodOptional<z.ZodString>;
                status: z.ZodOptional<z.ZodString>;
                meta: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
            }, "strip", z.ZodTypeAny, {
                type: "note";
                title: string;
                content: string;
                status?: string | undefined;
                subtitle?: string | undefined;
                bullets?: string[] | undefined;
                variant?: "primary" | "list" | "insight" | "timeline-step" | "timeline-dimension" | "timeline-action" | undefined;
                footerText?: string | undefined;
                category?: string | undefined;
                subCategory?: string | undefined;
                meta?: Record<string, unknown> | undefined;
            }, {
                type: "note";
                title: string;
                content: string;
                status?: string | undefined;
                subtitle?: string | undefined;
                bullets?: string[] | undefined;
                variant?: "primary" | "list" | "insight" | "timeline-step" | "timeline-dimension" | "timeline-action" | undefined;
                footerText?: string | undefined;
                category?: string | undefined;
                subCategory?: string | undefined;
                meta?: Record<string, unknown> | undefined;
            }>, z.ZodObject<{
                type: z.ZodLiteral<"document">;
                title: z.ZodString;
                summary: z.ZodString;
                references: z.ZodNumber;
                points: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            }, "strip", z.ZodTypeAny, {
                type: "document";
                title: string;
                summary: string;
                references: number;
                points?: string[] | undefined;
            }, {
                type: "document";
                title: string;
                summary: string;
                references: number;
                points?: string[] | undefined;
            }>, z.ZodObject<{
                type: z.ZodLiteral<"task">;
                title: z.ZodString;
                assignee: z.ZodOptional<z.ZodString>;
                dueDate: z.ZodOptional<z.ZodString>;
                status: z.ZodEnum<["todo", "in-progress", "done"]>;
            }, "strip", z.ZodTypeAny, {
                type: "task";
                status: "todo" | "in-progress" | "done";
                title: string;
                assignee?: string | undefined;
                dueDate?: string | undefined;
            }, {
                type: "task";
                status: "todo" | "in-progress" | "done";
                title: string;
                assignee?: string | undefined;
                dueDate?: string | undefined;
            }>, z.ZodObject<{
                type: z.ZodLiteral<"reference">;
                title: z.ZodString;
                source: z.ZodString;
                location: z.ZodString;
            }, "strip", z.ZodTypeAny, {
                type: "reference";
                title: string;
                source: string;
                location: string;
            }, {
                type: "reference";
                title: string;
                source: string;
                location: string;
            }>, z.ZodObject<{
                type: z.ZodLiteral<"image">;
                title: z.ZodString;
                url: z.ZodString;
            }, "strip", z.ZodTypeAny, {
                type: "image";
                title: string;
                url: string;
            }, {
                type: "image";
                title: string;
                url: string;
            }>, z.ZodObject<{
                type: z.ZodLiteral<"web">;
                title: z.ZodString;
                url: z.ZodString;
                description: z.ZodOptional<z.ZodString>;
            }, "strip", z.ZodTypeAny, {
                type: "web";
                title: string;
                url: string;
                description?: string | undefined;
            }, {
                type: "web";
                title: string;
                url: string;
                description?: string | undefined;
            }>]>;
        }, "strip", z.ZodTypeAny, {
            type: "note" | "document" | "task" | "reference" | "image" | "web";
            id: string;
            position: {
                x: number;
                y: number;
            };
            data: {
                type: "note";
                title: string;
                content: string;
                status?: string | undefined;
                subtitle?: string | undefined;
                bullets?: string[] | undefined;
                variant?: "primary" | "list" | "insight" | "timeline-step" | "timeline-dimension" | "timeline-action" | undefined;
                footerText?: string | undefined;
                category?: string | undefined;
                subCategory?: string | undefined;
                meta?: Record<string, unknown> | undefined;
            } | {
                type: "document";
                title: string;
                summary: string;
                references: number;
                points?: string[] | undefined;
            } | {
                type: "task";
                status: "todo" | "in-progress" | "done";
                title: string;
                assignee?: string | undefined;
                dueDate?: string | undefined;
            } | {
                type: "reference";
                title: string;
                source: string;
                location: string;
            } | {
                type: "image";
                title: string;
                url: string;
            } | {
                type: "web";
                title: string;
                url: string;
                description?: string | undefined;
            };
        }, {
            type: "note" | "document" | "task" | "reference" | "image" | "web";
            id: string;
            position: {
                x: number;
                y: number;
            };
            data: {
                type: "note";
                title: string;
                content: string;
                status?: string | undefined;
                subtitle?: string | undefined;
                bullets?: string[] | undefined;
                variant?: "primary" | "list" | "insight" | "timeline-step" | "timeline-dimension" | "timeline-action" | undefined;
                footerText?: string | undefined;
                category?: string | undefined;
                subCategory?: string | undefined;
                meta?: Record<string, unknown> | undefined;
            } | {
                type: "document";
                title: string;
                summary: string;
                references: number;
                points?: string[] | undefined;
            } | {
                type: "task";
                status: "todo" | "in-progress" | "done";
                title: string;
                assignee?: string | undefined;
                dueDate?: string | undefined;
            } | {
                type: "reference";
                title: string;
                source: string;
                location: string;
            } | {
                type: "image";
                title: string;
                url: string;
            } | {
                type: "web";
                title: string;
                url: string;
                description?: string | undefined;
            };
        }>, "many">;
        edges: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            source: z.ZodString;
            target: z.ZodString;
            label: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        }, "strip", z.ZodTypeAny, {
            source: string;
            id: string;
            target: string;
            label?: string | null | undefined;
        }, {
            source: string;
            id: string;
            target: string;
            label?: string | null | undefined;
        }>, "many">;
    }, "strip", z.ZodTypeAny, {
        workspaceId: string;
        nodes: {
            type: "note" | "document" | "task" | "reference" | "image" | "web";
            id: string;
            position: {
                x: number;
                y: number;
            };
            data: {
                type: "note";
                title: string;
                content: string;
                status?: string | undefined;
                subtitle?: string | undefined;
                bullets?: string[] | undefined;
                variant?: "primary" | "list" | "insight" | "timeline-step" | "timeline-dimension" | "timeline-action" | undefined;
                footerText?: string | undefined;
                category?: string | undefined;
                subCategory?: string | undefined;
                meta?: Record<string, unknown> | undefined;
            } | {
                type: "document";
                title: string;
                summary: string;
                references: number;
                points?: string[] | undefined;
            } | {
                type: "task";
                status: "todo" | "in-progress" | "done";
                title: string;
                assignee?: string | undefined;
                dueDate?: string | undefined;
            } | {
                type: "reference";
                title: string;
                source: string;
                location: string;
            } | {
                type: "image";
                title: string;
                url: string;
            } | {
                type: "web";
                title: string;
                url: string;
                description?: string | undefined;
            };
        }[];
        edges: {
            source: string;
            id: string;
            target: string;
            label?: string | null | undefined;
        }[];
    }, {
        workspaceId: string;
        nodes: {
            type: "note" | "document" | "task" | "reference" | "image" | "web";
            id: string;
            position: {
                x: number;
                y: number;
            };
            data: {
                type: "note";
                title: string;
                content: string;
                status?: string | undefined;
                subtitle?: string | undefined;
                bullets?: string[] | undefined;
                variant?: "primary" | "list" | "insight" | "timeline-step" | "timeline-dimension" | "timeline-action" | undefined;
                footerText?: string | undefined;
                category?: string | undefined;
                subCategory?: string | undefined;
                meta?: Record<string, unknown> | undefined;
            } | {
                type: "document";
                title: string;
                summary: string;
                references: number;
                points?: string[] | undefined;
            } | {
                type: "task";
                status: "todo" | "in-progress" | "done";
                title: string;
                assignee?: string | undefined;
                dueDate?: string | undefined;
            } | {
                type: "reference";
                title: string;
                source: string;
                location: string;
            } | {
                type: "image";
                title: string;
                url: string;
            } | {
                type: "web";
                title: string;
                url: string;
                description?: string | undefined;
            };
        }[];
        edges: {
            source: string;
            id: string;
            target: string;
            label?: string | null | undefined;
        }[];
    }>;
}, "strip", z.ZodTypeAny, {
    type: "graph/appended";
    conversationId: string;
    payload: {
        workspaceId: string;
        nodes: {
            type: "note" | "document" | "task" | "reference" | "image" | "web";
            id: string;
            position: {
                x: number;
                y: number;
            };
            data: {
                type: "note";
                title: string;
                content: string;
                status?: string | undefined;
                subtitle?: string | undefined;
                bullets?: string[] | undefined;
                variant?: "primary" | "list" | "insight" | "timeline-step" | "timeline-dimension" | "timeline-action" | undefined;
                footerText?: string | undefined;
                category?: string | undefined;
                subCategory?: string | undefined;
                meta?: Record<string, unknown> | undefined;
            } | {
                type: "document";
                title: string;
                summary: string;
                references: number;
                points?: string[] | undefined;
            } | {
                type: "task";
                status: "todo" | "in-progress" | "done";
                title: string;
                assignee?: string | undefined;
                dueDate?: string | undefined;
            } | {
                type: "reference";
                title: string;
                source: string;
                location: string;
            } | {
                type: "image";
                title: string;
                url: string;
            } | {
                type: "web";
                title: string;
                url: string;
                description?: string | undefined;
            };
        }[];
        edges: {
            source: string;
            id: string;
            target: string;
            label?: string | null | undefined;
        }[];
    };
}, {
    type: "graph/appended";
    conversationId: string;
    payload: {
        workspaceId: string;
        nodes: {
            type: "note" | "document" | "task" | "reference" | "image" | "web";
            id: string;
            position: {
                x: number;
                y: number;
            };
            data: {
                type: "note";
                title: string;
                content: string;
                status?: string | undefined;
                subtitle?: string | undefined;
                bullets?: string[] | undefined;
                variant?: "primary" | "list" | "insight" | "timeline-step" | "timeline-dimension" | "timeline-action" | undefined;
                footerText?: string | undefined;
                category?: string | undefined;
                subCategory?: string | undefined;
                meta?: Record<string, unknown> | undefined;
            } | {
                type: "document";
                title: string;
                summary: string;
                references: number;
                points?: string[] | undefined;
            } | {
                type: "task";
                status: "todo" | "in-progress" | "done";
                title: string;
                assignee?: string | undefined;
                dueDate?: string | undefined;
            } | {
                type: "reference";
                title: string;
                source: string;
                location: string;
            } | {
                type: "image";
                title: string;
                url: string;
            } | {
                type: "web";
                title: string;
                url: string;
                description?: string | undefined;
            };
        }[];
        edges: {
            source: string;
            id: string;
            target: string;
            label?: string | null | undefined;
        }[];
    };
}>, z.ZodObject<{
    type: z.ZodLiteral<"graph/diff">;
    conversationId: z.ZodString;
    payload: z.ZodObject<{
        nodes: z.ZodOptional<z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            type: z.ZodEnum<["note", "document", "task", "reference", "image", "web"]>;
            position: z.ZodObject<{
                x: z.ZodNumber;
                y: z.ZodNumber;
            }, "strip", z.ZodTypeAny, {
                x: number;
                y: number;
            }, {
                x: number;
                y: number;
            }>;
            data: z.ZodDiscriminatedUnion<"type", [z.ZodObject<{
                type: z.ZodLiteral<"note">;
                title: z.ZodString;
                content: z.ZodString;
                subtitle: z.ZodOptional<z.ZodString>;
                bullets: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
                variant: z.ZodOptional<z.ZodEnum<["primary", "list", "insight", "timeline-step", "timeline-dimension", "timeline-action"]>>;
                footerText: z.ZodOptional<z.ZodString>;
                category: z.ZodOptional<z.ZodString>;
                subCategory: z.ZodOptional<z.ZodString>;
                status: z.ZodOptional<z.ZodString>;
                meta: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
            }, "strip", z.ZodTypeAny, {
                type: "note";
                title: string;
                content: string;
                status?: string | undefined;
                subtitle?: string | undefined;
                bullets?: string[] | undefined;
                variant?: "primary" | "list" | "insight" | "timeline-step" | "timeline-dimension" | "timeline-action" | undefined;
                footerText?: string | undefined;
                category?: string | undefined;
                subCategory?: string | undefined;
                meta?: Record<string, unknown> | undefined;
            }, {
                type: "note";
                title: string;
                content: string;
                status?: string | undefined;
                subtitle?: string | undefined;
                bullets?: string[] | undefined;
                variant?: "primary" | "list" | "insight" | "timeline-step" | "timeline-dimension" | "timeline-action" | undefined;
                footerText?: string | undefined;
                category?: string | undefined;
                subCategory?: string | undefined;
                meta?: Record<string, unknown> | undefined;
            }>, z.ZodObject<{
                type: z.ZodLiteral<"document">;
                title: z.ZodString;
                summary: z.ZodString;
                references: z.ZodNumber;
                points: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            }, "strip", z.ZodTypeAny, {
                type: "document";
                title: string;
                summary: string;
                references: number;
                points?: string[] | undefined;
            }, {
                type: "document";
                title: string;
                summary: string;
                references: number;
                points?: string[] | undefined;
            }>, z.ZodObject<{
                type: z.ZodLiteral<"task">;
                title: z.ZodString;
                assignee: z.ZodOptional<z.ZodString>;
                dueDate: z.ZodOptional<z.ZodString>;
                status: z.ZodEnum<["todo", "in-progress", "done"]>;
            }, "strip", z.ZodTypeAny, {
                type: "task";
                status: "todo" | "in-progress" | "done";
                title: string;
                assignee?: string | undefined;
                dueDate?: string | undefined;
            }, {
                type: "task";
                status: "todo" | "in-progress" | "done";
                title: string;
                assignee?: string | undefined;
                dueDate?: string | undefined;
            }>, z.ZodObject<{
                type: z.ZodLiteral<"reference">;
                title: z.ZodString;
                source: z.ZodString;
                location: z.ZodString;
            }, "strip", z.ZodTypeAny, {
                type: "reference";
                title: string;
                source: string;
                location: string;
            }, {
                type: "reference";
                title: string;
                source: string;
                location: string;
            }>, z.ZodObject<{
                type: z.ZodLiteral<"image">;
                title: z.ZodString;
                url: z.ZodString;
            }, "strip", z.ZodTypeAny, {
                type: "image";
                title: string;
                url: string;
            }, {
                type: "image";
                title: string;
                url: string;
            }>, z.ZodObject<{
                type: z.ZodLiteral<"web">;
                title: z.ZodString;
                url: z.ZodString;
                description: z.ZodOptional<z.ZodString>;
            }, "strip", z.ZodTypeAny, {
                type: "web";
                title: string;
                url: string;
                description?: string | undefined;
            }, {
                type: "web";
                title: string;
                url: string;
                description?: string | undefined;
            }>]>;
        }, "strip", z.ZodTypeAny, {
            type: "note" | "document" | "task" | "reference" | "image" | "web";
            id: string;
            position: {
                x: number;
                y: number;
            };
            data: {
                type: "note";
                title: string;
                content: string;
                status?: string | undefined;
                subtitle?: string | undefined;
                bullets?: string[] | undefined;
                variant?: "primary" | "list" | "insight" | "timeline-step" | "timeline-dimension" | "timeline-action" | undefined;
                footerText?: string | undefined;
                category?: string | undefined;
                subCategory?: string | undefined;
                meta?: Record<string, unknown> | undefined;
            } | {
                type: "document";
                title: string;
                summary: string;
                references: number;
                points?: string[] | undefined;
            } | {
                type: "task";
                status: "todo" | "in-progress" | "done";
                title: string;
                assignee?: string | undefined;
                dueDate?: string | undefined;
            } | {
                type: "reference";
                title: string;
                source: string;
                location: string;
            } | {
                type: "image";
                title: string;
                url: string;
            } | {
                type: "web";
                title: string;
                url: string;
                description?: string | undefined;
            };
        }, {
            type: "note" | "document" | "task" | "reference" | "image" | "web";
            id: string;
            position: {
                x: number;
                y: number;
            };
            data: {
                type: "note";
                title: string;
                content: string;
                status?: string | undefined;
                subtitle?: string | undefined;
                bullets?: string[] | undefined;
                variant?: "primary" | "list" | "insight" | "timeline-step" | "timeline-dimension" | "timeline-action" | undefined;
                footerText?: string | undefined;
                category?: string | undefined;
                subCategory?: string | undefined;
                meta?: Record<string, unknown> | undefined;
            } | {
                type: "document";
                title: string;
                summary: string;
                references: number;
                points?: string[] | undefined;
            } | {
                type: "task";
                status: "todo" | "in-progress" | "done";
                title: string;
                assignee?: string | undefined;
                dueDate?: string | undefined;
            } | {
                type: "reference";
                title: string;
                source: string;
                location: string;
            } | {
                type: "image";
                title: string;
                url: string;
            } | {
                type: "web";
                title: string;
                url: string;
                description?: string | undefined;
            };
        }>, "many">>;
        edges: z.ZodOptional<z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            source: z.ZodString;
            target: z.ZodString;
            label: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        }, "strip", z.ZodTypeAny, {
            source: string;
            id: string;
            target: string;
            label?: string | null | undefined;
        }, {
            source: string;
            id: string;
            target: string;
            label?: string | null | undefined;
        }>, "many">>;
        removedNodeIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        removedEdgeIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        nodes?: {
            type: "note" | "document" | "task" | "reference" | "image" | "web";
            id: string;
            position: {
                x: number;
                y: number;
            };
            data: {
                type: "note";
                title: string;
                content: string;
                status?: string | undefined;
                subtitle?: string | undefined;
                bullets?: string[] | undefined;
                variant?: "primary" | "list" | "insight" | "timeline-step" | "timeline-dimension" | "timeline-action" | undefined;
                footerText?: string | undefined;
                category?: string | undefined;
                subCategory?: string | undefined;
                meta?: Record<string, unknown> | undefined;
            } | {
                type: "document";
                title: string;
                summary: string;
                references: number;
                points?: string[] | undefined;
            } | {
                type: "task";
                status: "todo" | "in-progress" | "done";
                title: string;
                assignee?: string | undefined;
                dueDate?: string | undefined;
            } | {
                type: "reference";
                title: string;
                source: string;
                location: string;
            } | {
                type: "image";
                title: string;
                url: string;
            } | {
                type: "web";
                title: string;
                url: string;
                description?: string | undefined;
            };
        }[] | undefined;
        edges?: {
            source: string;
            id: string;
            target: string;
            label?: string | null | undefined;
        }[] | undefined;
        removedNodeIds?: string[] | undefined;
        removedEdgeIds?: string[] | undefined;
    }, {
        nodes?: {
            type: "note" | "document" | "task" | "reference" | "image" | "web";
            id: string;
            position: {
                x: number;
                y: number;
            };
            data: {
                type: "note";
                title: string;
                content: string;
                status?: string | undefined;
                subtitle?: string | undefined;
                bullets?: string[] | undefined;
                variant?: "primary" | "list" | "insight" | "timeline-step" | "timeline-dimension" | "timeline-action" | undefined;
                footerText?: string | undefined;
                category?: string | undefined;
                subCategory?: string | undefined;
                meta?: Record<string, unknown> | undefined;
            } | {
                type: "document";
                title: string;
                summary: string;
                references: number;
                points?: string[] | undefined;
            } | {
                type: "task";
                status: "todo" | "in-progress" | "done";
                title: string;
                assignee?: string | undefined;
                dueDate?: string | undefined;
            } | {
                type: "reference";
                title: string;
                source: string;
                location: string;
            } | {
                type: "image";
                title: string;
                url: string;
            } | {
                type: "web";
                title: string;
                url: string;
                description?: string | undefined;
            };
        }[] | undefined;
        edges?: {
            source: string;
            id: string;
            target: string;
            label?: string | null | undefined;
        }[] | undefined;
        removedNodeIds?: string[] | undefined;
        removedEdgeIds?: string[] | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    type: "graph/diff";
    conversationId: string;
    payload: {
        nodes?: {
            type: "note" | "document" | "task" | "reference" | "image" | "web";
            id: string;
            position: {
                x: number;
                y: number;
            };
            data: {
                type: "note";
                title: string;
                content: string;
                status?: string | undefined;
                subtitle?: string | undefined;
                bullets?: string[] | undefined;
                variant?: "primary" | "list" | "insight" | "timeline-step" | "timeline-dimension" | "timeline-action" | undefined;
                footerText?: string | undefined;
                category?: string | undefined;
                subCategory?: string | undefined;
                meta?: Record<string, unknown> | undefined;
            } | {
                type: "document";
                title: string;
                summary: string;
                references: number;
                points?: string[] | undefined;
            } | {
                type: "task";
                status: "todo" | "in-progress" | "done";
                title: string;
                assignee?: string | undefined;
                dueDate?: string | undefined;
            } | {
                type: "reference";
                title: string;
                source: string;
                location: string;
            } | {
                type: "image";
                title: string;
                url: string;
            } | {
                type: "web";
                title: string;
                url: string;
                description?: string | undefined;
            };
        }[] | undefined;
        edges?: {
            source: string;
            id: string;
            target: string;
            label?: string | null | undefined;
        }[] | undefined;
        removedNodeIds?: string[] | undefined;
        removedEdgeIds?: string[] | undefined;
    };
}, {
    type: "graph/diff";
    conversationId: string;
    payload: {
        nodes?: {
            type: "note" | "document" | "task" | "reference" | "image" | "web";
            id: string;
            position: {
                x: number;
                y: number;
            };
            data: {
                type: "note";
                title: string;
                content: string;
                status?: string | undefined;
                subtitle?: string | undefined;
                bullets?: string[] | undefined;
                variant?: "primary" | "list" | "insight" | "timeline-step" | "timeline-dimension" | "timeline-action" | undefined;
                footerText?: string | undefined;
                category?: string | undefined;
                subCategory?: string | undefined;
                meta?: Record<string, unknown> | undefined;
            } | {
                type: "document";
                title: string;
                summary: string;
                references: number;
                points?: string[] | undefined;
            } | {
                type: "task";
                status: "todo" | "in-progress" | "done";
                title: string;
                assignee?: string | undefined;
                dueDate?: string | undefined;
            } | {
                type: "reference";
                title: string;
                source: string;
                location: string;
            } | {
                type: "image";
                title: string;
                url: string;
            } | {
                type: "web";
                title: string;
                url: string;
                description?: string | undefined;
            };
        }[] | undefined;
        edges?: {
            source: string;
            id: string;
            target: string;
            label?: string | null | undefined;
        }[] | undefined;
        removedNodeIds?: string[] | undefined;
        removedEdgeIds?: string[] | undefined;
    };
}>, z.ZodObject<{
    type: z.ZodLiteral<"status">;
    conversationId: z.ZodString;
    status: z.ZodEnum<["idle", "running", "failed", "completed"]>;
    message: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    type: "status";
    status: "idle" | "running" | "failed" | "completed";
    conversationId: string;
    message?: string | undefined;
}, {
    type: "status";
    status: "idle" | "running" | "failed" | "completed";
    conversationId: string;
    message?: string | undefined;
}>]>;
export declare const conversationMetadataSchema: z.ZodObject<{
    id: z.ZodString;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
    status: z.ZodEnum<["idle", "running", "failed", "completed"]>;
    latestQuestion: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    status: "idle" | "running" | "failed" | "completed";
    id: string;
    createdAt: Date;
    updatedAt: Date;
    latestQuestion?: string | undefined;
}, {
    status: "idle" | "running" | "failed" | "completed";
    id: string;
    createdAt: Date;
    updatedAt: Date;
    latestQuestion?: string | undefined;
}>;
export declare const knowledgeEvidenceSchema: z.ZodObject<{
    docId: z.ZodString;
    snippet: z.ZodString;
    score: z.ZodNumber;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    score: number;
    docId: string;
    snippet: string;
    metadata?: Record<string, unknown> | undefined;
}, {
    score: number;
    docId: string;
    snippet: string;
    metadata?: Record<string, unknown> | undefined;
}>;
export type ConversationStatus = z.infer<typeof conversationStatusSchema>;
export type ConversationEvent = z.infer<typeof conversationEventSchema>;
export type ConversationMetadata = z.infer<typeof conversationMetadataSchema>;
export type KnowledgeEvidence = z.infer<typeof knowledgeEvidenceSchema>;
