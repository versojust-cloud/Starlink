import { nanoid } from 'nanoid'
import type {
  CanvasGraph,
  ConversationMessage,
  ConversationMessageRole,
  ConversationSession,
  MemoryItem,
  MemoryKind,
  MemoryScope,
  MemoryLayer,
  MemoryFacet,
  MemoryCategory
} from '@starlink/shared'
import {
  conversationMessageSchema,
  conversationSessionSchema,
  memoryItemSchema
} from '@starlink/shared'
import { pool } from '../infrastructure/db/pool.js'
import { embedText, toPgVector } from '../services/embedding-service.js'
import {
  encryptIfConfigured,
  decryptIfNeeded,
  encryptUserSkillMetadata,
  decryptUserSkillMetadata
} from '../services/user-skill-crypto.js'

type JsonRecord = Record<string, unknown>

type CreateSessionInput = {
  id: string
  workspaceId: string
  userId: string
  title: string
  status: ConversationSession['status']
  latestQuestion?: string | null
  contextSnapshot?: JsonRecord
}

export type AppendMessageInput = {
  conversationId: string
  workspaceId: string
  userId?: string | null
  role: ConversationMessageRole
  content: string
  metadata?: JsonRecord
}

export type UpsertMemoryInput = {
  id?: string
  workspaceId: string
  userId?: string | null
  /** @deprecated P14 · use {@link layer} (workspace/user). 'agent' is dead. */
  scope?: MemoryScope
  /** @deprecated P14 · use {@link facet} + {@link category}. */
  kind?: MemoryKind
  /**
   * P14 · 5-layer memory hierarchy. Required in new code; back-compat code
   * may still pass `scope` and the store will derive layer.
   */
  layer?: MemoryLayer
  /** P14 · cognitive-science classification of content type. */
  facet?: MemoryFacet
  /**
   * P14 · business term within a (layer, facet) tuple. See
   * KNOWN_MEMORY_CATEGORIES. Free-form to allow domain extensions.
   */
  category?: MemoryCategory
  title: string
  content: string
  sourceType?: string
  sourceId?: string | null
  importance?: number
  confidence?: number
  tags?: string[]
  metadata?: JsonRecord
}

/** Helper: derive (layer, facet, category) from legacy (scope, kind)
 *  when caller didn't supply the new axes. Mirrors migration 016 backfill.
 *  Exported for unit tests; not part of the public store API. */
export function deriveCanonicalAxes(input: Pick<UpsertMemoryInput, 'layer' | 'facet' | 'category' | 'scope' | 'kind'>): {
  layer: MemoryLayer
  facet: MemoryFacet
  category: MemoryCategory
} {
  if (input.layer && input.facet && input.category) {
    return { layer: input.layer, facet: input.facet, category: input.category }
  }
  const scope = input.scope ?? 'workspace'
  const kind = input.kind ?? 'summary'

  const layer: MemoryLayer = input.layer
    ?? (scope === 'user' ? 'user' : 'workspace')

  const facet: MemoryFacet = input.facet ?? (
    kind === 'summary' || kind === 'canvas' || kind === 'decision'
      ? 'episodic'
      : 'semantic'
  )

  const category: MemoryCategory = input.category ?? (
    kind === 'summary' ? 'bmc-summary'
      : kind === 'canvas' ? 'canvas-snapshot'
      : kind === 'decision' ? 'decision'
      : kind === 'user-skill' ? 'user-skill'
      : kind === 'preference' ? 'user-preference'
      : kind === 'insight' ? 'workspace-fact'
      : kind === 'constraint' ? 'user-constraint'
      : kind
  )
  return { layer, facet, category }
}

/** Reverse mapping: pick a sensible legacy `kind` value when caller only
 *  supplied the new triple. Used when writing both old + new columns during
 *  the deprecation window so legacy read paths keep finding rows. */
function legacyKindFromCanonical(canonical: {
  layer: MemoryLayer
  facet: MemoryFacet
  category: MemoryCategory
}): MemoryKind {
  const c = canonical.category
  if (c === 'bmc-summary') return 'summary'
  if (c === 'canvas-snapshot') return 'canvas'
  if (c === 'decision') return 'decision'
  if (c === 'user-skill') return 'user-skill'
  // P14 P2 · `preference` / `insight` / `constraint` legacy kinds dropped
  // from the live enum. user-preference / workspace-fact / user-constraint
  // categories now back-map to the closest still-living kind so the
  // legacy `kind` column stays parseable; the canonical view (facet +
  // category) carries the precise classification.
  if (c === 'user-preference') return 'user-skill'
  if (c === 'workspace-fact') return 'summary'
  if (c === 'user-constraint') return 'user-skill'
  // Unknown / extension category — fall back to facet-driven default so
  // legacy enum constraint isn't violated.
  return canonical.facet === 'episodic' ? 'summary' : 'user-skill'
}

type MemorySearchOptions = {
  query?: string
  scope?: MemoryScope
  kind?: MemoryKind
  limit?: number
  /**
   * Filter by user. When set, queries restrict to rows where
   * `user_id = userId`. Required when reading `kind === 'user-skill'` rows.
   */
  userId?: string
  /**
   * When true, the workspace_id filter widens to "matches workspaceId OR is
   * NULL" — returns both workspace-scoped and global (cross-workspace) rows.
   * Used by user-skill reads which want both per-idea and per-user traits.
   */
  includeGlobalUser?: boolean
}

type CaptureConversationOutcomeInput = {
  workspaceId: string
  userId: string
  conversationId: string
  question?: string | null
  graph: CanvasGraph
  decision?: string
  evidenceCount?: number
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0
  return Math.max(0, Math.min(1, value))
}

const runtimeDdlEnabled = process.env.CONVERSATION_MEMORY_RUNTIME_DDL === 'true'

const initTables = runtimeDdlEnabled ? pool.query(`
  -- P14 P3 · conversations + runs split (mirrors migration 017). This
  -- runtime DDL fires only on fresh dev DBs; production environments run
  -- the SQL migration. The legacy conversation_sessions table was DROPped
  -- in migration 018 (2026-05-09) — no longer recreated here.
  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'open',
    current_run_id TEXT,
    opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    closed_at TIMESTAMPTZ,
    metadata JSONB NOT NULL DEFAULT '{}'
  );
  CREATE INDEX IF NOT EXISTS idx_conversations_workspace_opened
    ON conversations (workspace_id, opened_at DESC);
  CREATE INDEX IF NOT EXISTS idx_conversations_user_opened
    ON conversations (user_id, opened_at DESC);

  CREATE TABLE IF NOT EXISTS runs (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    status TEXT NOT NULL,
    langgraph_thread_id TEXT,
    latest_question TEXT,
    context_snapshot JSONB NOT NULL DEFAULT '{}',
    heartbeat_at TIMESTAMPTZ,
    owner_pid TEXT,
    hitl_directive JSONB,
    failure_reason TEXT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    metadata JSONB NOT NULL DEFAULT '{}'
  );
  CREATE INDEX IF NOT EXISTS idx_runs_conversation_started
    ON runs (conversation_id, started_at DESC);
  CREATE INDEX IF NOT EXISTS idx_runs_active_heartbeat
    ON runs (workspace_id, heartbeat_at NULLS FIRST)
    WHERE status IN ('queued', 'streaming', 'waiting-hitl');

  CREATE TABLE IF NOT EXISTS conversation_messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    user_id TEXT,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE INDEX IF NOT EXISTS idx_conversation_messages_conversation_created
    ON conversation_messages (conversation_id, created_at DESC);

  CREATE TABLE IF NOT EXISTS memory_items (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    user_id TEXT,
    scope TEXT NOT NULL,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    embedding VECTOR(1536),
    embedding_model TEXT,
    embedding_dimensions INTEGER,
    source_type TEXT NOT NULL,
    source_id TEXT,
    importance DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    confidence DOUBLE PRECISION NOT NULL DEFAULT 0.7,
    tags TEXT[] NOT NULL DEFAULT '{}',
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_used_at TIMESTAMPTZ,
    archived_at TIMESTAMPTZ
  );

  ALTER TABLE memory_items ADD COLUMN IF NOT EXISTS embedding VECTOR(1536);
  ALTER TABLE memory_items ADD COLUMN IF NOT EXISTS embedding_model TEXT;
  ALTER TABLE memory_items ADD COLUMN IF NOT EXISTS embedding_dimensions INTEGER;
  -- P14 · 5-layer × facet × category axes (added 2026-05-09). The runtime
  -- DDL block here mirrors migration 016; this branch fires only when
  -- CONVERSATION_MEMORY_RUNTIME_DDL=true (e.g. fresh dev DB / smoke tests).
  ALTER TABLE memory_items ADD COLUMN IF NOT EXISTS layer TEXT;
  ALTER TABLE memory_items ADD COLUMN IF NOT EXISTS facet TEXT;
  ALTER TABLE memory_items ADD COLUMN IF NOT EXISTS category TEXT;

  CREATE INDEX IF NOT EXISTS idx_memory_items_workspace_updated
    ON memory_items (workspace_id, updated_at DESC);

  CREATE UNIQUE INDEX IF NOT EXISTS idx_memory_items_source_unique
    ON memory_items (workspace_id, source_type, source_id, kind, title)
    WHERE source_id IS NOT NULL AND archived_at IS NULL;

  CREATE INDEX IF NOT EXISTS idx_memory_items_embedding
    ON memory_items
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100)
    WHERE embedding IS NOT NULL AND archived_at IS NULL;
`) : Promise.resolve()

