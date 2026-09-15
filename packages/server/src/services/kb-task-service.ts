/**
 * Knowledge-Base service (2026-04-28).
 *
 * Was a thin HTTP client to an external `task-service` that didn't exist
 * in this repo. Replaced with direct calls into the local `KbStore`
 * (pgvector + chunker + embedder, all in-process). Public function
 * signatures unchanged so callers (resolvers, BMC pipeline) don't move.
 *
 * KB metadata (the "knowledge base" entity itself — name, status,
 * timestamps) is now backed by a small `kb_definitions` table that's
 * auto-DDL'd on first use. Document chunks live in `kb_documents` +
 * `kb_chunks` (managed by `KbStore`).
 *
 * Removed env: `KB_TASK_SERVICE_URL` no longer consulted.
 */

import { nanoid } from 'nanoid'
import {
  createAuditLogger,
  type KnowledgeBase,
  type KnowledgeSearchResult as SharedKnowledgeSearchResult,
  type KnowledgeTask
} from '@starlink/shared'
import { pool } from '../infrastructure/db/pool.js'
import { getKbStore } from '../application/kb-store.js'
import { lookup as dnsLookup } from 'node:dns/promises'
import { isIP } from 'node:net'

const auditLogger = createAuditLogger('packages/server:services:kb-task-service')

export type GatewayKnowledgeBase = {
  id: KnowledgeBase['id']
  workspaceId: KnowledgeBase['workspaceId']
  name: KnowledgeBase['name']
  status: KnowledgeBase['status']
  createdAt: KnowledgeBase['createdAt']
  updatedAt: KnowledgeBase['updatedAt']
  publishedAt?: KnowledgeBase['publishedAt']
  /** F1 · Owner user id (NULL for legacy KBs created before isolation). */
  ownerUserId?: string | null
  /** F1 · 'private' | 'workspace' | 'global'. Defaults to 'workspace'. */
  visibility: 'private' | 'workspace' | 'global'
  /** P11.18 · optional human description. */
  description?: string | null
  /** P11.18 · count of documents currently in this KB. */
  sourceCount: number
  /** P11.18 · ISO timestamp of latest document ingest, or null if empty. */
  lastIngestAt?: string | null
}

export type KbVisibility = 'private' | 'workspace' | 'global'

export type GatewayKbTask = {
  id: KnowledgeTask['id']
  workspaceId: KnowledgeTask['workspaceId']
  kbId: KnowledgeTask['kbId']
  type: KnowledgeTask['type']
  status: KnowledgeTask['status']
  payload: Record<string, unknown>
  error?: KnowledgeTask['error']
  createdAt: KnowledgeTask['createdAt']
  updatedAt: KnowledgeTask['updatedAt']
}

export type KnowledgeSearchResult = SharedKnowledgeSearchResult

// =============================================================================
// kb_definitions table (lightweight metadata for KB entities themselves)
// =============================================================================

const KB_DEFINITIONS_DDL = `
  CREATE TABLE IF NOT EXISTS kb_definitions (
    id           TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    name         TEXT NOT NULL,
    status       TEXT NOT NULL DEFAULT 'draft',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    published_at TIMESTAMPTZ
  );

  -- F1 · per-user visibility (see migrations/010)
  ALTER TABLE kb_definitions
    ADD COLUMN IF NOT EXISTS owner_user_id TEXT,
    ADD COLUMN IF NOT EXISTS visibility    TEXT;

  CREATE INDEX IF NOT EXISTS idx_kb_definitions_workspace_id
    ON kb_definitions(workspace_id);
  CREATE INDEX IF NOT EXISTS idx_kb_definitions_owner_visibility
    ON kb_definitions(owner_user_id, visibility);
`

let kbDefDdlPromise: Promise<void> | null = null
function ensureKbDefinitionsTable(): Promise<void> {
  if (!kbDefDdlPromise) {
    kbDefDdlPromise = pool
      .query(KB_DEFINITIONS_DDL)
      .then(
        () => undefined,
        (err: unknown) => {
          kbDefDdlPromise = null
          throw err
        }
      )
  }
  return kbDefDdlPromise as Promise<void>
}

