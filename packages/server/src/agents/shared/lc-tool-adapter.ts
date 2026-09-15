/**
 * BaseTool → LangChain StructuredTool adapter.
 *
 * Starlink's BaseTool uses JSON Schema + AsyncGenerator<ToolMessage>.
 * LangChain's `tool()` factory wants Zod schema + async function returning
 * a string. We bridge:
 *   - JSON Schema → Zod (subset: string/number/boolean/array/object/enum)
 *   - drive AsyncGenerator to completion, collect final json payload
 *
 * Phase B v1 — supports basic types + enums. Phase 4.x can add nested
 * object schemas + array element validation if needed.
 */

import { tool as lcTool } from '@langchain/core/tools'
import type { StructuredToolInterface } from '@langchain/core/tools'
import { z } from 'zod'
import type {
  BaseTool,
  ToolContext,
  ToolMessage,
  ToolDefinition
} from '@starlink/shared'
import { getHandoffLogger } from '../../infrastructure/handoff-log/index.js'

type FieldSchema = ToolDefinition['inputSchema']['properties'][string]

function fieldToZod(field: FieldSchema): z.ZodTypeAny {
  let z_: z.ZodTypeAny
  if (field.enum) {
    const values = field.enum as Array<string | number>
    z_ = z.enum(values.map(String) as [string, ...string[]])
  } else {
    switch (field.type) {
      case 'string':
        z_ = z.string()
        break
      case 'number':
        z_ = z.number()
        break
      case 'boolean':
        z_ = z.boolean()
        break
      case 'array':
        z_ = z.array(z.any())
        break
      case 'object':
        z_ = z.record(z.any())
        break
      default:
        z_ = z.any()
    }
  }
  if (field.description) z_ = z_.describe(field.description)
  if (field.default !== undefined && z_ instanceof z.ZodType) {
    z_ = z_.default(field.default as never)
  }
  return z_
}

function jsonSchemaToZod(
  schema: ToolDefinition['inputSchema']
): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const shape: Record<string, z.ZodTypeAny> = {}
  for (const [key, field] of Object.entries(schema.properties)) {
    let z_ = fieldToZod(field)
    if (!schema.required.includes(key)) {
      z_ = z_.optional()
    }
    shape[key] = z_
  }
  return z.object(shape)
}

export interface AdapterOptions {
  /**
   * Per-call ToolContext factory. Receives the LangChain runConfig
   * (forwarded from invokeRegisteredAgent) so the factory can pull
   * workspaceId / userId / executionId out of `configurable` and
   * hand the tool a real context instead of an empty stub.
   *
   * P11.18 fix: previously typed `() => ToolContext` and the only
   * implementation passed `{}` → every tool saw _context.workspaceId
   * === '' and KB-related searches hit kbId='default' empty path.
   */
  contextFactory: (runConfig: RunConfigShape) => ToolContext
  /**
   * B4 hardening (2026-04-29): when set, every tool invocation emits a
   * `action-invocation` handoff before the call and `action-result` after,
   * tagged with this agent's id as `from`. Lets HandoffLogger downstream
   * (benchmark metrics, paper figures) see "market-agent → web-search →
   * result" timelines instead of just "market-agent → synthesizer". The
   * traceId comes from the LangGraph runConfig's `configurable.thread_id`
   * which we plumb at invokeRegisteredAgent time.
   */
  ownerAgentId?: string
}

export interface RunConfigShape {
  configurable?: {
    thread_id?: string
    workspaceId?: string
    userId?: string
    executionId?: string
    agent_id?: string
  }
}

