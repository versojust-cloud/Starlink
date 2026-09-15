import { z } from 'zod'

export const toolCategorySchema = z.enum([
  'data_source', 'llm_agent', 'analysis', 'transform', 'output', 'control_flow', 'utility',
])

export const portTypeSchema = z.enum(['string', 'number', 'boolean', 'object', 'array', 'any'])

export const portDefinitionSchema = z.object({
  name: z.string(),
  type: portTypeSchema,
  description: z.string(),
  required: z.boolean().optional(),
  default: z.unknown().optional(),
})

export const toolIdentitySchema = z.object({
  name: z.string().min(1),
  provider: z.enum(['builtin', 'plugin', 'custom']),
  version: z.string(),
})

export const toolDisplaySchema = z.object({
  label: z.string(),
  description: z.string(),
  icon: z.string(),
  category: toolCategorySchema,
  color: z.string(),
})

export const toolInputSchemaSchema = z.object({
  type: z.literal('object'),
  properties: z.record(z.object({
    type: z.string(),
    description: z.string(),
    required: z.boolean().optional(),
    default: z.unknown().optional(),
    enum: z.array(z.unknown()).optional(),
  })),
  required: z.array(z.string()),
})

export const toolRuntimeConfigSchema = z.object({
  timeout: z.number(),
  retries: z.number(),
  cacheable: z.boolean(),
  streamable: z.boolean(),
  parallel: z.boolean(),
})

export const toolDefinitionSchema = z.object({
  identity: toolIdentitySchema,
  display: toolDisplaySchema,
  inputSchema: toolInputSchemaSchema,
  outputSchema: z.object({ type: z.string(), properties: z.record(z.unknown()) }),
  inputPorts: z.array(portDefinitionSchema),
  outputPorts: z.array(portDefinitionSchema),
  credentials: z.object({
    type: z.enum(['api_key', 'oauth2', 'custom']),
    fields: z.array(z.object({
      name: z.string(),
      label: z.string(),
      type: z.enum(['string', 'password', 'select']),
      required: z.boolean(),
      placeholder: z.string().optional(),
      options: z.array(z.string()).optional(),
    })),
  }).optional(),
  runtime: toolRuntimeConfigSchema,
})

export const toolMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), content: z.string() }),
  z.object({ type: z.literal('json'), data: z.record(z.unknown()) }),
  z.object({ type: z.literal('stream'), chunk: z.string() }),
  z.object({ type: z.literal('file'), path: z.string(), mime: z.string() }),
  z.object({ type: z.literal('error'), error: z.string(), retryable: z.boolean() }),
  z.object({ type: z.literal('progress'), percent: z.number(), message: z.string() }),
])