function rowToKb(row: Record<string, unknown>): GatewayKnowledgeBase {
  const rawVisibility = row.visibility as string | undefined
  const visibility: KbVisibility =
    rawVisibility === 'private' || rawVisibility === 'global'
      ? rawVisibility
      : 'workspace'
  return {
    id: row.id as string,
    workspaceId: row.workspace_id as string,
    name: row.name as string,
    status: row.status as KnowledgeBase['status'],
    createdAt: new Date(row.created_at as string).toISOString(),
    updatedAt: new Date(row.updated_at as string).toISOString(),
    publishedAt: row.published_at
      ? new Date(row.published_at as string).toISOString()
      : null,
    ownerUserId: (row.owner_user_id as string | undefined) ?? null,
    visibility,
    description: (row.description as string | null | undefined) ?? null,
    sourceCount: row.source_count == null ? 0 : Number(row.source_count),
    lastIngestAt: row.last_ingest_at
      ? new Date(row.last_ingest_at as string).toISOString()
      : null
  }
}

// =============================================================================
// Public API (signatures unchanged)
// =============================================================================

/**
 * P11.18 fix G · cross-workspace KB-id pollution guard.
 *
 * Throws if (workspaceId, kbId) doesn't match an existing
 * kb_definitions row, OR if the KB exists but belongs to a
 * different workspace. Without this, a caller authenticated
 * for workspace A could mutate kbId="kb-from-workspace-B" via
 * addKnowledgeSeed / addKnowledgeFile / importKnowledgeUrl —
 * resulting in kb_chunks rows with workspace_id=A and
 * owner_user_id sourced from B's kb_definitions, polluting
 * KB B's chunk space.
 *
 * "Not found" and "wrong workspace" both throw with the same
 * generic FORBIDDEN message so the caller can't probe whether
 * a kbId exists in some other workspace.
 */
/**
 * P11.18 fix H · basic SSRF guard for importKnowledgeUrl.
 *
 * importKnowledgeUrl takes a user-supplied URL and fetches it
 * server-side. Without a check, the URL could target:
 *   - cloud metadata services (169.254.169.254 on AWS/GCP/Azure)
 *   - container internals (172.17.x.x docker, 100.64.x.x cgnat)
 *   - localhost services (127.0.0.0/8, ::1)
 *   - private RFC1918 ranges (10/8, 172.16/12, 192.168/16)
 *   - link-local / multicast
 *
 * Allowed: explicit http:// or https:// to a hostname that
 * resolves to a globally-routable unicast IP. We resolve via
 * dns/lookup ahead of fetch -- there's a TOCTOU race where the
 * DNS could change between the lookup and fetch's own resolution,
 * but in practice this defends against the obvious internal-net
 * exfiltration path. A stricter implementation would use a
 * pinned-IP fetcher (resolve once, dial that IP with a Host
 * header), which is overkill for the threat model here.
 */
function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map((p) => Number(p))
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true
  const [a, b] = parts
  if (a === 10) return true
  if (a === 127) return true
  if (a === 0) return true
  if (a === 169 && b === 254) return true // link-local + AWS/GCP metadata
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 100 && b >= 64 && b <= 127) return true // CGNAT
  if (a >= 224) return true // multicast / reserved
  return false
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase()
  if (lower === '::' || lower === '::1') return true
  if (lower.startsWith('fe80:') || lower.startsWith('fe80::')) return true // link-local
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true // ULA
  if (lower.startsWith('::ffff:')) {
    // IPv4-mapped IPv6 — unwrap and check.
    const v4 = lower.slice('::ffff:'.length)
    if (isIP(v4) === 4) return isPrivateIPv4(v4)
  }
  return false
}

async function assertUrlIsExternal(url: string): Promise<void> {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error('FORBIDDEN: invalid URL')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('FORBIDDEN: only http(s) URLs are allowed')
  }
  const host = parsed.hostname
  if (!host) throw new Error('FORBIDDEN: URL has no hostname')

  // If the host is itself an IP literal, check directly.
  const ipKind = isIP(host)
  if (ipKind === 4 && isPrivateIPv4(host)) {
    throw new Error('FORBIDDEN: URL points to a private/internal IP')
  }
  if (ipKind === 6 && isPrivateIPv6(host)) {
    throw new Error('FORBIDDEN: URL points to a private/internal IPv6')
  }

  // Otherwise resolve to all addresses and reject if any is private.
  if (ipKind === 0) {
    let resolved
    try {
      resolved = await dnsLookup(host, { all: true })
    } catch {
      throw new Error('FORBIDDEN: hostname does not resolve')
    }
    for (const r of resolved) {
      if (r.family === 4 && isPrivateIPv4(r.address)) {
        throw new Error('FORBIDDEN: URL resolves to a private/internal IP')
      }
      if (r.family === 6 && isPrivateIPv6(r.address)) {
        throw new Error('FORBIDDEN: URL resolves to a private/internal IPv6')
      }
    }
  }
}

