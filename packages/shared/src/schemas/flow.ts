import { z } from 'zod'
import { portTypeSchema } from './tool.js'

export const flowNodePortSchema = z.object({
  name: z.string(),
  type: portTypeSchema,
  description: z.string(),
  required: z.boolean().optional(),
})

export const flowNodeTypeSchema = z.enum(['agent', 'tool', 'control', 'input', 'output'])

export const flowNodeSchema = z.object({
  id: z.string(),
  toolName: z.string(),
  type: flowNodeTypeSchema,
  label: z.string(),
  position: z.object({ x: z.number(), y: z.number() }),
  config: z.record(z.unknown()),
  inputPorts: z.array(flowNodePortSchema),
  outputPorts: z.array(flowNodePortSchema),
})

export const flowEdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  sourcePort: z.string(),
  target: z.string(),
  targetPort: z.string(),
})

export const flowConfigSchema = z.object({
  maxExecutionTime: z.number().optional(),
  enableCache: z.boolean().optional(),
  defaultModel: z.string().optional(),
})

export const flowDefinitionSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  nodes: z.array(flowNodeSchema),
  edges: z.array(flowEdgeSchema),
  config: flowConfigSchema,
})

export const inputMappingSchema = z.object({
  sourceNodeId: z.string(),
  sourcePort: z.string(),
  targetPort: z.string(),
})

export const executionStepSchema = z.object({
  nodeId: z.string(),
  toolName: z.string(),
  inputs: z.array(inputMappingSchema),
  config: z.record(z.unknown()),
})

export const executionPlanSchema = z.object({
  steps: z.array(executionStepSchema),
  parallelGroups: z.array(z.array(z.string())),
})
