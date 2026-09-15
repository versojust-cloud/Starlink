/**
 * PostgreSQL connection pool · single source of truth for all DB access.
 *
 * Goals (per session-memory-design v2):
 *   - Env-swap ready: DATABASE_URL alone determines target; SSL toggled by
 *     PG_SSL=require|disable (default: require in production, disable in dev).
 *   - Per-user isolation: withUserContext() sets `app.current_user_id` for
 *     the duration of a query block, enabling Row Level Security policies
 *     to filter even when application-layer code forgets to pass user_id.
 *   - Self-healing extension install: ensureExtensions() creates pgvector +
 *     pgcrypto if missing — required for cold-start on a fresh database.
 *
 * Usage:
 *   await ensureExtensions()              // call once at boot
 *   await withUserContext(userId, async (client) => {
 *     await client.query('SELECT ...')    // RLS filtered to this user
 *   })
 */

import pg from 'pg'
const { Pool } = pg

// pg's CJS package exports types as namespaces only — bring them into
// type space via lookup on the Pool constructor's own typings.
type PoolClient = Awaited<ReturnType<InstanceType<typeof Pool>['connect']>>
type PoolSslOption = ConstructorParameters<typeof Pool>[0] extends infer C
  ? C extends { ssl?: infer S }
    ? S
    : never
  : never

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  throw new Error('DATABASE_URL is required')
}

/**
 * SSL mode resolution:
 *   - explicit PG_SSL=require/disable wins
 *   - else: require in production, disable elsewhere
 *   - cloud PG (Aliyun / Supabase / Neon) defaults to require
 */
function resolveSslConfig(): PoolSslOption {
  const explicit = process.env.PG_SSL?.toLowerCase()
  if (explicit === 'disable' || explicit === 'false' || explicit === 'off') return false as PoolSslOption
  if (explicit === 'require' || explicit === 'true' || explicit === 'on') {
    return { rejectUnauthorized: false } as PoolSslOption
  }
  // Default: require in production
  return (process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false) as PoolSslOption
}

const poolMax = Number.parseInt(process.env.PG_POOL_MAX ?? '20', 10)
const idleTimeoutMs = Number.parseInt(process.env.PG_IDLE_TIMEOUT_MS ?? '30000', 10)
const connectTimeoutMs = Number.parseInt(process.env.PG_CONNECT_TIMEOUT_MS ?? '5000', 10)
// P11.18 · per-statement timeout. Default 30s — long enough for vector
// search on large KBs but short enough to surface stuck queries.
const statementTimeoutMs = Number.parseInt(process.env.PG_STATEMENT_TIMEOUT_MS ?? '30000', 10)

export const pool = new Pool({
  connectionString,
  ssl: resolveSslConfig(),
  max: Number.isFinite(poolMax) && poolMax > 0 ? poolMax : 20,
  idleTimeoutMillis: Number.isFinite(idleTimeoutMs) ? idleTimeoutMs : 30_000,
  connectionTimeoutMillis: Number.isFinite(connectTimeoutMs) ? connectTimeoutMs : 5_000,
  // P11.18 · runtime statement_timeout via post-connect SET; the node-pg
  // Pool config doesn't accept it directly, so we install it on every
  // new connection via the on('connect') handler below.
})

/**
 * P11.18 · pool-wide error handler. Without this, a transient error on
 * an idle pooled connection (e.g. PG kicked us out) is logged by node-pg
 * to stderr but never reaches our audit pipeline. Critically, an
 * uncaught 'error' event on EventEmitter would crash the process — so
 * even just attaching a no-op listener is necessary; we go further and
 * log + count failures so operators see pool-level instability.
 */
let poolErrorCount = 0
pool.on('error', (err: Error) => {
  poolErrorCount += 1
  console.error(`[pg-pool] connection error #${poolErrorCount}: ${err.message}`)
})

/**
 * P11.18 · per-connection setup: enforce statement_timeout so a single
 * runaway query (bad index, lock wait) can't hold a connection forever.
 * Runs on every new connection acquired by the pool, including the
 * first; idempotent because SET is local to the session.
 */
if (Number.isFinite(statementTimeoutMs) && statementTimeoutMs > 0) {
  pool.on('connect', (client: { query: (sql: string) => Promise<unknown> }) => {
    client
      .query(`SET statement_timeout = ${statementTimeoutMs}`)
      .catch((err: Error) => {
        console.warn(`[pg-pool] failed to set statement_timeout on connection: ${err.message}`)
      })
  })
}

export function getPoolErrorCount(): number {
  return poolErrorCount
}

/**
 * Run a callback with a fresh client that has `app.current_user_id` set
 * to the given user id for the lifetime of this query block. Row Level
 * Security policies on tables like memory_items / conversation_sessions
 * read this setting to filter rows to the calling user, providing a
 * second line of defense if application-layer filtering is missed.
 *
 * The setting uses SET LOCAL — it auto-clears at transaction end and
 * never leaks to another client when the connection is returned to
 * the pool. We wrap the callback in BEGIN / COMMIT to make SET LOCAL
 * effective.
 *
 * If userId is null/empty, throws — never silently fall back to "no
 * user context", which would expose all rows.
 */
export async function withUserContext<T>(
  userId: string,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  if (!userId || typeof userId !== 'string') {
    throw new Error('withUserContext requires a non-empty userId')
  }
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    // SET LOCAL only takes effect inside a transaction; auto-cleared on COMMIT/ROLLBACK.
    // Use parameterized form via set_config so the value is properly escaped.
    await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [userId])
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

/**
 * Idempotently install required PG extensions. Called once at boot.
 * Failure is fatal — pgvector is not optional for memory + KB.
 */
let extensionsInstalled = false
export async function ensureExtensions(): Promise<void> {
  if (extensionsInstalled) return
  await pool.query('CREATE EXTENSION IF NOT EXISTS vector')
  await pool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto')
  await pool.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')
  extensionsInstalled = true
}

/**
 * Health probe. Returns connection info + extension status. Used by
 * /health/database route and admin tooling. Never throws — surfaces
 * the error so operators can see what's wrong.
 */
export interface DatabaseHealth {
  connected: boolean
  ssl: boolean
  extensions: { vector: boolean; pgcrypto: boolean; uuidOssp: boolean }
  error?: string
}

export async function probeDatabaseHealth(): Promise<DatabaseHealth> {
  try {
    const result = await pool.query(
      `SELECT extname FROM pg_extension WHERE extname IN ('vector', 'pgcrypto', 'uuid-ossp')`,
    )
    const installed = new Set(result.rows.map((r: { extname: string }) => r.extname))
    return {
      connected: true,
      ssl: resolveSslConfig() !== false,
      extensions: {
        vector: installed.has('vector'),
        pgcrypto: installed.has('pgcrypto'),
        uuidOssp: installed.has('uuid-ossp'),
      },
    }
  } catch (err) {
    return {
      connected: false,
      ssl: resolveSslConfig() !== false,
      extensions: { vector: false, pgcrypto: false, uuidOssp: false },
      error: err instanceof Error ? err.message : String(err),
    }
  }
}