async function assertKbBelongsToWorkspace(
  workspaceId: string,
  kbId: string
): Promise<void> {
  await ensureKbDefinitionsTable()
  const result = await pool.query(
    `SELECT workspace_id FROM kb_definitions WHERE id = $1 LIMIT 1`,
    [kbId]
  )
  const row = result.rows[0] as { workspace_id?: string } | undefined
  if (!row || row.workspace_id !== workspaceId) {
    auditLogger.warn({
      action: 'kb-task-service.assertKbBelongsToWorkspace.denied',
      workflowId: workspaceId,
      metadata: { kbId, found: !!row, ownerWorkspace: row?.workspace_id ?? null }
    })
    throw new Error('FORBIDDEN: kb does not belong to this workspace')
  }
}

export async function listKnowledgeBases(
  workspaceId: string
): Promise<GatewayKnowledgeBase[]> {
  try {
    await ensureKbDefinitionsTable()
    const result = await pool.query(
      `SELECT k.*,
              COALESCE(d.cnt, 0)::int       AS source_count,
              d.latest_at                   AS last_ingest_at
         FROM kb_definitions k
         LEFT JOIN (
           SELECT kb_id, COUNT(*) AS cnt, MAX(updated_at) AS latest_at
             FROM kb_documents
            GROUP BY kb_id
         ) d ON d.kb_id = k.id
        WHERE k.workspace_id = $1
        ORDER BY k.updated_at DESC`,
      [workspaceId]
    )
    return result.rows.map(rowToKb)
  } catch (error) {
    auditLogger.warn({
      action: 'kb-task-service.listKnowledgeBases.failed',
      workflowId: workspaceId,
      metadata: { message: error instanceof Error ? error.message : String(error) }
    })
    return []
  }
}

export async function createKnowledgeBase(
  workspaceId: string,
  options: {
    name?: string
    /** F1 · Owner user id; required for non-legacy creation. */
    ownerUserId?: string
    /** F1 · Visibility (private | workspace | global); default 'workspace'. */
    visibility?: KbVisibility
  } = {}
): Promise<GatewayKnowledgeBase> {
  await ensureKbDefinitionsTable()
  const id = nanoid()
  const name = options.name ?? `kb-${id.slice(0, 6)}`
  const ownerUserId = options.ownerUserId ?? '__legacy__'
  const visibility: KbVisibility = options.visibility ?? 'workspace'
  const result = await pool.query(
    `INSERT INTO kb_definitions (id, workspace_id, name, status, owner_user_id, visibility, created_at, updated_at)
     VALUES ($1, $2, $3, 'draft', $4, $5, now(), now())
     RETURNING *`,
    [id, workspaceId, name, ownerUserId, visibility]
  )
  return rowToKb(result.rows[0])
}

// =============================================================================
// F4 · Agent ↔ KB binding
// =============================================================================

const KB_AGENT_BINDINGS_DDL = `
  CREATE TABLE IF NOT EXISTS kb_agent_bindings (
    id              TEXT PRIMARY KEY,
    workspace_id    TEXT NOT NULL,
    kb_id           TEXT NOT NULL,
    agent_id        TEXT NOT NULL,
    bound_by_user_id TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    auto_search     BOOLEAN NOT NULL DEFAULT true
  );
  CREATE UNIQUE INDEX IF NOT EXISTS uniq_kb_agent_bindings_kb_agent_workspace
    ON kb_agent_bindings (workspace_id, kb_id, agent_id);
  CREATE INDEX IF NOT EXISTS idx_kb_agent_bindings_agent_workspace
    ON kb_agent_bindings (agent_id, workspace_id)
    WHERE auto_search = true;
  CREATE INDEX IF NOT EXISTS idx_kb_agent_bindings_kb
    ON kb_agent_bindings (kb_id);
`

let kbAgentBindingsDdlPromise: Promise<void> | null = null
function ensureKbAgentBindingsTable(): Promise<void> {
  if (!kbAgentBindingsDdlPromise) {
    kbAgentBindingsDdlPromise = pool
      .query(KB_AGENT_BINDINGS_DDL)
      .then(
        () => undefined,
        (err: unknown) => {
          kbAgentBindingsDdlPromise = null
          throw err
        }
      )
  }
  return kbAgentBindingsDdlPromise as Promise<void>
}

export type KbAgentBinding = {
  id: string
  workspaceId: string
  kbId: string
  agentId: string
  boundByUserId: string
  createdAt: string
  autoSearch: boolean
}

function rowToBinding(row: Record<string, unknown>): KbAgentBinding {
  return {
    id: row.id as string,
    workspaceId: row.workspace_id as string,
    kbId: row.kb_id as string,
    agentId: row.agent_id as string,
    boundByUserId: row.bound_by_user_id as string,
    createdAt: new Date(row.created_at as string).toISOString(),
    autoSearch: Boolean(row.auto_search)
  }
}

