// IMPORTANT: OpenTelemetry must initialise BEFORE any module that should be
// auto-instrumented (express, http, pg, graphql, …). Top-level `await` here
// gates the static imports below — ES module spec guarantees the awaited
// promise settles before sibling import bindings are evaluated.
//
// When OTEL_ENABLED is unset/false, initOtel() is a no-op and the OTel SDK
// packages are never imported (lazy `await import` inside otel-init.ts) — so
// dependency cost only kicks in when telemetry is on.
import { initOtel } from './infrastructure/telemetry/otel-init.js'
await initOtel()

import http from 'node:http'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import { ApolloServer } from '@apollo/server'
import { expressMiddleware } from '@apollo/server/express4'
import { makeExecutableSchema } from '@graphql-tools/schema'
import { WebSocketServer } from 'ws'
import { useServer } from 'graphql-ws/use/ws'
import { typeDefs } from './graphql/type-defs.js'
import { resolvers } from './graphql/resolvers.js'
import { createContext, createWsContext, shutdownContextServices } from './context/index.js'
import { internalRouter } from './routes/internal-task-events.js'
import { kbProxyRouter } from './routes/kb-proxy.js'
import { depthLimitPlugin } from './middleware/depth-limit-plugin.js'
import { rateLimitPlugin } from './middleware/rate-limit-plugin.js'
import { telemetryPlugin } from './middleware/telemetry-plugin.js'
import { pool, ensureExtensions, probeDatabaseHealth } from './infrastructure/db/pool.js'
import { startCheckpointCleanupTimer } from './infrastructure/langgraph/checkpointer.js'
import { startConversationCleanupTimer } from './application/conversation-cleanup.js'
import { installErrorAggregator, getErrorSummary } from './infrastructure/observability/error-aggregator.js'
import {
  getAllAgentSloSnapshots,
  hydrateAgentSloFromDb,
  startAgentSloFlushTimer,
  flushAgentSloToDb,
  startAgentSloRedisSync,
  shutdownAgentSloRedisSync
} from './infrastructure/observability/agent-slo-tracker.js'
import { renderPrometheusMetrics } from './infrastructure/observability/prometheus-export.js'
import { describeEmbeddingConfig } from './services/embedding-service.js'
import { assertProductionConfig, isProduction } from './infrastructure/config-validate.js'

const PORT = Number(process.env.PORT ?? 4000)
const STARTED_AT = Date.now()

// P11.18 · install error aggregator BEFORE any other module emits
// audit events so we don't miss boot-time signals. installErrorAggregator
// is idempotent.
installErrorAggregator()

