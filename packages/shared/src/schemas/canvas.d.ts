import { z } from 'zod';
export declare const canvasNodeDataSchema: z.ZodDiscriminatedUnion<"type", [z.ZodObject<{
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
export declare const canvasNodeSchema: z.ZodObject<{
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
}>;
export declare const canvasEdgeSchema: z.ZodObject<{
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
}>;
export declare const canvasGraphSchema: z.ZodObject<{
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
export type CanvasNodeData = z.infer<typeof canvasNodeDataSchema>;
export type CanvasNode = z.infer<typeof canvasNodeSchema>;
export type CanvasEdge = z.infer<typeof canvasEdgeSchema>;
export type CanvasGraph = z.infer<typeof canvasGraphSchema>;