/**
 * F4 · Bind a KB to an agent in a workspace. Idempotent: re-binding
 * the same (workspace, kb, agent) tuple updates auto_search but
 * doesn't error.
 *
 * Authorization: caller must have workspace.write AND must own the
 * KB (owner_user_id check) OR be a workspace admin. Resolver enforces
 * the workspace.write side; this function only checks KB ownership.
 */
export async function bindKbToAgent(args: {
  workspaceId: string
  kbId: string
  agentId: string
  boundByUserId: string
  autoSearch?: boolean
}): Promise<KbAgentBinding> {
  await ensureKbDefinitionsTable()
  await ensureKbAgentBindingsTable()

  // Verify KB exists in the workspace and caller is allowed to bind.
  // For 'private' KBs, only owner; for 'workspace'/'global' KBs any
  // workspace member with write access (already enforced upstream).
  const kbRow = await pool.query(
    `SELECT * FROM kb_definitions WHERE id = $1 AND workspace_id = $2 LIMIT 1`,
    [args.kbId, args.workspaceId]
  )
  if (kbRow.rowCount === 0) {
    throw new Error(`KB ${args.kbId} not found in workspace ${args.workspaceId}`)
  }
  const kb = kbRow.rows[0] as Record<string, unknown>
  if (
    kb.visibility === 'private'
    && kb.owner_user_id
    && kb.owner_user_id !== '__legacy__'
    && kb.owner_user_id !== args.boundByUserId
  ) {
    throw new Error(`FORBIDDEN: only owner can bind a private KB`)
  }

  const id = nanoid()
  const result = await pool.query(
    `INSERT INTO kb_agent_bindings (id, workspace_id, kb_id, agent_id, bound_by_user_id, auto_search, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, now())
     ON CONFLICT (workspace_id, kb_id, agent_id) DO UPDATE SET
       auto_search = EXCLUDED.auto_search,
       bound_by_user_id = COALESCE(kb_agent_bindings.bound_by_user_id, EXCLUDED.bound_by_user_id)
     RETURNING *`,
    [id, args.workspaceId, args.kbId, args.agentId, args.boundByUserId, args.autoSearch ?? true]
  )
  auditLogger.info({
    action: 'kb-task-service.bindKbToAgent.completed',
    workflowId: args.workspaceId,
    userId: args.boundByUserId,
    metadata: { kbId: args.kbId, agentId: args.agentId, autoSearch: args.autoSearch ?? true }
  })
  return rowToBinding(result.rows[0])
}

/**
 * F4 · Remove an agent ↔ KB binding. No-op when not bound. Returns
 * true when a row was removed.
 */
export async function unbindKbFromAgent(args: {
  workspaceId: string
  kbId: string
  agentId: string
}): Promise<boolean> {
  await ensureKbAgentBindingsTable()
  const result = await pool.query(
    `DELETE FROM kb_agent_bindings
      WHERE workspace_id = $1 AND kb_id = $2 AND agent_id = $3`,
    [args.workspaceId, args.kbId, args.agentId]
  )
  return (result.rowCount ?? 0) > 0
}

/**
 * F4 · List bindings for an agent in a workspace. Used at runtime
 * by business-langgraph to decide which KBs to auto-search before
 * invoking the agent.
 */
export async function listKbBindingsForAgent(
  workspaceId: string,
  agentId: string,
  options: { onlyAutoSearch?: boolean } = {}
): Promise<KbAgentBinding[]> {
  await ensureKbAgentBindingsTable()
  const filters = ['workspace_id = $1', 'agent_id = $2']
  if (options.onlyAutoSearch) filters.push('auto_search = true')
  const result = await pool.query(
    `SELECT * FROM kb_agent_bindings
      WHERE ${filters.join(' AND ')}
      ORDER BY created_at DESC`,
    [workspaceId, agentId]
  )
  return result.rows.map(rowToBinding)
}

/**
 * F7 · List documents in a KB. Returns metadata + content (callers
 * decide whether to show full content). Used by the KB management UI.
 */
export async function listKbDocuments(
  workspaceId: string,
  kbId: string
): Promise<Array<{
  id: string
  workspaceId: string
  kbId: string
  title: string
  contentType: string
  sourceUrl: string | null
  content: string
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}>> {
  return await getKbStore().listDocuments(kbId, workspaceId)
}

/**
 * F7 · Delete a single document (and all its chunks via FK cascade).
 * Authorization is performed at the resolver layer (workspace.write +
 * KB ownership for private). Returns true when the document existed
 * and was removed.
 */
