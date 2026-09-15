/**
 * OpenTelemetry SDK bootstrap (Wave 3 Agent C).
 *
 * Initialises Node SDK with OTLP/HTTP trace exporter + auto-instrumentations
 * BEFORE Apollo / Express imports run, so HTTP / GraphQL / pg / fetch
 * spans are picked up automatically.
 *
 * Behaviour:
 *   - OTEL_ENABLED=false (default): no SDK is loaded; getTracer() returns a
 *     no-op tracer from the API package (zero perf cost — every span method
 *     short-circuits when no provider is registered). Existing stdout-only
 *     telemetry continues unchanged.
 *   - OTEL_ENABLED=true: NodeSDK starts with BatchSpanProcessor pushing to
 *     OTEL_EXPORTER_OTLP_ENDPOINT (default http://localhost:4318) and registers
 *     SIGTERM/SIGINT shutdown hooks that flush pending spans before exit.
 *
 * Co-exists with LangSmith tracing: LangSmith uses its own callback-based
 * exporter (LANGSMITH_TRACING env), so both can run in parallel — they
 * observe the same call stack but emit to separate backends.
 */

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { trace, metrics, type Tracer, type Meter } from '@opentelemetry/api'

let started = false
let sdkRef: { shutdown: () => Promise<void> } | null = null

function readPackageVersion(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url))
    // dist/infrastructure/telemetry/otel-init.js → ../../../package.json
    const pkgPath = resolve(here, '../../../package.json')
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version?: string }
    return pkg.version ?? '0.0.0'
  } catch {
    return '0.0.0'
  }
}

export async function initOtel(): Promise<void> {
  if (started) return
  if (process.env.OTEL_ENABLED !== 'true') return
  started = true

  // Lazy import — when OTEL_ENABLED=false we never pull these deps into memory.
  const { NodeSDK } = await import('@opentelemetry/sdk-node')
  const { OTLPTraceExporter } = await import('@opentelemetry/exporter-trace-otlp-http')
  const { getNodeAutoInstrumentations } = await import('@opentelemetry/auto-instrumentations-node')
  const { Resource } = await import('@opentelemetry/resources')
  const { SemanticResourceAttributes } = await import('@opentelemetry/semantic-conventions')

  const serviceName = process.env.OTEL_SERVICE_NAME ?? 'starlink-server'
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4318'
  const traceUrl = endpoint.endsWith('/v1/traces') ? endpoint : `${endpoint.replace(/\/$/, '')}/v1/traces`

  const resource = new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: serviceName,
    [SemanticResourceAttributes.SERVICE_VERSION]: readPackageVersion(),
    [SemanticResourceAttributes.SERVICE_NAMESPACE]: 'starlink'
  })

  // P11.18 · also wire OTel metrics (sdk-metrics + OTLP HTTP exporter).
  // Auto-disabled when OTEL_METRICS_ENABLED=false. Metric URL defaults
  // to <endpoint>/v1/metrics, parallel to traces.
  const metricsEnabled = process.env.OTEL_METRICS_ENABLED !== 'false'
  let metricReader: import('@opentelemetry/sdk-metrics').PeriodicExportingMetricReader | undefined
  if (metricsEnabled) {
    const { PeriodicExportingMetricReader } = await import('@opentelemetry/sdk-metrics')
    const { OTLPMetricExporter } = await import('@opentelemetry/exporter-metrics-otlp-http')
    const metricsUrl = endpoint.endsWith('/v1/metrics')
      ? endpoint
      : `${endpoint.replace(/\/$/, '')}/v1/metrics`
    metricReader = new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({ url: metricsUrl }),
      // Push every 15s — Prometheus scrape interval default is 15s, so
      // this is a sensible parity. OTLP collectors handle bursts fine.
      exportIntervalMillis: Number(process.env.OTEL_METRICS_EXPORT_INTERVAL_MS) || 15_000
    })
  }

  // sdk-node bundles its own internal MetricReader type; the
  // PeriodicExportingMetricReader from sdk-metrics 1.x is structurally
  // compatible at runtime but TS sees private fields differently.
  // Cast through unknown — verified at runtime.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sdkConfig: any = {
    resource,
    traceExporter: new OTLPTraceExporter({ url: traceUrl }),
    instrumentations: [
      getNodeAutoInstrumentations({
        // pg / http / express / graphql come for free; opt out of fs noise.
        '@opentelemetry/instrumentation-fs': { enabled: false }
      })
    ]
  }
  if (metricReader) {
    sdkConfig.metricReader = metricReader
  }
  const sdk = new NodeSDK(sdkConfig)

  sdk.start()
  sdkRef = sdk

  // Register observable gauges for agent SLO + error aggregator AFTER
  // the SDK starts (so MeterProvider is wired). These bridge the
  // existing in-memory snapshots → OTel metrics so users with an OTel
  // collector get the same data exposed at /metrics, but pushed.
  if (metricsEnabled) {
    void registerObservableMetrics()
  }

  const shutdown = async (signal: string) => {
    try {
      await sdk.shutdown()
      // eslint-disable-next-line no-console
      console.log(`[otel] flushed spans on ${signal}`)
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[otel] shutdown failed', err)
    }
  }
  process.once('SIGTERM', () => void shutdown('SIGTERM'))
  process.once('SIGINT', () => void shutdown('SIGINT'))

  // eslint-disable-next-line no-console
  console.log(`[otel] enabled · service=${serviceName} → ${traceUrl}`)
}

