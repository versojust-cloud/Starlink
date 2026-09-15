/**
 * Agent Profile Schema — Zod contract for `agent.yaml` files.
 *
 * Layer 1 (Capability) + Layer 2 (Agent config) + Layer 3 (Tool allow-list) all
 * live in a single file per agent.
 *
 * This file only defines the YAML shape. Mapping profile → AgentDescriptor lives
 * in ./profile-loader.ts. Tool name resolution lives in ./tool-resolver.ts.
 */

import { z } from 'zod'
import { BMC_DIMENSIONS } from './types.js'

// ============== Capability sub-schemas ==============

const generateCapabilitySchema = z.object({
  kind: z.literal('generate'),
  dimension: z.enum(BMC_DIMENSIONS as unknown as [string, ...string[]])
})

const critiqueCapabilitySchema = z.object({
  kind: z.literal('critique'),
  mode: z.enum([
    'devils-advocate',
    'evidence-checker',
    'conflict-detector',
    'logical-auditor',
    'gap-hunter'
  ])
})

const adviseCapabilitySchema = z.object({
  kind: z.literal('advise'),
  framework: z.enum(['swot', 'blue-ocean', 'jtbd'])
})

const reflectCapabilitySchema = z.object({
  kind: z.literal('reflect'),
  scope: z.enum(['single_round', 'multi_round_evolution'])
})

const refineCapabilitySchema = z.object({
  kind: z.literal('refine'),
  strategy: z.enum(['minimal_change', 'full_rewrite'])
})

export const CapabilityYamlSchema = z.discriminatedUnion('kind', [
  generateCapabilitySchema,
  critiqueCapabilitySchema,
  adviseCapabilitySchema,
  reflectCapabilitySchema,
  refineCapabilitySchema
])

// ============== Few-shot example shape ==============

const FewShotExampleSchema = z.object({
  input: z.string(),
  /** Relative path to a fixture under agents/<name>/fixtures/. */
  output_ref: z.string().optional(),
  /** Inline expected output. Mutually exclusive with output_ref at runtime. */
  output: z.unknown().optional()
})

// ============== Root AgentProfile schema ==============

export const AgentProfileSchema = z.object({
  version: z.literal(1),

  // ---- Identity ----
  id: z
    .string()
    .regex(/^[a-z][a-z0-9-]*$/, 'id must be kebab-case starting with a lowercase letter'),
  name: z.string().min(1),
  role: z.enum(['generator', 'advisor', 'meta']).default('generator'),

  // ---- Runtime / LLM config ----
  language: z.enum(['zh-CN', 'en-US']).default('zh-CN'),
  model: z.string().default('gpt-4o-mini'),
  temperature: z.number().min(0).max(2).default(0.3),
  max_tokens: z.number().int().positive().default(2000),
  timeout_ms: z.number().int().positive().default(30_000),
  retries: z.number().int().min(0).max(5).default(1),
  cacheable: z.boolean().default(false),

  // ---- Layer 3 binding hints ----
  tools: z.array(z.string()).default([]),
  knowledge_bases: z.array(z.string()).default([]),

  // ---- Layer 1 (semantic capabilities, read by Supervisor) ----
  capabilities: z.array(CapabilityYamlSchema).min(1),

  // ---- Behaviour ----
  critic_policy: z.enum(['off', 'lenient', 'strict']).default('strict'),

  // ---- Layer 2 prompt ----
  system_prompt: z.string().min(20, 'system_prompt must be at least 20 characters'),
  few_shot: z.array(FewShotExampleSchema).default([])
})

export type AgentProfile = z.infer<typeof AgentProfileSchema>

/** Parse result helper — matches Zod safeParse but narrows the ok branch. */
export type ParseProfileResult =
  | { ok: true; profile: AgentProfile }
  | { ok: false; errors: string[] }

export function parseAgentProfile(raw: unknown): ParseProfileResult {
  const result = AgentProfileSchema.safeParse(raw)
  if (result.success) {
    return { ok: true, profile: result.data }
  }
  const errors = result.error.issues.map(
    (i) => `  · ${i.path.join('.') || '(root)'}: ${i.message}`
  )
  return { ok: false, errors }
}