export async function deleteKbDocument(
  workspaceId: string,
  kbId: string,
  docId: string
): Promise<boolean> {
  // Verify the doc actually belongs to (workspaceId, kbId) — defense
  // against trying to delete another workspace's doc by guessing its id.
  const docs = await getKbStore().listDocuments(kbId, workspaceId)
  const exists = docs.some((d) => d.id === docId)
  if (!exists) return false
  await getKbStore().removeDocument(docId)
  auditLogger.info({
    action: 'kb-task-service.deleteKbDocument.completed',
    workflowId: workspaceId,
    metadata: { kbId, docId }
  })
  return true
}

/**
 * F4 · List bindings for a KB. Used by the KB management UI to show
 * "this KB is wired to agents [A, B, C]".
 */
export async function listAgentBindingsForKb(
  workspaceId: string,
  kbId: string
): Promise<KbAgentBinding[]> {
  await ensureKbAgentBindingsTable()
  const result = await pool.query(
    `SELECT * FROM kb_agent_bindings
      WHERE workspace_id = $1 AND kb_id = $2
      ORDER BY agent_id ASC`,
    [workspaceId, kbId]
  )
  return result.rows.map(rowToBinding)
}

/**
 * F7 · List documents inside a KB. Returns shape suitable for the
 * KB management UI: id / title / contentType / sizeChars / metadata
 * for each row. Full content is omitted from this list to keep
 * payloads small — clients fetch individual docs as needed (a future
 * `getKnowledgeBaseDocument` query when there's UI demand).
 */
export type GatewayKbDocument = {
  id: string
  workspaceId: string
  kbId: string
  title: string
  contentType: string
  sourceUrl: string | null
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
  sizeChars: number
}

export async function listKnowledgeBaseDocuments(
  workspaceId: string,
  kbId: string
): Promise<GatewayKbDocument[]> {
  try {
    const docs = await getKbStore().listDocuments(kbId, workspaceId)
    return docs.map((d) => ({
      id: d.id,
      workspaceId: d.workspaceId,
      kbId: d.kbId,
      title: d.title,
      contentType: d.contentType,
      sourceUrl: d.sourceUrl,
      metadata: d.metadata,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
      sizeChars: typeof d.content === 'string' ? d.content.length : 0
    }))
  } catch (err) {
    auditLogger.warn({
      action: 'kb-task-service.listKnowledgeBaseDocuments.failed',
      workflowId: workspaceId,
      metadata: { kbId, error: err instanceof Error ? err.message : String(err) }
    })
    return []
  }
}

/**
 * F7 · Delete one document from a KB. Cascade to chunks happens via
 * the kb_chunks.doc_id ON DELETE CASCADE constraint in the schema.
 *
 * Authorization: caller's userId must own the parent KB if it's
 * 'private'; for 'workspace'/'global' KBs the resolver's
 * workspace.write check is sufficient. Returns true when a row was
 * deleted, false when the doc didn't exist or the caller wasn't
 * authorized (audit-logged).
 */
export async function deleteKnowledgeBaseDocument(args: {
  workspaceId: string
  kbId: string
  docId: string
  callerUserId: string
}): Promise<boolean> {
  await ensureKbDefinitionsTable()
  // Verify KB ownership for private KBs.
  const kbRow = await pool.query(
    `SELECT visibility, owner_user_id FROM kb_definitions WHERE id = $1 AND workspace_id = $2`,
    [args.kbId, args.workspaceId]
  )
  if (kbRow.rowCount === 0) return false
  const kb = kbRow.rows[0] as { visibility: string; owner_user_id: string | null }
  if (
    kb.visibility === 'private'
    && kb.owner_user_id
    && kb.owner_user_id !== '__legacy__'
    && kb.owner_user_id !== args.callerUserId
  ) {
    auditLogger.warn({
      action: 'kb-task-service.deleteKnowledgeBaseDocument.forbidden',
      workflowId: args.workspaceId,
      userId: args.callerUserId,
      metadata: { kbId: args.kbId, docId: args.docId }
    })
    throw new Error('FORBIDDEN: only owner can delete documents from a private KB')
  }
  // Verify the document is in this workspace before deleting.
  const docRow = await pool.query(
    `SELECT id FROM kb_documents WHERE id = $1 AND kb_id = $2 AND workspace_id = $3`,
    [args.docId, args.kbId, args.workspaceId]
  )
  if (docRow.rowCount === 0) return false
  await getKbStore().removeDocument(args.docId)
  auditLogger.info({
    action: 'kb-task-service.deleteKnowledgeBaseDocument.completed',
    workflowId: args.workspaceId,
    userId: args.callerUserId,
    metadata: { kbId: args.kbId, docId: args.docId }
  })
  return true
}

