/**
 * Phase 3.3 · Per-dimension action base.
 */

import {
  BaseTool,
  type ToolDefinition,
  type ToolContext,
  type ToolMessage
} from '@starlink/shared'

export type BmcDimensionId =
  | 'customer-segments'
  | 'channels'
  | 'value-propositions'
  | 'customer-relationships'
  | 'revenue-streams'
  | 'key-resources'
  | 'key-activities'
  | 'key-partnerships'
  | 'cost-structure'

export interface DimensionActionConfig {
  dimension: BmcDimensionId
  actionName: string
  label: string
  description: string
  inputSchema: ToolDefinition['inputSchema']
  outputSchema: ToolDefinition['outputSchema']
  inputPorts: ToolDefinition['inputPorts']
  outputPorts: ToolDefinition['outputPorts']
}

const DIM_COLORS: Record<BmcDimensionId, string> = {
  'customer-segments': '#f59e0b',
  channels: '#f97316',
  'value-propositions': '#10b981',
  'customer-relationships': '#fbbf24',
  'revenue-streams': '#3b82f6',
  'key-resources': '#8b5cf6',
  'key-activities': '#14b8a6',
  'key-partnerships': '#ec4899',
  'cost-structure': '#ef4444'
}

export function buildDimensionDefinition(cfg: DimensionActionConfig): ToolDefinition {
  return {
    identity: {
      name: `${cfg.dimension}.${cfg.actionName.replace(/-/g, '_')}`,
      provider: 'builtin',
      version: '1.0.0'
    },
    display: {
      label: cfg.label,
      description: cfg.description,
      icon: '🧩',
      category: 'analysis',
      color: DIM_COLORS[cfg.dimension] ?? '#999'
    },
    inputSchema: cfg.inputSchema,
    outputSchema: cfg.outputSchema,
    inputPorts: cfg.inputPorts,
    outputPorts: cfg.outputPorts,
    runtime: {
      timeout: 20000,
      retries: 1,
      cacheable: true,
      streamable: false,
      parallel: true
    }
  }
}

export class StubDimensionAction extends BaseTool {
  readonly definition: ToolDefinition
  constructor(cfg: DimensionActionConfig) {
    super()
    this.definition = buildDimensionDefinition(cfg)
  }
  async *execute(
    input: Record<string, unknown>,
    ctx: ToolContext
  ): AsyncGenerator<ToolMessage> {
    yield* stubExecute(this.definition.identity.name, input, ctx)
  }
}

export async function* stubExecute(
  toolName: string,
  input: Record<string, unknown>,
  _ctx: ToolContext
): AsyncGenerator<ToolMessage> {
  yield { type: 'progress', percent: 10, message: `${toolName} (stub) — preparing` }
  yield {
    type: 'json',
    data: {
      _stub: true,
      toolName,
      phase: '3.3 stub',
      receivedInput: input,
      note: 'Real LLM impl to come in Phase 3.4 increments.'
    }
  }
  yield { type: 'progress', percent: 100, message: `${toolName} (stub) — complete` }
}