async function start() {
  // Boot-time production config gate. Fails fast (and crashes the
  // process) in production when any required secret is missing or
  // matches a known placeholder. In dev / test the issues are logged
  // as warnings but boot continues.
  const configIssues = assertProductionConfig()
  if (!isProduction() && configIssues.length > 0) {
    console.warn(
      `[boot] non-production; ${configIssues.length} config issue(s) would fail in production:`
    )
    for (const issue of configIssues) {
      console.warn(`  · ${issue.variable}: ${issue.detail}`)
    }
  }

  // Boot-time PG extension install. pgvector + pgcrypto are required
  // for memory vector search and user-skill encryption. Self-healing
  // CREATE EXTENSION IF NOT EXISTS — fresh databases come up clean.
  // Failure is fatal: if extensions can't be installed, memory + KB
  // will silently fail at query time, which is worse than a boot crash.
  try {
    await ensureExtensions()
    console.log('[boot] PG extensions ready (vector / pgcrypto / uuid-ossp)')
  } catch (err) {
    console.error('[boot] FATAL · ensureExtensions failed:', err)
    throw err
  }

  // Boot-time DB health snapshot — lets operators verify in one log line
  // that SSL is on (in production), pgvector is installed, and the
  // connection actually works.
  const dbHealth = await probeDatabaseHealth()
  if (!dbHealth.connected) {
    console.error('[boot] FATAL · database probe failed:', dbHealth.error)
    throw new Error(`database not reachable: ${dbHealth.error ?? 'unknown'}`)
  }
  console.log(
    `[boot] database connected · ssl=${dbHealth.ssl} · ext={vector:${dbHealth.extensions.vector}, pgcrypto:${dbHealth.extensions.pgcrypto}}`,
  )

  // Boot-time embedding sanity log. Operators need to know at boot whether
  // RAG / memory will use a real embedding endpoint or fall back to the
  // local hash (which yields near-random retrieval quality).
  const embeddingConfig = describeEmbeddingConfig()
  if (embeddingConfig.mode === 'remote') {
    console.log(
      `[boot] embedding=remote · model=${embeddingConfig.model} · base=${embeddingConfig.baseUrl}`
    )
  } else {
    console.warn(`[boot] embedding=LOCAL-HASH (poor quality) · ${embeddingConfig.warning}`)
  }

  const app = express()
  const corsOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:3000').split(',').map((o) => o.trim())
  app.use(cors({ origin: corsOrigins, credentials: false }))
  app.use(helmet())
  app.use(express.json())
  app.use(morgan('dev'))

  // Health endpoints — registered BEFORE GraphQL / auth so load-balancers
  // and orchestrators (Docker / K8s / Fly health checks) can probe without
  // hitting rate limits or auth gates.
  //   /health  — cheap liveness: process is up + event loop responsive.
  //              Always 200 unless the process is dead.
  //   /ready   — readiness: PG reachable. Returns 503 when the DB pool
  //              can't answer SELECT 1 within 2s. Use this for "send
  //              traffic only when DB is ready" gating.
  app.get('/health', (_req, res) => {
    res.status(200).json({
      status: 'ok',
      uptimeSeconds: Math.floor((Date.now() - STARTED_AT) / 1000),
      timestamp: new Date().toISOString()
    })
  })
  app.get('/ready', async (_req, res) => {
    try {
      const probe = pool.query('SELECT 1 AS ok')
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('db-probe-timeout')), 2000)
      )
      await Promise.race([probe, timeout])
      res.status(200).json({ status: 'ready', db: 'ok' })
    } catch (err) {
      res.status(503).json({
        status: 'not-ready',
        db: 'fail',
        error: err instanceof Error ? err.message : String(err)
      })
    }
  })

  // /health/embedding — exposes whether KB / memory vector search is
  // running on a real embedding provider or the deterministic local-hash
  // fallback. Frontend can fetch this on canvas mount and surface a
  // discreet "⚠ 检索质量下降" chip when mode === 'local-hash' so users
  // know their RAG queries aren't returning semantically-relevant chunks.
  app.get('/health/embedding', (_req, res) => {
    const cfg = describeEmbeddingConfig()
    res.status(200).json({
      mode: cfg.mode,
      baseUrl: cfg.baseUrl,
      model: cfg.model,
      warning: cfg.warning,
    })
  })

  // /health/database — exposes connection status, SSL mode, and which
  // PG extensions are installed. Returns 503 if not connected so it
  // can also be used for orchestration probes (k8s readiness etc).
  app.get('/health/database', async (_req, res) => {
    const probe = await probeDatabaseHealth()
    res.status(probe.connected ? 200 : 503).json(probe)
  })

  // P11.18 · /health/errors — Sentry-style top-N error fingerprints.
  // Each fingerprint groups duplicate errors by hash(component + action
  // + error.name + first 3 stack frames). Use ?topN=50 for more.
  app.get('/health/errors', (req, res) => {
    const topN = Math.max(1, Math.min(200, Number(req.query.topN) || 20))
    res.status(200).json(getErrorSummary(topN))
  })

  // P11.18 · /health/agents — per-agent SLO snapshot. Returns latency
  // p50/p95, error rate, fallback rate, plus a degraded boolean when
  // error rate breaches AGENT_SLO_DEGRADED_THRESHOLD (default 30%).
  app.get('/health/agents', async (_req, res) => {
    const snapshots = getAllAgentSloSnapshots()
    const anyDegraded = snapshots.some((s) => s.degraded)
    // P15-fix #6 · surface cell-summarizer retry telemetry alongside
    // the per-agent SLO. Module imported lazily so the route handler
    // doesn't pin the summarizer module at server boot.
    let cellSummarizer: unknown = null
    try {
      const mod = await import('./agents/shared/cell-summarizer.js')
      cellSummarizer = mod.getCellSummarizerSnapshot()
    } catch {
      // never break /health on a missing telemetry hook
    }
    res.status(anyDegraded ? 503 : 200).json({
      degradedCount: snapshots.filter((s) => s.degraded).length,
      agents: snapshots,
      cellSummarizer
    })
  })

  // P11.18 · DEV-ONLY: inject synthetic SLO samples for visual testing.
  // Requires NODE_ENV !== 'production'. Pass ?agent=&errors=&total= to
  // populate the in-memory ring with a controlled mix. Lets us screenshot
  // the degraded-red chip path without crashing real agents.
  if (process.env.NODE_ENV !== 'production') {
    app.post('/internal/dev/inject-slo', async (req, res) => {
      const agentId = String(req.query.agent ?? 'demo-agent')
      const total = Math.max(1, Math.min(200, Number(req.query.total) || 12))
      // Important: don't use `|| 6` — that treats explicit `errors=0` as
      // falsy. Use ?? to honour 0 as "inject pure successes for the
      // healthy-state demo".
      const errorsRaw = req.query.errors == null ? 6 : Number(req.query.errors)
      const errors = Math.max(0, Math.min(total, errorsRaw))
      const { recordAgentInvocation } = await import(
        './infrastructure/observability/agent-slo-tracker.js'
      )
      for (let i = 0; i < total; i++) {
        recordAgentInvocation(
          agentId,
          50 + Math.floor(Math.random() * 100),
          i < errors ? 'error' : 'success'
        )
      }
      res.json({ injected: total, errors, agentId })
    })
  }

  // P11.18 · /metrics — Prometheus text-format export. Scrape-friendly
  // for any Prom-based stack (Grafana, VictoriaMetrics, OTel-collector
  // prometheus receiver). Returns content-type text/plain; version=0.0.4
  // per Prometheus exposition spec.
  app.get('/metrics', (_req, res) => {
    res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
    res.status(200).send(renderPrometheusMetrics())
  })

  app.use('/internal', internalRouter)
  app.use('/kb', kbProxyRouter)

  const schema = makeExecutableSchema({ typeDefs, resolvers })

  const maxDepth = Number(process.env.GRAPHQL_MAX_DEPTH ?? 10)
  const apollo = new ApolloServer({
    schema,
    plugins: [depthLimitPlugin(maxDepth), rateLimitPlugin(), telemetryPlugin()]
  })
  await apollo.start()

  app.use('/graphql', expressMiddleware(apollo, { context: createContext }))

  const server = http.createServer(app)

  const wsServer = new WebSocketServer({ server, path: '/graphql' })
  useServer(
    {
      schema,
      context: async (ctx) => createWsContext(ctx.connectionParams ?? undefined)
    },
    wsServer
  )

  await new Promise<void>((resolve) => {
    server.listen(PORT, () => {
      console.log(`Branching Chat GraphQL server running on http://localhost:${PORT}/graphql`)
      resolve()
    })
  })

  // P11.18 · arm periodic LangGraph checkpoint cleanup. Default every
  // 6h, drops thread state older than 7d. .unref()'d so node exits
  // cleanly on shutdown. Override via LANGGRAPH_CHECKPOINT_TTL_MS /
  // LANGGRAPH_CHECKPOINT_CLEANUP_INTERVAL_MS env.
  startCheckpointCleanupTimer()
  // P11.18 · arm conversation_messages TTL cleanup. Default every 6h,
  // drops messages older than 90d. Override via CONVERSATION_MESSAGE_TTL_MS /
  // CONVERSATION_CLEANUP_INTERVAL_MS env. Disable via CONVERSATION_CLEANUP_ENABLED=false.
  startConversationCleanupTimer()

  // P11.18 · agent SLO persistence. Hydrate cumulative totals from PG so
  // restart doesn't lose lifetime counters; arm periodic flush every 5min.
  // Window stats (p50/p95) are intentionally NOT persisted — "recent" by
  // definition rebuilds from new invocations.
  void hydrateAgentSloFromDb()
  startAgentSloFlushTimer()
  // P11.18 · F4 · cross-gateway SLO sync via Redis pub/sub.
  // Disabled by default; enable with REDIS_URL + AGENT_SLO_REDIS_ENABLED=true.
  void startAgentSloRedisSync()

  /**
   * P11.18 · graceful shutdown drain.
   *
   * On SIGTERM / SIGINT we wait up to SHUTDOWN_DRAIN_TIMEOUT_MS
   * (default 30s) for in-flight LangGraph streams to finish before
   * closing the server. The drain signal is the in-memory handoff
   * logger count: each active business-graph trace owns a logger
   * that's released when streamConversation hits the finally block.
   *
   * Sequence:
   *   1. log "draining"
   *   2. stop accepting new HTTP/WS connections (server.close starts)
   *   3. poll activeLoggerCount() until 0 or timeout
   *   4. shutdownContextServices() — close DB pool / pubsub / etc
   *   5. process.exit(0)
   *
   * On timeout we still exit cleanly (with a warn log) so an orphaned
   * stream never blocks deploy. SIGTERM-twice forces immediate exit.
   */
  let shuttingDown = false
  const shutdown = async (signal: string) => {
    if (shuttingDown) {
      console.warn(`[server] received ${signal} again — forcing immediate exit`)
      process.exit(1)
    }
    shuttingDown = true
    const drainTimeoutMs = Number(process.env.SHUTDOWN_DRAIN_TIMEOUT_MS ?? '30000')
    console.log(`[server] received ${signal}, draining in-flight (timeout ${drainTimeoutMs}ms)`)

    // Stop accepting new connections immediately. server.close() is
    // non-blocking in node — it stops the listener but waits for
    // existing connections to close on their own.
    server.close(() => {
      // This callback fires once all connections naturally close.
    })
    wsServer.close()

    // Poll the handoff-logger count as the in-flight signal.
    const { activeLoggerCount } = await import('./infrastructure/handoff-log/handoff-logger.js')
    const start = Date.now()
    while (Date.now() - start < drainTimeoutMs) {
      const n = activeLoggerCount()
      if (n === 0) break
      await new Promise((r) => setTimeout(r, 500))
    }
    const remaining = activeLoggerCount()
    if (remaining > 0) {
      console.warn(`[server] drain timeout · ${remaining} stream(s) still active, forcing shutdown anyway`)
    } else {
      console.log('[server] drain complete · all in-flight streams finished')
    }

    // P11.18 · final flush of agent SLO totals before exit so the
    // last few minutes of activity persist across restart.
    try {
      await flushAgentSloToDb()
    } catch {
      // best-effort; never block shutdown on this
    }
    // P11.18 · F4 · disconnect Redis sync cleanly.
    try {
      await shutdownAgentSloRedisSync()
    } catch {
      // best-effort
    }

    await shutdownContextServices()
    process.exit(0)
  }

  process.once('SIGINT', () => {
    void shutdown('SIGINT')
  })
  process.once('SIGTERM', () => {
    void shutdown('SIGTERM')
  })
  // Second signal forces exit (for impatient operators / OOM kill).
  process.on('SIGINT', () => shuttingDown && process.exit(1))
  process.on('SIGTERM', () => shuttingDown && process.exit(1))
}

start().catch((error) => {
  console.error('Failed to start server', error)
  process.exit(1)
})