/**
 * F1 · Update a KB's visibility. Authorization: caller must own the
 * KB (owner_user_id match). Cascades the new visibility into the
 * denormalised columns on kb_chunks so vector search WHERE filters
 * stay consistent.
 */
export async function updateKnowledgeBaseVisibility(
  kbId: string,
  newVisibility: KbVisibility,
  callerUserId: string
): Promise<GatewayKnowledgeBase | null> {
  await ensureKbDefinitionsTable()
  const existing = await pool.query(
    `SELECT * FROM kb_definitions WHERE id = $1 LIMIT 1`,
    [kbId]
  )
  if (existing.rowCount === 0) return null
  const row = existing.rows[0] as Record<string, unknown>
  if (row.owner_user_id && row.owner_user_id !== '__legacy__' && row.owner_user_id !== callerUserId) {
    throw new Error('FORBIDDEN: only the KB owner can change visibility')
  }
  // Update in a transaction so kb_definitions + kb_chunks stay aligned.
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(
      `UPDATE kb_definitions
          SET visibility = $2,
              owner_user_id = COALESCE(NULLIF(owner_user_id, '__legacy__'), $3),
              updated_at = now()
        WHERE id = $1`,
      [kbId, newVisibility, callerUserId]
    )
    await client.query(
      `UPDATE kb_chunks
          SET visibility = $2,
              owner_user_id = COALESCE(NULLIF(owner_user_id, '__legacy__'), $3)
        WHERE kb_id = $1`,
      [kbId, newVisibility, callerUserId]
    )
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
  const after = await pool.query(
    `SELECT * FROM kb_definitions WHERE id = $1`,
    [kbId]
  )
  return rowToKb(after.rows[0])
}

export async function publishKnowledgeBase(
  workspaceId: string,
  kbId: string
): Promise<GatewayKnowledgeBase> {
  await ensureKbDefinitionsTable()
  const result = await pool.query(
    `UPDATE kb_definitions
     SET status = 'ready', published_at = now(), updated_at = now()
     WHERE id = $1 AND workspace_id = $2
     RETURNING *`,
    [kbId, workspaceId]
  )
  if (result.rows.length === 0) {
    throw new Error(`Knowledge base ${kbId} not found in workspace ${workspaceId}`)
  }
  return rowToKb(result.rows[0])
}

/**
 * Add a single text seed (paragraph-or-larger) to the KB. Internally this
 * calls KbStore.addDocument with a synthetic title, which chunks + embeds
 * the seed and persists into `kb_documents` + `kb_chunks`.
 *
 * Returns a Task-shaped object so the GraphQL response surface (which
 * was modelled on the old async task-service) keeps compiling. Status
 * is reported as 'completed' immediately because ingestion is synchronous
 * in this implementation; if KbStore embedding fails, status='failed'
 * with the error message.
 */
/**
 * F4 · In-process file import. Frontend reads the file via FileReader,
 * passes content + contentType + fileName here, and we route through
 * the same addDocument pipeline as addKnowledgeSeed. The KbStore's
 * extractor handles plaintext / markdown / html / json natively;
 * PDFs throw with an actionable error message.
 *
 * The fileName becomes the doc title (truncated to 200 chars to keep
 * UI columns sane). Metadata records the original content-type so a
 * future re-extraction (e.g. PDF support added later) can re-process
 * stored bytes.
 */