export function toLangchainTool(
  baseTool: BaseTool,
  opts: AdapterOptions
): StructuredToolInterface {
  const def = baseTool.definition
  const toolName = def.identity.name
  // OpenAI / DeepSeek tool-name validation: `^[a-zA-Z0-9_-]+$`. Our tool
  // identifiers use dot-namespacing (e.g. `revenue-streams.propose_pricing_models`),
  // which the API rejects with HTTP 400 before any inference runs. Sanitize
  // for the wire only — keep the original name in handoff logs so the
  // observability story stays unchanged.
  const apiToolName = toolName.replace(/\./g, '_')
  const ownerAgentId = opts.ownerAgentId ?? '_unknown_agent'

  return lcTool(
    async (input: Record<string, unknown>, runConfig?: RunConfigShape) => {
      const traceId = runConfig?.configurable?.thread_id
      const startedAt = Date.now()
      // Emit invocation BEFORE running (so the timeline shows the call
      // even if the tool throws or hangs).
      if (traceId) {
        try {
          getHandoffLogger(traceId).record({
            from: ownerAgentId,
            to: toolName,
            kind: 'action-invocation',
            payload: {
              toolName,
              dimension: 'unknown',
              args: input
            },
            meta: { round: 0, threadId: traceId, traceId }
          })
        } catch {
          // Handoff logging must never break tool execution.
        }
      }

      let result: unknown = null
      let lastError: string | null = null
      try {
        for await (const msg of baseTool.execute(input, opts.contextFactory(runConfig ?? {}))) {
          const m = msg as ToolMessage
          if (m.type === 'json') {
            result = m.data
          } else if (m.type === 'error') {
            lastError = m.error
          }
        }
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err)
      }
      // P11.18 · per-tool SLO. This adapter is the chokepoint for
      // EVERY dimension-action sub-agent invoked from inside a BMC
      // ReAct subgraph. Recording here gives operators per-tool
      // latency / error rate via /health/agents + /metrics under
      // the namespace `tool:<name>` (consistent with engine/agent-executor
      // and engine/graph-executor instrumentation).
      try {
        const { recordAgentInvocation } = await import(
          '../../infrastructure/observability/agent-slo-tracker.js'
        )
        recordAgentInvocation(
          `tool:${toolName}`,
          Date.now() - startedAt,
          lastError ? 'error' : 'success'
        )
      } catch {
        // SLO must never break tool execution.
      }

      // Emit result AFTER. Failure path also emits — the boolean `ok`
      // discriminates so downstream metrics can distinguish completed
      // vs failed tool calls without parsing JSON content.
      if (traceId) {
        try {
          const durationMs = Date.now() - startedAt
          const ok = lastError === null && result !== null
          const resultSummary = ok
            ? typeof result === 'string'
              ? result.slice(0, 120)
              : JSON.stringify(result).slice(0, 120)
            : '(failed)'
          getHandoffLogger(traceId).record({
            from: toolName,
            to: ownerAgentId,
            kind: 'action-result',
            payload: {
              toolName,
              ok,
              resultSummary,
              error: lastError ?? undefined,
              durationMs
            },
            meta: { round: 0, threadId: traceId, traceId }
          })
        } catch {
          // Same as above: never let the handoff log break execution.
        }
      }

      if (lastError && result === null) {
        return JSON.stringify({ ok: false, error: lastError })
      }
      return JSON.stringify(result ?? {})
    },
    {
      name: apiToolName,
      description: def.display.description,
      schema: jsonSchemaToZod(def.inputSchema)
    }
  ) as StructuredToolInterface
}

export function toLangchainTools(
  baseTools: BaseTool[],
  opts: AdapterOptions
): StructuredToolInterface[] {
  return baseTools.map((t) => toLangchainTool(t, opts))
}

/**
 * Build a ToolContext from a LangChain runConfig.configurable bag.
 *
 * The configurable object is populated by invokeRegisteredAgent /
 * runCritic in business-langgraph.ts: { thread_id, agent_id,
 * workspaceId, userId, executionId, ... }. This is the only path
 * tool sub-agents (called via lcTool wrapper) see real workspace
 * scope — without it, KB / memory / web-search tools fall back
 * to defaults and either fail or pollute logs with empty
 * workflowId fields.
 */
export function buildToolContextFromConfigurable(
  cfg: Record<string, unknown>,
  signal: AbortSignal
): ToolContext {
  return {
    workspaceId: (cfg['workspaceId'] as string) ?? '',
    userId: (cfg['userId'] as string) ?? '',
    executionId: (cfg['executionId'] as string) ?? (cfg['thread_id'] as string) ?? '',
    state: (cfg['state'] as Record<string, unknown>) ?? {},
    credentials: (cfg['credentials'] as Record<string, string>) ?? {},
    abortSignal: signal,
    streamWriter: () => undefined
  }
}
