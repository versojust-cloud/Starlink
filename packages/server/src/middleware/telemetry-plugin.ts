/**
 * Apollo Server 4 telemetry plugin.
 *
 * Logs structured JSON for:
 *   - slow operations (> SLOW_QUERY_MS, default 5000ms)
 *   - operations with errors (always logged)
 *   - aggregate error count (10s rolling window) — emitted alongside slow queries
 *
 * Wave 3 Agent C: also opens a `graphql.operation` OTel span per request
 * with operation attributes, error events, and a `slow_query` span event
 * when ms > SLOW_QUERY_MS. The stdout JSON path is preserved as a fallback
 * for environments without an OTel collector.
 *
 * When OTEL_ENABLED=false, `getTracer()` returns a no-op tracer — the span
 * methods short-circuit, behaviour matches pre-Wave-3.
 *
 * Format example (stdout fallback):
 *   {"ts":"2026-04-26T...","kind":"slow_query","op":"workspaces","ms":6321,"userId":"u1"}
 */

import type { ApolloServerPlugin } from '@apollo/server'
import { SpanStatusCode } from '@opentelemetry/api'
import type { GraphQLContext } from '../context/index.js'
import { getTracer } from '../infrastructure/telemetry/otel-init.js'

const SLOW_QUERY_MS = Number(process.env.SLOW_QUERY_MS ?? 5000)

const tracer = getTracer('starlink/graphql')

let errorCount = 0
let errorWindowStart = Date.now()
const ERROR_WINDOW_MS = 10_000

function bumpErrorCounter(): number {
  const now = Date.now()
  if (now - errorWindowStart > ERROR_WINDOW_MS) {
    errorCount = 0
    errorWindowStart = now
  }
  errorCount += 1
  return errorCount
}

function emit(kind: string, fields: Record<string, unknown>): void {
  const line = JSON.stringify({ ts: new Date().toISOString(), kind, ...fields })
  if (kind === 'graphql_error') console.error(line)
  else console.log(line)
}

export function telemetryPlugin(): ApolloServerPlugin<GraphQLContext> {
  return {
    async requestDidStart(requestContext) {
      const start = Date.now()
      const operationName = requestContext.request.operationName ?? 'anonymous'
      // Phase: HTTP middleware has already opened a span via auto-instrumentation;
      // this `graphql.operation` span nests under that automatically.
      const span = tracer.startSpan('graphql.operation', {
        attributes: {
          'graphql.operation.name': operationName
        }
      })

      return {
        async didResolveOperation(ctx) {
          if (ctx.operation?.operation) {
            span.setAttribute('graphql.operation.type', ctx.operation.operation)
          }
        },
        async didEncounterErrors({ errors }) {
          const userId = requestContext.contextValue?.userId
          for (const err of errors) {
            const total = bumpErrorCounter()
            emit('graphql_error', {
              op: requestContext.request.operationName,
              userId,
              message: err.message,
              code: err.extensions?.code,
              path: err.path,
              errorsInWindow: total
            })
            span.recordException(err)
          }
          span.setStatus({ code: SpanStatusCode.ERROR, message: errors[0]?.message })
        },
        async willSendResponse() {
          const ms = Date.now() - start
          const userId = requestContext.contextValue?.userId
          span.setAttribute('graphql.duration_ms', ms)
          if (userId) span.setAttribute('user.id', userId)

          if (ms >= SLOW_QUERY_MS) {
            emit('slow_query', {
              op: requestContext.request.operationName,
              userId,
              ms,
              thresholdMs: SLOW_QUERY_MS
            })
            span.addEvent('slow_query', {
              'graphql.duration_ms': ms,
              'graphql.threshold_ms': SLOW_QUERY_MS
            })
          }
          span.end()
        }
      }
    }
  }
}