export async function addKnowledgeFile(
  workspaceId: string,
  kbId: string,
  fileName: string,
  contentType: string,
  content: string,
  /**
   * F4 (phase 1) · When true, `content` is base64 — decoded to a
   * Buffer and routed through the binary extractor (PDF / DOCX / XLSX).
   * When false / omitted, `content` is treated as UTF-8 text (legacy
   * txt / md / html / json path).
   */
  isBase64 = false
): Promise<GatewayKbTask> {
  const taskId = nanoid()
  const now = new Date().toISOString()
  const title = (fileName || `file-${taskId.slice(0, 6)}`).slice(0, 200)
  try {
    await assertKbBelongsToWorkspace(workspaceId, kbId)
    if (!content) {
      throw new Error('addKnowledgeFile: empty content')
    }
    const payload: string | Buffer = isBase64 ? Buffer.from(content, 'base64') : content
    if (!isBase64 && typeof payload === 'string' && !payload.trim()) {
      throw new Error('addKnowledgeFile: empty text content')
    }
    const { docId, chunkCount } = await getKbStore().addDocument({
      kbId,
      workspaceId,
      title,
      content: payload,
      contentType,
      fileName,
      metadata: { kind: 'file', originalFileName: fileName }
    })
    auditLogger.info({
      action: 'kb-task-service.addKnowledgeFile.completed',
      workflowId: workspaceId,
      metadata: { kbId, taskId, docId, chunkCount, fileName, contentType }
    })
    return {
      id: taskId,
      workspaceId,
      kbId,
      type: 'file',
      status: 'succeeded',
      payload: { docId, chunkCount, fileName },
      error: null,
      createdAt: now,
      updatedAt: now
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    auditLogger.warn({
      action: 'kb-task-service.addKnowledgeFile.failed',
      workflowId: workspaceId,
      metadata: { kbId, fileName, contentType, message }
    })
    return {
      id: taskId,
      workspaceId,
      kbId,
      type: 'file',
      status: 'failed',
      payload: { fileName },
      error: message,
      createdAt: now,
      updatedAt: now
    }
  }
}

export async function addKnowledgeSeed(
  workspaceId: string,
  kbId: string,
  text: string
): Promise<GatewayKbTask> {
  const taskId = nanoid()
  const now = new Date().toISOString()
  const title = `seed-${taskId.slice(0, 6)}`
  try {
    await assertKbBelongsToWorkspace(workspaceId, kbId)
    const { docId, chunkCount } = await getKbStore().addDocument({
      kbId,
      workspaceId,
      title,
      content: text,
      metadata: { kind: 'seed' }
    })
    auditLogger.info({
      action: 'kb-task-service.addKnowledgeSeed.completed',
      workflowId: workspaceId,
      metadata: { kbId, taskId, docId, chunkCount }
    })
    return {
      id: taskId,
      workspaceId,
      kbId,
      type: 'seed',
      status: 'succeeded',
      payload: { docId, chunkCount },
      error: null,
      createdAt: now,
      updatedAt: now
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    auditLogger.warn({
      action: 'kb-task-service.addKnowledgeSeed.failed',
      workflowId: workspaceId,
      metadata: { kbId, message }
    })
    return {
      id: taskId,
      workspaceId,
      kbId,
      type: 'seed',
      status: 'failed',
      payload: {},
      error: message,
      createdAt: now,
      updatedAt: now
    }
  }
}

/**
 * Fetch a URL, treat the body as text, and ingest it. Minimal HTML
 * stripping (drop script/style + collapse whitespace) — for richer
 * extraction (PDF, structured HTML), a follow-up should add a proper
 * extractor library; this default is enough for plaintext articles.
 */
export async function importKnowledgeUrl(
  workspaceId: string,
  kbId: string,
  url: string
): Promise<GatewayKbTask> {
  const taskId = nanoid()
  const now = new Date().toISOString()
  try {
    await assertKbBelongsToWorkspace(workspaceId, kbId)
    await assertUrlIsExternal(url)
    // redirect: 'manual' so a server can't 302 us to an internal IP
    // after we passed the initial DNS check.
    const res = await fetch(url, { redirect: 'manual' })
    if (res.status >= 300 && res.status < 400) {
      throw new Error(`URL responded with redirect ${res.status}; redirects disabled for SSRF safety`)
    }
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`)
    const raw = await res.text()
    const text = stripHtmlMinimal(raw)
    if (text.trim().length < 30) {
      throw new Error('extracted text too short (<30 chars)')
    }
    const { docId, chunkCount } = await getKbStore().addDocument({
      kbId,
      workspaceId,
      title: url,
      content: text,
      sourceUrl: url,
      metadata: { kind: 'url-import', sourceUrl: url }
    })
    return {
      id: taskId,
      workspaceId,
      kbId,
      type: 'url',
      status: 'succeeded',
      payload: { docId, chunkCount, url },
      error: null,
      createdAt: now,
      updatedAt: now
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    auditLogger.warn({
      action: 'kb-task-service.importKnowledgeUrl.failed',
      workflowId: workspaceId,
      metadata: { kbId, url, message }
    })
    return {
      id: taskId,
      workspaceId,
      kbId,
      type: 'url',
      status: 'failed',
      payload: { url },
      error: message,
      createdAt: now,
      updatedAt: now
    }
  }
}

/**
 * P12 · single-chunk lookup by (docId, chunkIndex).
 *
 * Used by the Evidence drawer when the user clicks a
 * [[ref:docId#chunk-N]] citation. The frontend isn't streaming a
 * conversation at the time, so its in-memory `knowledgeEvidence`
 * array doesn't have the chunk — pull it directly from kb_chunks.
 *
 * Returns null on:
 *   - workspaceId / docId mismatch (chunk belongs to another tenant)
 *   - chunk doesn't exist
 *   - PG error (best-effort, logged but not thrown so the drawer can
 *     gracefully show "snippet unavailable")
 *
 * Authorization: the resolver must call assertWorkspaceAccess
 * before us. We additionally verify workspace_id ownership on the
 * row itself.
 */
export async function lookupKbChunk(
  workspaceId: string,
  docId: string,
  chunkIndex: number
): Promise<{
  docId: string
  chunkIndex: number
  content: string
  docTitle: string | null
  kbId: string
  kbName: string | null
} | null> {
  try {
    const result = await pool.query(
      `SELECT
         c.content       AS content,
         c.chunk_index   AS chunk_index,
         c.kb_id         AS kb_id,
         d.title         AS doc_title,
         d.workspace_id  AS workspace_id,
         k.name          AS kb_name
       FROM kb_chunks c
       JOIN kb_documents d ON d.id = c.doc_id
       LEFT JOIN kb_definitions k ON k.id = c.kb_id
       WHERE c.doc_id = $1 AND c.chunk_index = $2
       LIMIT 1`,
      [docId, chunkIndex]
    )
    const row = result.rows[0] as
      | {
          content: string
          chunk_index: number
          kb_id: string
          doc_title: string | null
          workspace_id: string
          kb_name: string | null
        }
      | undefined
    if (!row) return null
    if (row.workspace_id !== workspaceId) {
      // Tenant isolation — caller has access to workspaceId, but the
      // chunk lives in a different workspace. Return null without
      // distinguishing this from "not found" so the caller can't
      // probe foreign-workspace KBs.
      return null
    }
    return {
      docId,
      chunkIndex: row.chunk_index,
      content: row.content,
      docTitle: row.doc_title,
      kbId: row.kb_id,
      kbName: row.kb_name
    }
  } catch (err) {
    auditLogger.warn({
      action: 'kb-task-service.lookupKbChunk.failed',
      workflowId: workspaceId,
      metadata: { docId, chunkIndex, err: err instanceof Error ? err.message : String(err) }
    })
    return null
  }
}

/**
 * Strip script/style + tags + collapse whitespace. NOT a real HTML parser
 * but adequate for the "fetch a blog post and ingest its prose" use case.
 * For PDFs / structured docs, a real extractor goes here in follow-up.
 */
function stripHtmlMinimal(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

export async function searchKnowledgeBase(
  workspaceId: string,
  kbId: string,
  query: string,
  topK = 5,
  /**
   * F1 · Caller user id for visibility filtering. When provided,
   * private chunks are restricted to those owned by this user;
   * workspace chunks restricted to the matching workspaceId; global
   * chunks always visible.
   *
   * Optional for backward compatibility — internal/admin callers
   * (legacy paths) that don't have a user identity skip the filter
   * and get the legacy "all chunks for kbId" behaviour. Production
   * GraphQL resolvers should always pass it.
   */
  callerUserId?: string
): Promise<KnowledgeSearchResult[]> {
  try {
    const results = await getKbStore().searchChunks(kbId, query, topK, {
      callerUserId,
      callerWorkspaceId: workspaceId
    })
    if (results.length === 0) {
      auditLogger.info({
        action: 'kb-task-service.searchKnowledgeBase.empty',
        workflowId: workspaceId,
        metadata: { kbId, query: query.slice(0, 80), topK }
      })
    }
    return results
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    auditLogger.warn({
      action: 'kb-task-service.searchKnowledgeBase.failed',
      workflowId: workspaceId,
      metadata: { kbId, query: query.slice(0, 80), topK, message }
    })
    return []
  }
}

export async function getKnowledgeBaseStatus(
  workspaceId: string,
  kbId: string
): Promise<{
  knowledgeBase: GatewayKnowledgeBase
  tasks: GatewayKbTask[]
}> {
  await ensureKbDefinitionsTable()
  const result = await pool.query(
    `SELECT * FROM kb_definitions WHERE id = $1 AND workspace_id = $2`,
    [kbId, workspaceId]
  )
  if (result.rows.length === 0) {
    throw new Error(`Knowledge base ${kbId} not found in workspace ${workspaceId}`)
  }
  // No async-task model in the new in-process implementation — every
  // ingestion is synchronous and returns its task object directly. The
  // status query thus returns an empty tasks list; the GraphQL surface
  // keeps working without breaking changes.
  return {
    knowledgeBase: rowToKb(result.rows[0]),
    tasks: []
  }
}
