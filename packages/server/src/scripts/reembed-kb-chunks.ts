/**
 * Admin one-shot: re-embed kb_chunks rows whose vectors were generated
 * by the local-hash fallback (or never embedded at all).
 *
 * When a deployment switches from local-hash → real embedding provider
 * (e.g. user adds EMBEDDING_API_KEY to .env), historical chunks still
 * carry deterministic-hash vectors and won't match queries that use
 * the new provider's embeddings. This script walks the table, picks
 * candidates via metadata.embeddingProvider, calls embedText() on
 * each, and writes back the new vector + provider metadata.
 *
 * Usage:
 *   pnpm --filter @starlink/server kb:reembed -- --all
 *   pnpm --filter @starlink/server kb:reembed -- --kbId=kb-abc123
 *   pnpm --filter @starlink/server kb:reembed -- --dry-run
 *
 * Safety:
 *   - Idempotent: each chunk re-embedded with the current provider; if
 *     the provider is still local-hash the script no-ops (just rewrites
 *     identical vectors). Run AFTER you've configured the real key.
 *   - Sequential: one chunk at a time, ~50ms typical OpenAI latency.
 *     For 10k chunks expect ~10 minutes.
 *   - Refuses to run if `describeEmbeddingConfig().mode === 'local-hash'`
 *     unless --force is passed (prevents accidental same-quality rewrite).
 */

import { pool } from '../infrastructure/db/pool.js'
import { embedText, toPgVector, describeEmbeddingConfig } from '../services/embedding-service.js'

interface CliArgs {
  all: boolean
  kbId: string | null
  dryRun: boolean
  force: boolean
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { all: false, kbId: null, dryRun: false, force: false }
  for (const raw of argv) {
    if (raw === '--all') args.all = true
    else if (raw === '--dry-run' || raw === '--dry') args.dryRun = true
    else if (raw === '--force') args.force = true
    else if (raw.startsWith('--kbId=')) args.kbId = raw.slice('--kbId='.length)
    else if (raw.startsWith('--kb-id=')) args.kbId = raw.slice('--kb-id='.length)
  }
  return args
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))

  if (!args.all && !args.kbId) {
    console.error('Usage: kb:reembed --all | --kbId=<id> [--dry-run] [--force]')
    process.exit(1)
  }

  const cfg = describeEmbeddingConfig()
  console.log(`[reembed] embedding mode: ${cfg.mode}${cfg.model ? ' · model=' + cfg.model : ''}`)
  if (cfg.mode === 'local-hash' && !args.force) {
    console.error('[reembed] aborting: current EMBEDDING_PROVIDER is local-hash. Re-running')
    console.error('would rewrite same-quality vectors. Configure EMBEDDING_API_KEY first,')
    console.error('or pass --force to proceed anyway.')
    process.exit(2)
  }

  // Targets: chunks whose persisted embeddingProvider is missing OR
  // 'local-hash'. We deliberately don't compare model strings — model
  // upgrades on the same provider don't hurt enough to force a re-embed.
  const where = args.all
    ? `(metadata->>'embeddingProvider' IS NULL OR metadata->>'embeddingProvider' = 'local-hash')`
    : `kb_id = $1 AND (metadata->>'embeddingProvider' IS NULL OR metadata->>'embeddingProvider' = 'local-hash')`
  const params = args.all ? [] : [args.kbId]

  type ChunkRow = { id: string; content: string; metadata: Record<string, unknown> }
  const result = await pool.query(
    `SELECT id, content, metadata FROM kb_chunks WHERE ${where} ORDER BY created_at ASC`,
    params
  )
  const rows = result.rows as ChunkRow[]

  console.log(`[reembed] target chunks: ${rows.length}`)
  if (args.dryRun) {
    console.log('[reembed] --dry-run: no writes')
    process.exit(0)
  }
  if (rows.length === 0) {
    console.log('[reembed] nothing to do')
    process.exit(0)
  }

  let succeeded = 0
  let failed = 0
  const t0 = Date.now()
  for (const row of rows) {
    try {
      const result = await embedText(row.content)
      const nextMetadata = {
        ...(row.metadata ?? {}),
        embeddingProvider: result.provider,
        embeddingModel: result.model,
        reembeddedAt: new Date().toISOString(),
      }
      await pool.query(
        `UPDATE kb_chunks SET embedding = $1::vector, metadata = $2::jsonb WHERE id = $3`,
        [toPgVector(result.vector), JSON.stringify(nextMetadata), row.id]
      )
      succeeded += 1
      if (succeeded % 25 === 0) {
        const rate = succeeded / ((Date.now() - t0) / 1000)
        console.log(`[reembed] ${succeeded}/${rows.length}  (~${rate.toFixed(1)}/s)`)
      }
    } catch (err) {
      failed += 1
      console.warn(`[reembed] chunk ${row.id} failed:`, err instanceof Error ? err.message : err)
    }
  }

  const elapsedSec = (Date.now() - t0) / 1000
  console.log(`[reembed] done · ok=${succeeded} fail=${failed} elapsed=${elapsedSec.toFixed(1)}s`)
  process.exit(failed > 0 ? 3 : 0)
}

main().catch((err) => {
  console.error('[reembed] fatal:', err)
  process.exit(1)
})
