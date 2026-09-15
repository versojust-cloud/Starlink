/**
 * Tool Registry Type Definitions
 * Foundation types for the ComfyUI-style Tool system.
 */

// ── Category ──────────────────────────────────────────────

export type ToolCategory =
  | 'data_source'
  | 'llm_agent'
  | 'analysis'
  | 'transform'
  | 'output'
  | 'control_flow'
  | 'utility'

// ── Credential ────────────────────────────────────────────

export interface CredentialField {
  name: string
  label: string
  type: 'string' | 'password' | 'select'
  required: boolean
  placeholder?: string
  options?: string[]
}

// ── Port (node input/output connection point) ─────────────

export type PortType = 'string' | 'number' | 'boolean' | 'object' | 'array' | 'any'

export interface PortDefinition {
  name: string
  type: PortType
  description: string
  required?: boolean
  default?: unknown
}

// ── Tool Definition ───────────────────────────────────────

export interface ToolIdentity {
  name: string
  provider: 'builtin' | 'plugin' | 'custom'
  version: string
}

export interface ToolDisplay {
  label: string
  description: string
  icon: string
  category: ToolCategory
  color: string
}

export interface ToolInputSchema {
  type: 'object'
  properties: Record<
    string,
    {
      type: string
      description: string
      required?: boolean
      default?: unknown
      enum?: unknown[]
    }
  >
  required: string[]
}

export interface ToolOutputSchema {
  type: string
  properties: Record<string, unknown>
}

export interface ToolCredentials {
  type: 'api_key' | 'oauth2' | 'custom'
  fields: CredentialField[]
}

export interface ToolRuntimeConfig {
  timeout: number
  retries: number
  cacheable: boolean
  streamable: boolean
  parallel: boolean
}

export interface ToolDefinition {
  identity: ToolIdentity
  display: ToolDisplay
  inputSchema: ToolInputSchema
  outputSchema: ToolOutputSchema
  inputPorts: PortDefinition[]
  outputPorts: PortDefinition[]
  credentials?: ToolCredentials
  runtime: ToolRuntimeConfig
}

// ── Tool Context (passed to execute) ──────────────────────

export interface ToolContext {
  workspaceId: string
  userId: string
  executionId: string
  state: Record<string, unknown>
  credentials: Record<string, string>
  abortSignal: AbortSignal
  streamWriter: (chunk: unknown) => void
}

// ── Tool Messages (yielded by execute) ────────────────────

export type ToolMessage =
  | { type: 'text'; content: string }
  | { type: 'json'; data: Record<string, unknown> }
  | { type: 'stream'; chunk: string }
  | { type: 'file'; path: string; mime: string }
  | { type: 'error'; error: string; retryable: boolean }
  | { type: 'progress'; percent: number; message: string }

// ── Validation ────────────────────────────────────────────

export interface ValidationError {
  path: string
  message: string
}

export interface ValidationResult {
  valid: boolean
  errors: ValidationError[]
}

// ── Dynamic Params ────────────────────────────────────────

export interface DynamicParam {
  name: string
  type: string
  options?: Array<{ label: string; value: string }>
}