/**
 * Returns a tracer for the given module. Always safe to call: when OTel is
 * disabled, the API package returns a no-op tracer whose spans are essentially
 * free (a couple of pointer comparisons per call).
 */
export function getTracer(name: string): Tracer {
  return trace.getTracer(name)
}

/**
 * Returns a meter for the given module. Mirror of `getTracer`. When OTel is
 * disabled (or metrics disabled), returns a no-op meter — observable callbacks
 * are still registered but never invoked.
 */
export function getMeter(name: string): Meter {
  return metrics.getMeter(name)
}

/**
 * Bridge: register observable callbacks that read in-memory SLO + error
 * snapshots on each metric collection cycle. Only called when
 * OTEL_METRICS_ENABLED. Equivalent gauges to `/metrics` Prom export
 * but pushed via OTLP — operators can pick the protocol.
 */
async function registerObservableMetrics(): Promise<void> {
  try {
    const meter = metrics.getMeter('starlink-agent-slo')
    const { getAllAgentSloSnapshots } = await import('../observability/agent-slo-tracker.js')
    const { getErrorSummary } = await import('../observability/error-aggregator.js')
    const { getPoolErrorCount } = await import('../db/pool.js')

    const invocations = meter.createObservableCounter('starlink.agent.invocations.total', {
      description: 'Total agent invocations (lifetime)'
    })
    const errors = meter.createObservableCounter('starlink.agent.errors.total', {
      description: 'Total agent invocations that ended in error (lifetime)'
    })
    const fallbacks = meter.createObservableCounter('starlink.agent.fallbacks.total', {
      description: 'Total agent invocations that hit fallback (lifetime)'
    })
    const p50 = meter.createObservableGauge('starlink.agent.latency.p50_ms', {
      description: 'p50 latency over last N invocations',
      unit: 'ms'
    })
    const p95 = meter.createObservableGauge('starlink.agent.latency.p95_ms', {
      description: 'p95 latency over last N invocations',
      unit: 'ms'
    })
    const errorRate = meter.createObservableGauge('starlink.agent.error_rate', {
      description: 'Error fraction over last N invocations'
    })
    const degraded = meter.createObservableGauge('starlink.agent.degraded', {
      description: '1 when error rate ≥ AGENT_SLO_DEGRADED_THRESHOLD'
    })
    const errFingerprints = meter.createObservableGauge('starlink.error.fingerprints', {
      description: 'Distinct error fingerprints in memory'
    })
    const errEvents = meter.createObservableCounter('starlink.error.events.total', {
      description: 'Sum of WARN+ERROR event counts across fingerprints'
    })
    const poolErrors = meter.createObservableCounter('starlink.pool.errors.total', {
      description: 'PG pool-level errors observed since boot'
    })

    meter.addBatchObservableCallback(
      (observer) => {
        try {
          for (const a of getAllAgentSloSnapshots()) {
            const attrs = { agent_id: a.agentId }
            observer.observe(invocations, a.totals.invocations, attrs)
            observer.observe(errors, a.totals.errors, attrs)
            observer.observe(fallbacks, a.totals.fallbacks, attrs)
            observer.observe(p50, a.latencyP50Ms, attrs)
            observer.observe(p95, a.latencyP95Ms, attrs)
            observer.observe(errorRate, a.errorRate, attrs)
            observer.observe(degraded, a.degraded ? 1 : 0, attrs)
          }
          const sum = getErrorSummary(1)
          observer.observe(errFingerprints, sum.totalFingerprints)
          observer.observe(errEvents, sum.totalEvents)
          observer.observe(poolErrors, getPoolErrorCount())
        } catch {
          // Observable callbacks must never throw — would crash the
          // metric reader's collection cycle.
        }
      },
      [invocations, errors, fallbacks, p50, p95, errorRate, degraded, errFingerprints, errEvents, poolErrors]
    )
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[otel] metrics bridge registration failed:', err instanceof Error ? err.message : String(err))
  }
}

export function isOtelEnabled(): boolean {
  return started
}

/** Test-only — flush + shutdown the SDK. */
export async function shutdownOtel(): Promise<void> {
  if (sdkRef) {
    await sdkRef.shutdown()
    sdkRef = null
    started = false
  }
}