export class ConversationMemoryStore {
  private ready: Promise<void> | null = null

  private ensureTables() {
    if (!this.ready) {
      this.ready = initTables.then(() => undefined)
    }
    return this.ready
  }

  async createSession(input: CreateSessionInput): Promise<ConversationSession> {
    await this.ensureTables()
    // P14 P3 · "session" now means (conversation, run) pair. Each call
    // INSERTs one conversations row + one runs row, sets the
    // conversations.current_run_id pointer, and synthesizes a back-compat
    // ConversationSession view from the run row for callers.
    //
    // P11.13 / T4.3 · stamp heartbeat_at = now() on the run INSERT so
    // findActiveSession's heartbeat-aware soft-lock catches the row as
    // "live" immediately (without the prior ~60s grace gap).
    const conversationId = input.id
    const runId = `${conversationId}-r1`
    const newRunStatus = mapLegacyToRunStatus(input.status)

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(
        `INSERT INTO conversations (id, workspace_id, user_id, title, status, current_run_id, opened_at, metadata)
         VALUES ($1, $2, $3, $4, 'open', $5, now(), '{}'::jsonb)
         ON CONFLICT (id) DO UPDATE SET
           workspace_id = EXCLUDED.workspace_id,
           user_id = EXCLUDED.user_id,
           title = EXCLUDED.title,
           status = 'open',
           current_run_id = EXCLUDED.current_run_id,
           closed_at = NULL`,
        [conversationId, input.workspaceId, input.userId, input.title, runId]
      )
      const runResult = await client.query(
        `INSERT INTO runs (
          id, conversation_id, workspace_id, user_id, status,
          latest_question, context_snapshot, heartbeat_at, started_at, metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, now(), now(), '{}'::jsonb)
        ON CONFLICT (id) DO UPDATE SET
          status = EXCLUDED.status,
          latest_question = EXCLUDED.latest_question,
          context_snapshot = EXCLUDED.context_snapshot,
          heartbeat_at = now()
        RETURNING *`,
        [
          runId,
          conversationId,
          input.workspaceId,
          input.userId,
          newRunStatus,
          input.latestQuestion ?? null,
          JSON.stringify(input.contextSnapshot ?? {})
        ]
      )
      await client.query('COMMIT')
      const convRow = await pool.query('SELECT title, opened_at, closed_at FROM conversations WHERE id = $1', [conversationId])
      return rowFromRunAndConversation(runResult.rows[0], convRow.rows[0])
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)
      throw error
    } finally {
      client.release()
    }
  }

  async updateSessionStatus(
    conversationId: string,
    status: ConversationSession['status'],
    options?: { latestQuestion?: string | null; contextSnapshot?: JsonRecord; completed?: boolean }
  ): Promise<ConversationSession | null> {
    await this.ensureTables()
    // P14 P3 · update the conversation's current run; close the conversation
    // when status is terminal AND completed flag set.
    const runStatus = mapLegacyToRunStatus(status)
    const isTerminal = runStatus === 'completed' || runStatus === 'failed' || runStatus === 'cancelled'
    const result = await pool.query(
      `UPDATE runs r
         SET status = $2,
             latest_question = COALESCE($3, latest_question),
             context_snapshot = COALESCE($4::jsonb, context_snapshot),
             completed_at = CASE WHEN $5 THEN now() ELSE completed_at END
       FROM conversations c
       WHERE c.id = $1 AND r.id = c.current_run_id
       RETURNING r.*`,
      [
        conversationId,
        runStatus,
        options?.latestQuestion ?? null,
        options?.contextSnapshot ? JSON.stringify(options.contextSnapshot) : null,
        Boolean(options?.completed) || isTerminal
      ]
    )
    if (!result.rowCount) return null
    if (isTerminal && options?.completed !== false) {
      await pool.query(
        `UPDATE conversations
            SET status = 'closed',
                closed_at = COALESCE(closed_at, now())
          WHERE id = $1`,
        [conversationId]
      )
    }
    const conv = await pool.query('SELECT title, opened_at, closed_at FROM conversations WHERE id = $1', [conversationId])
    return rowFromRunAndConversation(result.rows[0], conv.rows[0])
  }

  async getSession(conversationId: string): Promise<ConversationSession | null> {
    await this.ensureTables()
    // P14 P3 · synthesize from (conversations × current run) JOIN.
    const result = await pool.query(
      `SELECT r.*, c.title AS c_title, c.opened_at AS c_opened_at, c.closed_at AS c_closed_at
         FROM conversations c
         JOIN runs r ON r.id = c.current_run_id
        WHERE c.id = $1`,
      [conversationId]
    )
    if (!result.rowCount) return null
    const row = result.rows[0]
    return rowFromRunAndConversation(row, {
      title: row.c_title,
      opened_at: row.c_opened_at,
      closed_at: row.c_closed_at
    })
  }

  async listSessions(workspaceId: string, limit = 20): Promise<ConversationSession[]> {
    await this.ensureTables()
    const result = await pool.query(
      `SELECT r.*, c.title AS c_title, c.opened_at AS c_opened_at, c.closed_at AS c_closed_at
         FROM conversations c
         JOIN runs r ON r.id = c.current_run_id
        WHERE c.workspace_id = $1
        ORDER BY c.opened_at DESC
        LIMIT $2`,
      [workspaceId, clampLimit(limit, 1, 100)]
    )
    return result.rows.map((row: Record<string, unknown>) => rowFromRunAndConversation(row, {
      title: row.c_title,
      opened_at: row.c_opened_at,
      closed_at: row.c_closed_at
    }))
  }

  /**
   * P3 · List ALL user-skill rows owned by a user across ALL workspaces.
   *
   * Used by the cross-workspace promote pass in UserSkillExtractor to
   * detect titles that recur across multiple ideas. Unlike
   * searchUserSkills, this method does NOT take a workspaceId — it
   * deliberately walks the user's entire skill set.
   */
  /**
   * @deprecated P14 P5 · use {@link MemoryRetrievalService.retrieve} instead:
   *   retrieve({ layers: ['user', 'workspace'], userId,
   *              categories: ['user-skill'], rankBy: 'recency', topK: limit })
   * Used by UserSkillConsolidator for cross-workspace pattern detection;
   * retrieve() returns the same set with a uniform sort.
   */
  async listAllUserSkillsForUser(userId: string, limit = 200): Promise<MemoryItem[]> {
    await this.ensureTables()
    const cap = clampLimit(limit, 1, 500)
    const result = await pool.query(
      `SELECT * FROM memory_items
        WHERE user_id = $1
          AND kind = 'user-skill'
          AND archived_at IS NULL
        ORDER BY updated_at DESC
        LIMIT $2`,
      [userId, cap]
    )
    return result.rows.map((row: Record<string, unknown>) => rowToMemory(row))
  }

  /**
   * P3 · Count completed conversation sessions for a user.
   *
   * Used by the user-skill extractor to decide which trigger tier to
   * use:
   *   - count < 5  → eager (extract every conversation, fast cold-start)
   *   - count ≥ 5  → throttled (extract every Nth, default 3)
   *
   * "Completed" means status='completed' OR status='failed' — both
   * represent finished sessions where the user got SOMETHING out of
   * the conversation. status='running' rows are excluded so an
   * in-progress session doesn't accidentally bump the user past the
   * cold-start threshold.
   */
  async countCompletedSessionsForUser(userId: string): Promise<number> {
    await this.ensureTables()
    // P14 P3 · count distinct conversations whose current run is in a
    // terminal state. Equivalent to the legacy meaning since every
    // backfilled conversation_sessions row maps to a conversations row.
    const result = await pool.query(
      `SELECT COUNT(*) AS n
         FROM conversations c
         JOIN runs r ON r.id = c.current_run_id
        WHERE c.user_id = $1
          AND r.status IN ('completed', 'failed')`,
      [userId]
    )
    const n = result.rows[0]?.n
    return typeof n === 'number' ? n : Number.parseInt(String(n ?? 0), 10) || 0
  }

  /**
   * Heartbeat update for an active stream. Called every 30s by the
   * gateway process running the LangGraph stream. Stale rows (no
   * heartbeat in >90s) are detected by listStaleSessions() and
   * marked failed by the reaper script.
   */
  async touchHeartbeat(conversationId: string, ownerPid: string): Promise<void> {
    await this.ensureTables()
    // P14 P3 · heartbeat is run-level state.
    await pool.query(
      `UPDATE runs r
         SET heartbeat_at = now(), owner_pid = $2
       FROM conversations c
       WHERE c.id = $1
         AND r.id = c.current_run_id
         AND r.status IN ('queued', 'streaming', 'waiting-hitl')`,
      [conversationId, ownerPid]
    )
  }

  /**
   * P11.16 · persist a HITL resume directive on the session row so a
   * subsequent runSupervisor pass (possibly in a fresh process after
   * a gateway crash) can read + consume it. The previous in-memory
   * Map was lost on restart, defeating the whole HITL recovery story.
   */
  async setHitlDirective(conversationId: string, directive: Record<string, unknown>): Promise<void> {
    await this.ensureTables()
    // P14 P3 · HITL directive is run-level state.
    await pool.query(
      `UPDATE runs r
         SET hitl_directive = $2::jsonb
       FROM conversations c
       WHERE c.id = $1 AND r.id = c.current_run_id`,
      [conversationId, JSON.stringify(directive)]
    )
  }

  /**
   * P11.16 · read + clear the directive atomically. Returns the
   * directive object or null. The clear-on-read prevents the next
   * revision round from re-applying the same human decision.
   */
  async consumeHitlDirective(conversationId: string): Promise<Record<string, unknown> | null> {
    await this.ensureTables()
    // P14 P3 · directive is run-level; read-then-clear in a CTE so we
    // capture the OLD value (PG's `RETURNING` after `SET … = NULL` would
    // return the post-update NULL — a latent bug in the legacy code).
    const result = await pool.query(
      `WITH target AS (
         SELECT r.id, r.hitl_directive
           FROM runs r
           JOIN conversations c ON c.id = $1 AND r.id = c.current_run_id
          WHERE r.hitl_directive IS NOT NULL
       ),
       cleared AS (
         UPDATE runs r SET hitl_directive = NULL
           FROM target t
          WHERE r.id = t.id
         RETURNING r.id
       )
       SELECT t.hitl_directive FROM target t`,
      [conversationId]
    )
    const raw = result.rows[0]?.hitl_directive
    if (!raw) return null
    if (typeof raw === 'object') return raw as Record<string, unknown>
    if (typeof raw === 'string') {
      try { return JSON.parse(raw) as Record<string, unknown> } catch { return null }
    }
    return null
  }

  /**
   * Find sessions whose heartbeat is older than the given interval.
   * Returns sessions in 'running' status with stale or missing heartbeat.
   *
   * Used by:
   *   - session-reaper.ts (cron) — marks them 'failed' with reason='heartbeat-lost'
   *   - findActiveSession() — to decide whether a 'running' row should
   *     block a new conversation
   *
   * graceMs: how long after creation before a heartbeat is required
   * (covers the gap between createSession and the first touchHeartbeat).
   */
  async listStaleSessions(opts?: {
    olderThanMs?: number
    graceMs?: number
    limit?: number
  }): Promise<ConversationSession[]> {
    await this.ensureTables()
    const olderThanMs = opts?.olderThanMs ?? 90_000
    const graceMs = opts?.graceMs ?? 60_000
    const limit = clampLimit(opts?.limit ?? 50, 1, 500)
    // P14 P3 · stale check is run-level: any active run whose heartbeat is
    // older than threshold. The reaper marks them failed.
    const result = await pool.query(
      `SELECT r.*, c.title AS c_title, c.opened_at AS c_opened_at, c.closed_at AS c_closed_at
         FROM runs r
         JOIN conversations c ON c.id = r.conversation_id
        WHERE r.status IN ('queued', 'streaming', 'waiting-hitl')
          AND r.started_at < now() - ($2 || ' milliseconds')::interval
          AND (
            r.heartbeat_at IS NULL
            OR r.heartbeat_at < now() - ($1 || ' milliseconds')::interval
          )
        ORDER BY r.started_at ASC
        LIMIT $3`,
      [olderThanMs, graceMs, limit]
    )
    return result.rows.map((row: Record<string, unknown>) => rowFromRunAndConversation(row, {
      title: row.c_title,
      opened_at: row.c_opened_at,
      closed_at: row.c_closed_at
    }))
  }

  /**
   * Mark a session as failed with a specific reason. Used by the reaper
   * to bulk-recover crashed-gateway sessions; also exposed via GraphQL
   * for explicit user-driven cancel.
   */
  async failSession(conversationId: string, reason: string): Promise<void> {
    await this.ensureTables()
    // P14 P3 · fail the current run + close the conversation.
    await pool.query(
      `UPDATE runs r
         SET status = 'failed',
             failure_reason = $2,
             completed_at = now()
       FROM conversations c
       WHERE c.id = $1
         AND r.id = c.current_run_id
         AND r.status IN ('queued', 'streaming', 'waiting-hitl')`,
      [conversationId, reason]
    )
    await pool.query(
      `UPDATE conversations
          SET status = 'closed',
              closed_at = COALESCE(closed_at, now())
        WHERE id = $1`,
      [conversationId]
    )
  }

  /**
   * Find a single in-flight conversation in the given workspace, if any.
   *
   * Used by the workspace soft-lock (DEC-5) at conversation-store.startConversation
   * to prevent two concurrent business graphs writing into the same workspace
   * (which races on memory_items writes + canvas mutations).
   *
   * Returns the most recently updated 'running' session, or null when the
   * workspace is idle. Heartbeat-aware: rows whose heartbeat is older
   * than 90s (or NULL after the 60s grace window from createSession)
   * are treated as crashed gateway leftovers and ignored — the reaper
   * will eventually mark them 'failed'.
   *
   * userId: optional filter for "find an active session OWNED BY this
   * user" (multi-tenant safety — a user shouldn't be blocked by another
   * user's stream in the same workspace).
   */
  async findActiveSession(
    workspaceId: string,
    options?: { userId?: string }
  ): Promise<ConversationSession | null> {
    await this.ensureTables()
    // P14 P3 · find an active RUN in the workspace; the conversation
    // wrapper is fetched alongside via JOIN. Heartbeat-aware soft-lock
    // semantics preserved: a run with stale heartbeat is treated as
    // crashed-gateway leftover and ignored (reaper will mark it failed).
    const userId = options?.userId
    const params: unknown[] = [workspaceId]
    let userFilter = ''
    if (userId) {
      params.push(userId)
      userFilter = ` AND r.user_id = $${params.length}`
    }
    const result = await pool.query(
      `SELECT r.*, c.title AS c_title, c.opened_at AS c_opened_at, c.closed_at AS c_closed_at
         FROM runs r
         JOIN conversations c ON c.id = r.conversation_id
        WHERE r.workspace_id = $1
          AND r.status IN ('queued', 'streaming', 'waiting-hitl')
          ${userFilter}
          AND (
            -- Fresh heartbeat: still considered active
            r.heartbeat_at > now() - INTERVAL '90 seconds'
            OR (
              -- Within grace window after creation, no heartbeat yet
              r.heartbeat_at IS NULL
              AND r.started_at > now() - INTERVAL '60 seconds'
            )
          )
        ORDER BY r.started_at DESC
        LIMIT 1`,
      params
    )
    if (!result.rowCount) return null
    const row = result.rows[0]
    return rowFromRunAndConversation(row, {
      title: row.c_title,
      opened_at: row.c_opened_at,
      closed_at: row.c_closed_at
    })
  }

  async appendMessage(input: AppendMessageInput): Promise<ConversationMessage> {
    await this.ensureTables()
    const result = await pool.query(
      `INSERT INTO conversation_messages (
        id, conversation_id, workspace_id, user_id, role, content, metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
      RETURNING *`,
      [
        nanoid(),
        input.conversationId,
        input.workspaceId,
        input.userId ?? null,
        input.role,
        input.content,
        JSON.stringify(input.metadata ?? {})
      ]
    )
    // P14 P3 · old code touched conversation_sessions.updated_at here so
    // listSessions ordering reflected most-recent-activity. After the
    // split, conversations has no updated_at column (status=open is
    // sufficient liveness); the run's heartbeat_at is reserved for
    // streaming-process liveness, NOT chat-message arrival. Drop the
    // touch — listSessions orders by opened_at DESC.
    return rowToMessage(result.rows[0])
  }

  async listMessages(conversationId: string, limit = 20): Promise<ConversationMessage[]> {
    await this.ensureTables()
    const result = await pool.query(
      `SELECT * FROM conversation_messages
       WHERE conversation_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [conversationId, clampLimit(limit, 1, 200)]
    )
    return result.rows.map(rowToMessage).reverse()
  }

  async upsertMemory(input: UpsertMemoryInput): Promise<MemoryItem> {
    await this.ensureTables()
    const id = input.id ?? await this.findMemoryIdBySource(input) ?? nanoid()
    // P14 · derive canonical (layer, facet, category) from input — caller
    // can pass either the new triple OR the old (scope, kind) pair (or
    // both); derivation prefers explicit new-axis values and falls back
    // to backfill rules from migration 016.
    const canonical = deriveCanonicalAxes(input)
    // Embedding is computed BEFORE encryption — embeddings are never
    // encrypted (they need to be queryable for `<=>` similarity). This
    // means the embedding vector itself can leak content via inversion
    // attacks (Pan et al. 2020+); user-skill-crypto.ts documents this as
    // residual risk. For non-user-skill rows, plaintext is stored anyway,
    // so the embedding is no extra leak.
    const embedding = await embedText(renderMemoryEmbeddingInput(input))
    const isUserSkill = canonical.category === 'user-skill'
    // For user-skill rows, encrypt sensitive fields (title, content,
    // metadata.revisionTrend nested fields) at the storage boundary.
    // No-op when USER_SKILL_ENCRYPTION_KEY is unset → plaintext fallthrough.
    const storedTitle = isUserSkill ? encryptIfConfigured(input.title) : input.title
    const storedContent = isUserSkill ? encryptIfConfigured(input.content) : input.content
    const storedMetadata = {
      ...(isUserSkill
        ? (encryptUserSkillMetadata(input.metadata ?? {}) as Record<string, unknown>)
        : (input.metadata ?? {})),
      embeddingProvider: embedding.provider
    }
    const result = await pool.query(
      `INSERT INTO memory_items (
        id, workspace_id, user_id,
        scope, kind, layer, facet, category,
        title, content, source_type,
        source_id, importance, confidence, tags, metadata,
        embedding, embedding_model, embedding_dimensions
      )
      VALUES (
        $1, $2, $3,
        $4, $5, $6, $7, $8,
        $9, $10, $11,
        $12, $13, $14, $15::text[], $16::jsonb,
        $17::vector, $18, $19
      )
      ON CONFLICT (id) DO UPDATE SET
        layer = EXCLUDED.layer,
        facet = EXCLUDED.facet,
        category = EXCLUDED.category,
        title = EXCLUDED.title,
        content = EXCLUDED.content,
        importance = EXCLUDED.importance,
        confidence = EXCLUDED.confidence,
        tags = EXCLUDED.tags,
        metadata = EXCLUDED.metadata,
        embedding = EXCLUDED.embedding,
        embedding_model = EXCLUDED.embedding_model,
        embedding_dimensions = EXCLUDED.embedding_dimensions,
        updated_at = now(),
        archived_at = NULL
      RETURNING *`,
      [
        id,
        input.workspaceId,
        input.userId ?? null,
        // Legacy (scope, kind) — write the input value if explicit, else
        // back-derive from canonical so old read paths still work.
        input.scope ?? (canonical.layer === 'user' ? 'user' : 'workspace'),
        input.kind ?? legacyKindFromCanonical(canonical),
        // Canonical (layer, facet, category) — the new authoritative axes.
        canonical.layer,
        canonical.facet,
        canonical.category,
        storedTitle,
        storedContent,
        input.sourceType ?? 'manual',
        input.sourceId ?? null,
        clampScore(input.importance ?? 0.5),
        clampScore(input.confidence ?? 0.7),
        input.tags ?? [],
        JSON.stringify(storedMetadata),
        toPgVector(embedding.vector),
        embedding.model,
        embedding.dimensions
      ]
    )

    const stored = rowToMemory(result.rows[0])
    if (!input.sourceId) return stored

    return await this.mergeMemoryBySource(stored, {
      embeddingVector: toPgVector(embedding.vector),
      embeddingModel: embedding.model,
      embeddingDimensions: embedding.dimensions
    })
  }

  /**
   * @deprecated P14 P5 · use {@link MemoryRetrievalService.retrieve} instead:
   *   retrieve({ layers: ['workspace'], workspaceId, queryText, topK })
   * Returns RankedMemory[] with explainable score breakdown (cosine /
   * recency / importance / confidence). The wrapper here continues to
   * work for back-compat; new code should call retrieve directly.
   */
  async listMemories(
    workspaceId: string,
    options: MemorySearchOptions = {}
  ): Promise<MemoryItem[]> {
    await this.ensureTables()
    const limit = clampLimit(options.limit ?? 30, 1, 100)
    if (options.query?.trim()) {
      return await this.searchMemories(workspaceId, options.query, limit, {
        scope: options.scope,
        kind: options.kind
      })
    }

    const { filters, params } = buildMemoryFilters(workspaceId, options)
    params.push(limit)
    const result = await pool.query(
      `SELECT * FROM memory_items
       WHERE ${filters.join(' AND ')}
       ORDER BY importance DESC, updated_at DESC
       LIMIT $${params.length}`,
      params
    )

    return result.rows.map(rowToMemory)
  }

  /**
   * @deprecated P14 P5 · use {@link MemoryRetrievalService.retrieve} instead:
   *   retrieve({ layers: ['workspace', 'user'], workspaceId, queryText: query, topK: limit })
   * The new path has the canonical salience formula (cosine × recency
   * × importance × confidence) with explainable per-row breakdown.
   */
  async searchMemories(
    workspaceId: string,
    query: string,
    limit = 8,
    options: Pick<MemorySearchOptions, 'scope' | 'kind' | 'userId' | 'includeGlobalUser'> = {}
  ): Promise<MemoryItem[]> {
    await this.ensureTables()
    const normalizedQuery = query.trim()
    if (!normalizedQuery) return []

    const semantic = await this.searchMemoriesByVector(workspaceId, normalizedQuery, limit, options)
    if (semantic.length > 0) return semantic

    const { filters, params } = buildMemoryFilters(workspaceId, options)
    params.push(200)
    const result = await pool.query(
      `SELECT * FROM memory_items
       WHERE ${filters.join(' AND ')}
       ORDER BY updated_at DESC
       LIMIT $${params.length}`,
      params
    )
    const scored = scoreMemories(result.rows.map(rowToMemory), normalizedQuery).slice(0, clampLimit(limit, 1, 30))
    await this.touchMemories(scored.map((item) => item.id))
    return scored
  }

  private async searchMemoriesByVector(
    workspaceId: string,
    query: string,
    limit: number,
    options: Pick<MemorySearchOptions, 'scope' | 'kind' | 'userId' | 'includeGlobalUser'>
  ): Promise<MemoryItem[]> {
    try {
      const embedding = await embedText(query)
      const { filters, params } = buildMemoryFilters(workspaceId, options)
      filters.push('embedding IS NOT NULL')
      params.push(toPgVector(embedding.vector))
      const vectorParamIndex = params.length
      params.push(clampLimit(limit, 1, 30))

      const result = await pool.query(
        `SELECT * FROM memory_items
         WHERE ${filters.join(' AND ')}
         ORDER BY embedding <=> $${vectorParamIndex}::vector ASC,
                  importance DESC,
                  updated_at DESC
         LIMIT $${params.length}`,
        params
      )

      const memories: MemoryItem[] = result.rows.map(rowToMemory)
      await this.touchMemories(memories.map((item) => item.id))
      return memories
    } catch (error) {
      console.warn('[conversation-memory-store] vector memory search failed, falling back to lexical search', {
        error: String(error)
      })
      return []
    }
  }

  /**
   * User-skill specific helper. Two layers in one query:
   *   - workspace-scoped skills for this idea (scope='workspace', workspace_id=$W)
   *   - global user skills across ideas (scope='user', workspace_id IS NULL)
   *
   * Both filtered by userId. If `query` is empty/missing, falls back to a
   * recency-ordered list (no embedding required) — useful for the extractor
   * which wants to see all of a user's skills regardless of similarity to
   * any current query.
   *
   * Confidence threshold: callers should filter `confidence < 0.5` items
   * themselves at render time; this method returns all rows so the
   * extractor can also see low-confidence items it might want to reinforce.
   */
  /**
   * @deprecated P14 P5 · use {@link MemoryRetrievalService.retrieve} instead:
   *   retrieve({ layers: ['user', 'workspace'], userId, workspaceId,
   *              categories: ['user-skill'], queryText, topK })
   * The legacy method merges scope=workspace + scope=user via the
   * `includeGlobalUser` flag; retrieve() handles this transparently
   * via the layers + workspace+user filter combination.
   */
  async searchUserSkills(
    userId: string,
    workspaceId: string,
    options: { query?: string; limit?: number } = {}
  ): Promise<MemoryItem[]> {
    await this.ensureTables()
    const limit = clampLimit(options.limit ?? 20, 1, 50)
    const query = options.query?.trim()

    if (query) {
      return this.searchMemories(workspaceId, query, limit, {
        kind: 'user-skill',
        userId,
        includeGlobalUser: true
      })
    }

    // Recency fallback (no embedding cost).
    const { filters, params } = buildMemoryFilters(workspaceId, {
      kind: 'user-skill',
      userId,
      includeGlobalUser: true
    })
    params.push(limit)
    const result = await pool.query(
      `SELECT * FROM memory_items
       WHERE ${filters.join(' AND ')}
       ORDER BY confidence DESC, updated_at DESC
       LIMIT $${params.length}`,
      params
    )
    return result.rows.map(rowToMemory)
  }

  /**
   * Read recent conversation summaries for a single user across ALL their
   * workspaces — used by `UserSkillExtractor` to look at cross-idea patterns
   * before deciding which traits are durable enough to promote to user-skill.
   *
   * Pulls rows where kind='summary' (the kind written by
   * writeConversationSummary in business-langgraph.ts). Bypasses
   * workspace_id filter intentionally — this is the one query in the store
   * that is per-USER not per-WORKSPACE.
   */
  /**
   * @deprecated P14 P5 · use {@link MemoryRetrievalService.retrieve} instead:
   *   retrieve({ layers: ['workspace'], userId,
   *              categories: ['bmc-summary'], rankBy: 'recency', topK: limit })
   * Note: this method bypasses workspace_id filter (per-user, not
   * per-workspace) — retrieve() achieves the same by passing only userId.
   */
  async listUserSummaries(userId: string, limit = 10): Promise<MemoryItem[]> {
    await this.ensureTables()
    const clamped = clampLimit(limit, 1, 30)
    const result = await pool.query(
      `SELECT * FROM memory_items
       WHERE user_id = $1 AND kind = 'summary' AND archived_at IS NULL
       ORDER BY created_at DESC
       LIMIT $2`,
      [userId, clamped]
    )
    return result.rows.map(rowToMemory)
  }

  async captureConversationOutcome(input: CaptureConversationOutcomeInput): Promise<MemoryItem[]> {
    const memories: MemoryItem[] = []
    const question = input.question?.trim() || '未命名会话'
    const graphSummary = summarizeGraphForMemory(input.graph)

    if (input.decision?.trim()) {
      // Derive confidence from how much evidence was attached when the
      // decision was finalized. Default 0.7 (no-evidence floor) → 0.95
      // (≥10 citations). Importance stays high (0.9) because every
      // user-finalized decision is intrinsically worth surfacing.
      const evCount = input.evidenceCount ?? 0
      const decisionConfidence = clamp01(0.7 + Math.min(0.25, evCount * 0.025))
      memories.push(await this.upsertMemory({
        workspaceId: input.workspaceId,
        userId: input.userId,
        scope: 'workspace',
        kind: 'decision',
        title: `最终决策：${truncate(question, 32)}`,
        content: input.decision.trim(),
        sourceType: 'conversation',
        sourceId: input.conversationId,
        importance: 0.9,
        confidence: decisionConfidence,
        tags: ['decision', 'agent-output'],
        metadata: {
          question,
          evidenceCount: evCount,
          scoreReason: `evidence=${evCount}`
        }
      }))
    }

    if (graphSummary) {
      // Derive importance + confidence from REAL pipeline signals,
      // not hardcoded values. Previous behavior wrote 0.78 / 0.74
      // for every canvas summary regardless of quality, leading
      // users to ask "why is memory always 74%".
      //
      // Importance ∝ how complete the canvas is (BMC cells / 9).
      // Confidence ∝ structural completeness (BMC + edges) and is
      // penalised by unresolved high-severity conflicts (which
      // signal that the canvas is unstable).
      const bmcCount = input.graph.nodes.filter((n) => {
        const meta = (n.data as { meta?: { macraType?: string } } | undefined)?.meta
        return meta?.macraType === 'cc-bmc-card'
      }).length
      const conflictCount = input.graph.nodes.filter((n) => {
        const meta = (n.data as { meta?: { macraType?: string } } | undefined)?.meta
        return meta?.macraType === 'conflict-alert'
      }).length
      const edgeCount = input.graph.edges.length
      const bmcRatio = Math.min(1, bmcCount / 9)
      const importance = clamp01(0.4 + 0.5 * bmcRatio + (edgeCount > 4 ? 0.1 : 0))
      // Conflicts cap confidence: 0 conflicts → +0, 1-2 → -0.1, 3-4 → -0.2, ≥5 → -0.3
      const conflictPenalty = conflictCount === 0 ? 0 : Math.min(0.3, 0.05 + 0.05 * conflictCount)
      const confidence = clamp01(0.5 + 0.4 * bmcRatio - conflictPenalty)
      memories.push(await this.upsertMemory({
        workspaceId: input.workspaceId,
        userId: input.userId,
        scope: 'workspace',
        kind: 'canvas',
        title: `画布摘要：${truncate(question, 32)}`,
        content: graphSummary,
        sourceType: 'canvas',
        sourceId: input.conversationId,
        importance,
        confidence,
        tags: ['canvas', 'summary'],
        metadata: {
          question,
          nodeCount: input.graph.nodes.length,
          edgeCount,
          bmcCount,
          conflictCount,
          // Persist the contributing signals so future readers can
          // explain why a given memory got its score.
          scoreReason: `bmc=${bmcCount}/9 · conflicts=${conflictCount} · edges=${edgeCount}`
        }
      }))
    }

    return memories
  }

  private async findMemoryIdBySource(input: UpsertMemoryInput): Promise<string | null> {
    if (!input.sourceId) return null
    const result = await pool.query(
      `SELECT id FROM memory_items
       WHERE workspace_id = $1
         AND source_type = $2
         AND source_id = $3
         AND kind = $4
         AND title = $5
         AND archived_at IS NULL
       ORDER BY updated_at DESC
       LIMIT 1`,
      [
        input.workspaceId,
        input.sourceType ?? 'manual',
        input.sourceId,
        input.kind ?? 'insight',
        input.title
      ]
    )
    return result.rowCount ? result.rows[0].id as string : null
  }

  private async mergeMemoryBySource(
    memory: MemoryItem,
    vector: { embeddingVector: string; embeddingModel: string; embeddingDimensions: number }
  ): Promise<MemoryItem> {
    if (!memory.sourceId) return memory
    const result = await pool.query(
      `SELECT * FROM memory_items
       WHERE workspace_id = $1
         AND source_type = $2
         AND source_id = $3
         AND kind = $4
         AND title = $5
         AND archived_at IS NULL
       ORDER BY updated_at ASC`,
      [memory.workspaceId, memory.sourceType, memory.sourceId, memory.kind, memory.title]
    )
    if (result.rowCount <= 1) return memory

    const [keeper, ...duplicates] = result.rows.map(rowToMemory)
    await pool.query(
      `UPDATE memory_items
       SET content = $2,
           importance = $3,
           confidence = $4,
           tags = $5::text[],
           metadata = $6::jsonb,
           embedding = $7::vector,
           embedding_model = $8,
           embedding_dimensions = $9,
           updated_at = now()
       WHERE id = $1`,
      [
        keeper.id,
        memory.content,
        memory.importance,
        memory.confidence,
        memory.tags,
        JSON.stringify(memory.metadata),
        vector.embeddingVector,
        vector.embeddingModel,
        vector.embeddingDimensions
      ]
    )
    await pool.query(
      'UPDATE memory_items SET archived_at = now() WHERE id = ANY($1::text[])',
      [duplicates.map((item: MemoryItem) => item.id).concat(memory.id).filter((id: string) => id !== keeper.id)]
    )
    const merged = await pool.query('SELECT * FROM memory_items WHERE id = $1', [keeper.id])
    return rowToMemory(merged.rows[0])
  }

  private async touchMemories(ids: string[]) {
    if (ids.length === 0) return
    await pool.query(
      'UPDATE memory_items SET last_used_at = now() WHERE id = ANY($1::text[])',
      [ids]
    )
  }

  /**
   * Soft-archive a memory row. Sets `archived_at = now()` so subsequent
   * filters (which include `archived_at IS NULL`) skip it. Used by
   * `UserSkillExtractor` to retire stale / contradicted skills without
   * losing the audit trail.
   */
  async archiveMemory(id: string): Promise<void> {
    await this.ensureTables()
    await pool.query(
      'UPDATE memory_items SET archived_at = now() WHERE id = $1 AND archived_at IS NULL',
      [id]
    )
  }

  /**
   * F6 · GDPR / PIPL data export. Returns every user-owned row across
   * every workspace as a flat JSON-serialisable bundle. Schema is
   * stable + versioned so users can re-process old exports later.
   */
  async exportUserData(userId: string): Promise<{
    schemaVersion: number
    exportedAt: string
    userId: string
    sessions: ConversationSession[]
    messages: ConversationMessage[]
    memoryItems: MemoryItem[]
    knowledgeBases: Array<Record<string, unknown>>
    knowledgeDocuments: Array<Record<string, unknown>>
  }> {
    await this.ensureTables()

    // P14 P3 · export sessions via the new conversations + current run JOIN.
    const sessions = await pool.query(
      `SELECT r.*, c.title AS c_title, c.opened_at AS c_opened_at, c.closed_at AS c_closed_at
         FROM conversations c
         JOIN runs r ON r.id = c.current_run_id
        WHERE c.user_id = $1
        ORDER BY c.opened_at ASC`,
      [userId]
    )
    const messages = await pool.query(
      `SELECT * FROM conversation_messages WHERE user_id = $1 ORDER BY created_at ASC`,
      [userId]
    )
    // Include archived memory rows so the user has full audit of what
    // was ever inferred — even items they later flagged or deleted.
    const memoryItems = await pool.query(
      `SELECT * FROM memory_items WHERE user_id = $1 ORDER BY created_at ASC`,
      [userId]
    )

    let kbsRows: Array<Record<string, unknown>> = []
    let kbDocs: Array<Record<string, unknown>> = []
    try {
      const kbs = await pool.query(
        `SELECT id, workspace_id, name, status, visibility, owner_user_id,
                created_at, updated_at, published_at
           FROM kb_definitions
          WHERE owner_user_id = $1
          ORDER BY created_at ASC`,
        [userId]
      )
      kbsRows = kbs.rows
      const docs = await pool.query(
        `SELECT d.id, d.workspace_id, d.kb_id, d.title, d.content,
                d.content_type, d.source_url, d.metadata,
                d.created_at, d.updated_at
           FROM kb_documents d
           JOIN kb_definitions kb ON kb.id = d.kb_id
          WHERE kb.owner_user_id = $1
          ORDER BY d.created_at ASC`,
        [userId]
      )
      kbDocs = docs.rows
    } catch {
      // kb_* tables may not exist; export is still valuable without them.
    }

    return {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      userId,
      sessions: sessions.rows.map((row: Record<string, unknown>) => rowFromRunAndConversation(row, {
        title: row.c_title,
        opened_at: row.c_opened_at,
        closed_at: row.c_closed_at
      })),
      messages: messages.rows.map((row: Record<string, unknown>) => rowToMessage(row)),
      memoryItems: memoryItems.rows.map((row: Record<string, unknown>) => rowToMemory(row)),
      knowledgeBases: kbsRows,
      knowledgeDocuments: kbDocs
    }
  }

  /**
   * P2 · listMemoriesForUser — user-scoped memory list.
   *
   * Returns rows where:
   *   - user_id = $userId  (always — no override possible)
   *   - archived_at IS NULL
   *   - workspace_id = $workspaceId  (when provided)
   *     OR workspace_id IS NULL  (cross-workspace personal rows)
   *   - kind = $kind  (when provided)
   *   - (title ILIKE $query OR content ILIKE $query)  (when provided)
   *
   * When workspaceId is null/omitted, returns ONLY scope='user' global
   * rows (e.g. cross-workspace user-skill traits) — workspace-scoped
   * rows from any workspace are excluded to avoid leaking inferences
   * from one workspace into the unrelated context of another.
   */
  /**
   * @deprecated P14 P5 · use {@link MemoryRetrievalService.retrieve} instead:
   *   retrieve({ layers: ['user', 'workspace'], userId,
   *              workspaceId, categories: kind ? [mapKindToCategory(kind)] : undefined,
   *              rankBy: 'recency', topK: limit })
   * Powers the GraphQL `memoryByUser` query (UI memory drawer).
   */
  async listMemoriesForUser(opts: {
    userId: string
    workspaceId?: string | null
    kind?: string | null
    query?: string | null
    limit?: number | null
  }): Promise<MemoryItem[]> {
    await this.ensureTables()
    const limit = clampLimit(opts.limit ?? 50, 1, 200)
    const params: unknown[] = [opts.userId]
    const conditions: string[] = ['user_id = $1', 'archived_at IS NULL']
    if (opts.workspaceId) {
      params.push(opts.workspaceId)
      conditions.push(`workspace_id = $${params.length}`)
    } else {
      // Cross-workspace personal scope only.
      conditions.push(`workspace_id IS NULL`)
    }
    if (opts.kind) {
      params.push(opts.kind)
      conditions.push(`kind = $${params.length}`)
    }
    if (opts.query && opts.query.trim().length > 0) {
      params.push(`%${opts.query.trim()}%`)
      conditions.push(`(title ILIKE $${params.length} OR content ILIKE $${params.length})`)
    }
    params.push(limit)
    const result = await pool.query(
      `SELECT * FROM memory_items
        WHERE ${conditions.join(' AND ')}
        ORDER BY updated_at DESC
        LIMIT $${params.length}`,
      params
    )
    return result.rows.map((row: Record<string, unknown>) => rowToMemory(row))
  }

  /**
   * P2 · listKnowledgeEvidenceForUser — reverse-lookup KB citations
   * across the user's memory rows.
   *
   * Scans memory_items.metadata->>'knowledgeEvidence' (JSONB array of
   * { kbId, chunkId, snippet, score } objects, written by
   * writeConversationSummary when KB chunks were used) and unpacks
   * each entry into a flat KnowledgeEvidenceRef row.
   *
   * Lets the front-end "MEMORY · KB 引用" tab show which conversations
   * cited which KB documents.
   */
  async listKnowledgeEvidenceForUser(opts: {
    userId: string
    workspaceId?: string | null
    limit?: number | null
  }): Promise<Array<{
    memoryItemId: string
    workspaceId: string
    docId: string
    snippet: string | null
    score: number | null
    citedAt: string
    sourceTitle: string
  }>> {
    await this.ensureTables()
    const limit = clampLimit(opts.limit ?? 100, 1, 500)
    const params: unknown[] = [opts.userId]
    const conditions: string[] = [
      'user_id = $1',
      'archived_at IS NULL',
      `metadata ? 'knowledgeEvidence'`,
      `jsonb_array_length(metadata->'knowledgeEvidence') > 0`
    ]
    if (opts.workspaceId) {
      params.push(opts.workspaceId)
      conditions.push(`workspace_id = $${params.length}`)
    }
    params.push(limit)
    const result = await pool.query(
      `SELECT id, workspace_id, title, updated_at, metadata->'knowledgeEvidence' AS evidence
         FROM memory_items
        WHERE ${conditions.join(' AND ')}
        ORDER BY updated_at DESC
        LIMIT $${params.length}`,
      params
    )
    type EvidenceRow = {
      id: string
      workspace_id: string
      title: string
      updated_at: Date | string
      evidence: Array<{ docId?: string; chunkId?: string; snippet?: string; score?: number }>
    }
    const flat: Array<{
      memoryItemId: string
      workspaceId: string
      docId: string
      snippet: string | null
      score: number | null
      citedAt: string
      sourceTitle: string
    }> = []
    for (const row of result.rows as EvidenceRow[]) {
      const evidence = Array.isArray(row.evidence) ? row.evidence : []
      for (const ev of evidence) {
        if (!ev?.docId) continue
        flat.push({
          memoryItemId: row.id,
          workspaceId: row.workspace_id,
          docId: ev.docId,
          snippet: ev.snippet ?? null,
          score: typeof ev.score === 'number' ? ev.score : null,
          citedAt: toIso(row.updated_at),
          sourceTitle: row.title
        })
      }
    }
    return flat.slice(0, limit)
  }

  /**
   * P2 · correctMemoryItem — apply user feedback to a memory row.
   *
   * Three operations in priority order (per design doc § 5.3):
   *   1. archive=true: set archived_at = now() and stop further
   *      mutations (returns the soft-deleted row)
   *   2. newContent != null: update content, append correction to
   *      metadata.userCorrections array, refresh updatedAt
   *   3. feedback != null: append to metadata.userFeedback array
   *      so the user-skill-extractor LLM has reinforcement signal
   *
   * Authorization: callerUserId must equal row.user_id. Throws
   * FORBIDDEN otherwise. Throws NOT_FOUND if the row doesn't exist.
   */
  async correctMemoryItem(opts: {
    itemId: string
    callerUserId: string
    newContent: string | null
    archive: boolean
    feedback: string | null
  }): Promise<MemoryItem> {
    await this.ensureTables()
    const existing = await pool.query(
      'SELECT * FROM memory_items WHERE id = $1 LIMIT 1',
      [opts.itemId]
    )
    if (!existing.rowCount) {
      throw new Error(`memory item not found: ${opts.itemId}`)
    }
    const row = existing.rows[0] as Record<string, unknown>
    if (row.user_id !== opts.callerUserId) {
      throw new Error(`FORBIDDEN: memory item belongs to another user`)
    }

    if (opts.archive) {
      await pool.query(
        'UPDATE memory_items SET archived_at = now(), updated_at = now() WHERE id = $1',
        [opts.itemId]
      )
      const after = await pool.query(
        'SELECT * FROM memory_items WHERE id = $1',
        [opts.itemId]
      )
      return rowToMemory(after.rows[0])
    }

    // Build metadata update preserving existing JSONB fields.
    const existingMetadata = parseJsonRecord(row.metadata) ?? {}
    const corrections = Array.isArray((existingMetadata as Record<string, unknown>).userCorrections)
      ? ((existingMetadata as Record<string, unknown>).userCorrections as unknown[])
      : []
    const feedbacks = Array.isArray((existingMetadata as Record<string, unknown>).userFeedback)
      ? ((existingMetadata as Record<string, unknown>).userFeedback as unknown[])
      : []
    const nowIso = new Date().toISOString()
    if (opts.newContent != null) {
      corrections.push({
        previousContent: row.content,
        correctedAt: nowIso
      })
    }
    if (opts.feedback != null && opts.feedback.trim().length > 0) {
      feedbacks.push({ text: opts.feedback.trim(), at: nowIso })
    }
    const newMetadata = {
      ...existingMetadata,
      userCorrections: corrections,
      userFeedback: feedbacks,
      lastCorrectedBy: opts.callerUserId,
      lastCorrectedAt: nowIso
    }

    if (opts.newContent != null) {
      await pool.query(
        `UPDATE memory_items
            SET content = $2, metadata = $3::jsonb, updated_at = now()
          WHERE id = $1`,
        [opts.itemId, opts.newContent, JSON.stringify(newMetadata)]
      )
    } else {
      // feedback-only: write metadata change only
      await pool.query(
        `UPDATE memory_items
            SET metadata = $2::jsonb, updated_at = now()
          WHERE id = $1`,
        [opts.itemId, JSON.stringify(newMetadata)]
      )
    }
    const after = await pool.query(
      'SELECT * FROM memory_items WHERE id = $1',
      [opts.itemId]
    )
    return rowToMemory(after.rows[0])
  }
}

function buildMemoryFilters(
  workspaceId: string,
  options: Pick<MemorySearchOptions, 'scope' | 'kind' | 'userId' | 'includeGlobalUser'> = {}
) {
  const params: unknown[] = [workspaceId]
  // includeGlobalUser widens the workspace match to also include cross-user
  // global rows (workspace_id IS NULL). Used by user-skill reads which want
  // both per-idea (scope='workspace') AND per-user (scope='user') in the
  // same query.
  const workspaceFilter = options.includeGlobalUser
    ? '(workspace_id = $1 OR workspace_id IS NULL)'
    : 'workspace_id = $1'
  const filters = [workspaceFilter, 'archived_at IS NULL']

  if (options.scope) {
    params.push(options.scope)
    filters.push(`scope = $${params.length}`)
  }
  if (options.kind) {
    params.push(options.kind)
    filters.push(`kind = $${params.length}`)
  }
  if (options.userId) {
    params.push(options.userId)
    filters.push(`user_id = $${params.length}`)
  }

  return { filters, params }
}

function renderMemoryEmbeddingInput(input: UpsertMemoryInput) {
  return [
    input.title,
    input.content,
    input.kind ?? 'insight',
    input.scope ?? 'workspace',
    ...(input.tags ?? [])
  ]
    .filter(Boolean)
    .join('\n')
}

function rowToSession(row: Record<string, unknown>): ConversationSession {
  return conversationSessionSchema.parse({
    id: row.id,
    workspaceId: row.workspace_id,
    userId: row.user_id,
    title: row.title,
    status: row.status,
    latestQuestion: row.latest_question ?? null,
    contextSnapshot: parseJsonRecord(row.context_snapshot),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    completedAt: row.completed_at ? toIso(row.completed_at) : null,
    heartbeatAt: row.heartbeat_at ? toIso(row.heartbeat_at) : null,
    ownerPid: (row.owner_pid as string | undefined) ?? null,
    failureReason: (row.failure_reason as string | undefined) ?? null
  })
}

/** P14 P3 · synthesize the legacy ConversationSession view from a runs row
 *  + the parent conversations row. The "session" abstraction is preserved
 *  for back-compat; underneath, each call hits both new tables.
 *
 *  - id        ← conversations.id (i.e. the conversationId)
 *  - title     ← conversations.title
 *  - createdAt ← conversations.opened_at
 *  - completedAt ← conversations.closed_at OR run.completed_at
 *  - status / latestQuestion / contextSnapshot / heartbeatAt / ownerPid /
 *    failureReason ← run-level fields
 */
function rowFromRunAndConversation(
  run: Record<string, unknown>,
  conv: Record<string, unknown> | undefined
): ConversationSession {
  const synthesized: Record<string, unknown> = {
    id: run.conversation_id ?? run.id,
    workspace_id: run.workspace_id,
    user_id: run.user_id,
    title: conv?.title ?? '',
    status: mapRunStatusToLegacy(String(run.status ?? 'streaming')),
    latest_question: run.latest_question ?? null,
    context_snapshot: run.context_snapshot,
    created_at: conv?.opened_at ?? run.started_at,
    updated_at: run.heartbeat_at ?? run.started_at,
    completed_at: conv?.closed_at ?? run.completed_at ?? null,
    heartbeat_at: run.heartbeat_at ?? null,
    owner_pid: run.owner_pid ?? null,
    failure_reason: run.failure_reason ?? null
  }
  return rowToSession(synthesized)
}

/** Map run-table status enum to the legacy session status. */
function mapRunStatusToLegacy(runStatus: string): ConversationSession['status'] {
  switch (runStatus) {
    case 'queued':
    case 'streaming':
    case 'waiting-hitl':
      return 'running'
    case 'completed':
      return 'completed'
    case 'failed':
      return 'failed'
    case 'cancelled':
      return 'archived'
    default:
      return 'running'
  }
}

/** Reverse mapping for createSession + updateSessionStatus. */
function mapLegacyToRunStatus(legacy: ConversationSession['status']): string {
  switch (legacy) {
    case 'running':
      return 'streaming'
    case 'completed':
      return 'completed'
    case 'failed':
      return 'failed'
    case 'archived':
      return 'cancelled'
    default:
      return 'streaming'
  }
}

function rowToMessage(row: Record<string, unknown>): ConversationMessage {
  return conversationMessageSchema.parse({
    id: row.id,
    conversationId: row.conversation_id,
    workspaceId: row.workspace_id,
    userId: row.user_id ?? null,
    role: row.role,
    content: row.content,
    metadata: parseJsonRecord(row.metadata),
    createdAt: toIso(row.created_at)
  })
}

function rowToMemory(row: Record<string, unknown>): MemoryItem {
  // For user-skill rows, decrypt the sensitive fields at the storage
  // boundary so the rest of the codebase sees plaintext. Non-user-skill
  // rows pass through `decryptIfNeeded` which is a no-op for non-prefixed
  // values — zero overhead for the common case.
  const isUserSkill = row.kind === 'user-skill'
  const rawMetadata = parseJsonRecord(row.metadata)
  return memoryItemSchema.parse({
    id: row.id,
    workspaceId: row.workspace_id,
    userId: row.user_id ?? null,
    // P14 · canonical axes — undefined when reading rows written before
    // migration 016 ran on a non-runtime-DDL database.
    layer: typeof row.layer === 'string' ? row.layer : undefined,
    facet: typeof row.facet === 'string' ? row.facet : undefined,
    category: typeof row.category === 'string' ? row.category : undefined,
    scope: row.scope,
    kind: row.kind,
    title: isUserSkill ? decryptIfNeeded(row.title as string) : row.title,
    content: isUserSkill ? decryptIfNeeded(row.content as string) : row.content,
    sourceType: row.source_type,
    sourceId: row.source_id ?? null,
    importance: Number(row.importance ?? 0.5),
    confidence: Number(row.confidence ?? 0.7),
    tags: Array.isArray(row.tags) ? row.tags : [],
    metadata: isUserSkill
      ? (decryptUserSkillMetadata(rawMetadata) as JsonRecord)
      : rawMetadata,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    lastUsedAt: row.last_used_at ? toIso(row.last_used_at) : null,
    archivedAt: row.archived_at ? toIso(row.archived_at) : null
  })
}

function parseJsonRecord(value: unknown): JsonRecord {
  if (!value) return {}
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as JsonRecord
    } catch {
      return {}
    }
  }
  return value as JsonRecord
}

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'string') return new Date(value).toISOString()
  return new Date().toISOString()
}

function clampLimit(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.floor(value)))
}

function clampScore(value: number) {
  return Math.max(0, Math.min(1, value))
}

function scoreMemories(memories: MemoryItem[], query: string): MemoryItem[] {
  const tokens = tokenize(query)
  if (tokens.length === 0) return memories

  return memories
    .map((memory) => {
      const haystack = `${memory.title} ${memory.content} ${memory.tags.join(' ')}`.toLowerCase()
      const matches = tokens.filter((token) => haystack.includes(token)).length
      const score = matches / tokens.length + memory.importance * 0.25 + memory.confidence * 0.1
      return { memory, score }
    })
    .filter((item) => item.score > 0.15)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.memory)
}

function tokenize(text: string): string[] {
  return [...new Set(
    text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .map((item) => item.trim())
      .filter((item) => item.length > 1)
  )]
}

function summarizeGraphForMemory(graph: CanvasGraph): string {
  const highlights = graph.nodes
    .map((node) => {
      const data = node.data as { title?: string; content?: string; summary?: string; meta?: JsonRecord }
      const title = data.title ?? node.id
      const content = data.content ?? data.summary ?? ''
      const domain = typeof data.meta?.domain === 'string' ? `（${data.meta.domain}）` : ''
      return `- ${title}${domain}: ${truncate(content.replace(/\s+/g, ' '), 140)}`
    })
    .filter((line) => !line.endsWith(': '))
    .slice(0, 12)

  if (highlights.length === 0) return ''
  return [
    `节点数：${graph.nodes.length}，连线数：${graph.edges.length}`,
    ...highlights
  ].join('\n')
}

function truncate(text: string, max: number) {
  const value = text.trim()
  if (value.length <= max) return value
  return `${value.slice(0, Math.max(0, max - 1))}…`
}
