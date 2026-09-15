/**
 * Knowledge-Base Store (2026-04-28).
 *
 * Replaces the external task-service the previous `kb-task-service.ts` was
 * a thin HTTP client of. Implementation lives entirely in-repo: pgvector
 * for chunk embeddings (reuses the same pool + the same `embedText` helper
 * already used by `ConversationMemoryStore`), simple paragraph-based
 * chunker, single-table-per-concern schema.
 *
 * Two tables, both auto-DDL'd on first use (mirrors `ensureTables` pattern
 * from ConversationMemoryStore):
 *
 *   kb_documents — one row per ingested document
 *     id, workspace_id, kb_id, title, content, content_type, source_url,
 *     metadata, created_at, updated_at
 *
 *   kb_chunks    — chunked + embedded segments of a document
 *     id, kb_id, doc_id (FK → kb_documents.id), chunk_index, content,
 *     embedding VECTOR(1536), metadata, created_at
 *
 * Public surface used by `kb-task-service.ts`:
 *
 *   - addDocument({ kbId, workspaceId, title, content, ... })
 *       → chunks, embeds, inserts; returns { docId, chunkCount }
 *   - searchChunks(kbId, query, topK?)
 *       → vector cosine search; returns KnowledgeSearchResult[]
 *   - listDocuments(kbId, workspaceId)
 *       → admin listing
 *   - removeDocument(docId)
 *       → cascades to chunks via FK
 *
 * Knowledge-base lifecycle (`createKnowledgeBase`, `publishKnowledgeBase`,
 * etc) is intentionally NOT modelled here — those map to a separate
 * lightweight `kb_definitions` table managed elsewhere when needed. For
 * the RAG path the `kbId` is just a partition key on these two tables;
 * documents can be inserted without any prior "create KB" step.
 */

import { nanoid } from 'nanoid'
import { pool } from '../infrastructure/db/pool.js'
import { embedText, toPgVector } from '../services/embedding-service.js'
import {
  detectContentType,
  extractBinary,
  extractText,
  isBinaryContentType,
  normalizeContentType
} from './kb-extractor.js'
import type { KnowledgeSearchResult } from '@starlink/shared'

// =============================================================================
// Schema (auto-DDL)
// =============================================================================

const KB_DDL = `
  CREATE TABLE IF NOT EXISTS kb_documents (
    id           TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    kb_id        TEXT NOT NULL,
    title        TEXT NOT NULL,
    content      TEXT NOT NULL,
    content_type TEXT NOT NULL DEFAULT 'text/plain',
    source_url   TEXT,
    metadata     JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE INDEX IF NOT EXISTS idx_kb_documents_kb_id ON kb_documents(kb_id);
  CREATE INDEX IF NOT EXISTS idx_kb_documents_workspace_id ON kb_documents(workspace_id);

  CREATE TABLE IF NOT EXISTS kb_chunks (
    id          TEXT PRIMARY KEY,
    kb_id       TEXT NOT NULL,
    doc_id      TEXT NOT NULL REFERENCES kb_documents(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    content     TEXT NOT NULL,
    embedding   VECTOR(1536),
    metadata    JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE INDEX IF NOT EXISTS idx_kb_chunks_kb_id ON kb_chunks(kb_id);
  CREATE INDEX IF NOT EXISTS idx_kb_chunks_doc_id ON kb_chunks(doc_id);
  CREATE INDEX IF NOT EXISTS idx_kb_chunks_embedding
    ON kb_chunks USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100)
    WHERE embedding IS NOT NULL;
`

// =============================================================================
// Chunking
// =============================================================================

/**
 * Lightweight paragraph + length chunker. Splits on double newlines first
 * (paragraphs), then merges adjacent paragraphs until each chunk is roughly
 * `targetChars` long, with `overlapChars` carryover at the boundary so
 * cross-paragraph context isn't lost on retrieval.
 *
 * Char-based instead of token-based intentionally — token counting per LLM
 * provider varies; chars are a stable proxy for Chinese + English mixed
 * input. ~600 chars ≈ 200-400 tokens depending on language.
 */
export function chunkText(
  text: string,
  options: { targetChars?: number; overlapChars?: number } = {}
): string[] {
  const targetChars = Math.max(200, options.targetChars ?? 600)
  const overlapChars = Math.max(0, options.overlapChars ?? 80)

  const cleaned = text.trim()
  if (cleaned.length === 0) return []
  if (cleaned.length <= targetChars) return [cleaned]

  const paragraphs = cleaned.split(/\n{2,}/g).map((p) => p.trim()).filter(Boolean)
  const chunks: string[] = []
  let buf = ''

  for (const p of paragraphs) {
    if (buf.length === 0) {
      buf = p
      continue
    }
    if (buf.length + 1 + p.length <= targetChars) {
      buf = `${buf}\n\n${p}`
    } else {
      chunks.push(buf)
      // Carry over the tail of the previous chunk for overlap.
      const carry = overlapChars > 0 ? buf.slice(Math.max(0, buf.length - overlapChars)) : ''
      buf = carry ? `${carry}\n\n${p}` : p
    }
  }
  if (buf) chunks.push(buf)

  // If a single paragraph is bigger than target, hard-split it.
  const final: string[] = []
  for (const c of chunks) {
    if (c.length <= targetChars * 1.5) {
      final.push(c)
      continue
    }
    for (let i = 0; i < c.length; i += targetChars) {
      const piece = c.slice(i, i + targetChars)
      if (piece.trim()) final.push(piece)
    }
  }
  return final
}

// =============================================================================
// Lexical tokenizer (P11.18 hybrid retrieval)
// =============================================================================

/**
 * Tokenise a query into terms suitable for lexical (substring) match.
 *
 * - Latin / digits: extract `[a-z0-9]+` runs ≥ 3 chars, lowercased.
 * - CJK: 2-char bigrams (preserves common Chinese phrase structure;
 *   unigrams are too noisy because most single Chinese chars are too
 *   common — e.g. "的" appears in every chunk).
 *
 * Deduplicated. Used inline in PG via `unnest($tokens::text[])` +
 * ILIKE — no PG extension required.
 */
export function tokenizeForLexical(query: string): string[] {
  const lower = query.toLowerCase()
  const latin = lower.match(/[a-z0-9]{3,}/g) ?? []
  const cjk = Array.from(query.match(/[㐀-鿿]/g) ?? [])
  const cjkBigrams: string[] = []
  for (let i = 0; i + 1 < cjk.length; i++) {
    cjkBigrams.push(`${cjk[i]}${cjk[i + 1]}`)
  }
  const all = [...latin, ...cjkBigrams]
  // Deduplicate while preserving order.
  return Array.from(new Set(all)).filter((t) => t.length >= 2)
}

// =============================================================================
// Store
// =============================================================================

export interface AddDocumentInput {
  kbId: string
  workspaceId: string
  title: string
  /**
   * Document content. For text formats (txt/md/html/json) pass UTF-8
   * string; for binary formats (pdf/docx/xlsx) pass a Node Buffer.
   * extractor selection is driven by contentType + fileName sniffing.
   */
  content: string | Buffer
  contentType?: string
  sourceUrl?: string | null
  metadata?: Record<string, unknown>
  /** Optional file name — used to disambiguate octet-stream uploads. */
  fileName?: string
  /** Optional. When provided, upserts (replaces existing chunks). */
  docId?: string
}

export interface AddDocumentResult {
  docId: string
  chunkCount: number
}

export interface KbDocumentRow {
  id: string
  workspaceId: string
  kbId: string
  title: string
  content: string
  contentType: string
  sourceUrl: string | null
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export class KbStore {
  private ddlPromise: Promise<void> | null = null

  private ensureTables(): Promise<void> {
    if (!this.ddlPromise) {
      this.ddlPromise = pool.query(KB_DDL).then(
        () => undefined,
        (err: unknown) => {
          // If the pgvector extension isn't installed, surface a clear
          // message instead of the cryptic "type \"vector\" does not exist".
          throw new Error(
            `kb-store: schema setup failed (${err instanceof Error ? err.message : String(err)}). ` +
              'Verify the pgvector extension is installed: CREATE EXTENSION vector;'
          )
        }
      )
    }
    return this.ddlPromise as Promise<void>
  }

  /**
   * Insert (or replace, when `docId` is provided) a document.
   *
   * Pipeline:
   *   1. Resolve content-type: explicit `contentType` arg wins; if missing,
   *      sniff from content via kb-extractor.detectContentType.
   *   2. Extract prose: kb-extractor.extractText handles plaintext /
   *      markdown / html / json natively; throws on PDF with install hint.
   *   3. Chunk the prose via chunkText.
   *   4. Embed each chunk and persist atomically.
   *
   * The original raw content is still stored on `kb_documents.content` so
   * downstream consumers can re-extract / re-chunk if format support
   * improves later (e.g. PDF library is added).
   */
  async addDocument(input: AddDocumentInput): Promise<AddDocumentResult> {
    await this.ensureTables()
    const docId = input.docId ?? nanoid()
    const isBuffer = Buffer.isBuffer(input.content)

    // Resolve content-type. For binary inputs (Buffer), respect the
    // declared contentType (string heuristics on PDF bytes are
    // unreliable). For text inputs, sniff via detectContentType.
    const resolvedContentType = isBuffer
      ? normalizeContentType(input.contentType ?? 'application/octet-stream')
      : (input.contentType && input.contentType !== 'text/plain'
          ? normalizeContentType(input.contentType)
          : detectContentType(input.content as string, input.contentType))

    // Route through the matching extractor. Binary path covers
    // PDF / DOCX / XLSX; text path covers UTF-8 strings.
    let prose: string
    if (isBuffer || isBinaryContentType(resolvedContentType, input.fileName)) {
      const buffer = isBuffer ? (input.content as Buffer) : Buffer.from(input.content as string, 'utf-8')
      prose = await extractBinary(buffer, resolvedContentType, { fileName: input.fileName })
    } else {
      prose = extractText(input.content as string, resolvedContentType)
    }

    const chunks = chunkText(prose)
    if (chunks.length === 0) {
      throw new Error('kb-store.addDocument: empty content after extraction + chunking')
    }

    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      // Upsert document row. Binary content (PDF/DOCX/XLSX) is stored
      // as the EXTRACTED PROSE — original bytes are not persisted.
      // Rationale: kb_documents.content is TEXT; storing raw PDF bytes
      // there breaks utf-8 invariants. If the user later wants to
      // re-extract with a better parser, they re-upload the file.
      // Text content stays as-is.
      const contentToStore = isBuffer ? prose : (input.content as string)
      await client.query(
        `INSERT INTO kb_documents (
           id, workspace_id, kb_id, title, content, content_type,
           source_url, metadata, created_at, updated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, now(), now())
         ON CONFLICT (id) DO UPDATE SET
           title = EXCLUDED.title,
           content = EXCLUDED.content,
           content_type = EXCLUDED.content_type,
           source_url = EXCLUDED.source_url,
           metadata = EXCLUDED.metadata,
           updated_at = now()`,
        [
          docId,
          input.workspaceId,
          input.kbId,
          input.title,
          contentToStore,
          // Persist the RESOLVED content type (after sniffing), not the
          // raw input arg — so listDocuments shows what was actually
          // detected. Original raw arg lives in metadata for audit.
          resolvedContentType,
          input.sourceUrl ?? null,
          JSON.stringify({
            ...(input.metadata ?? {}),
            originalContentTypeArg: input.contentType ?? null,
            originalFileName: input.fileName ?? null,
            originalSizeBytes: isBuffer ? (input.content as Buffer).byteLength : null
          })
        ]
      )

      // Drop pre-existing chunks for upsert path. ON DELETE CASCADE on
      // kb_chunks.doc_id is the schema-level guarantee, but explicit DELETE
      // here matches the "replace all chunks" semantics callers expect.
      await client.query('DELETE FROM kb_chunks WHERE doc_id = $1', [docId])

      // F1 · Resolve owner + visibility from parent kb_definitions so
      // chunk-level columns stay denormalised in sync with KB ownership.
      // RLS on kb_chunks reads these columns directly. If the parent KB
      // doesn't exist yet (rare), fall back to '__legacy__' / 'workspace'
      // so the row remains queryable for cleanup.
      const kbDefRow = await client.query(
        `SELECT owner_user_id, visibility FROM kb_definitions WHERE id = $1 LIMIT 1`,
        [input.kbId]
      )
      const ownerUserId = (kbDefRow.rows[0]?.owner_user_id as string | undefined) ?? '__legacy__'
      const visibility = (kbDefRow.rows[0]?.visibility as string | undefined) ?? 'workspace'

      // Embed each chunk. We embed sequentially rather than in parallel —
      // most embedding providers rate-limit at ~3000 RPM, and a typical
      // document fits in 1-20 chunks; sequential is simpler and well within
      // the budget. If profiling shows it matters, switch to Promise.all.
      for (let i = 0; i < chunks.length; i++) {
        const chunkContent = chunks[i]
        const embedding = await embedText(chunkContent)
        await client.query(
          `INSERT INTO kb_chunks (
             id, kb_id, doc_id, chunk_index, content,
             embedding, metadata, created_at,
             workspace_id, owner_user_id, visibility
           )
           VALUES ($1, $2, $3, $4, $5, $6::vector, $7::jsonb, now(), $8, $9, $10)`,
          [
            nanoid(),
            input.kbId,
            docId,
            i,
            chunkContent,
            toPgVector(embedding.vector),
            JSON.stringify({
              embeddingProvider: embedding.provider,
              embeddingModel: embedding.model,
              chunkIndex: i,
              ...(input.metadata ?? {})
            }),
            input.workspaceId,
            ownerUserId,
            visibility
          ]
        )
      }

      await client.query('COMMIT')
      return { docId, chunkCount: chunks.length }
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined)
      throw err
    } finally {
      client.release()
    }
  }

  /**
   * Vector cosine search across this KB's chunks. Returns top-K results
   * shaped to match `KnowledgeSearchResult` from @starlink/shared so
   * callers downstream (BMC generator's knowledgeContext renderer, etc)
   * don't need adapter code.
   */
  async searchChunks(
    kbId: string,
    query: string,
    topK = 5,
    /**
     * F1 · Optional visibility filter applied at the SQL layer in
     * addition to RLS. Pass userId + workspaceId so the application
     * matches RLS policy on private chunks (only owner sees) without
     * relying on RLS context being set (which requires withUserContext
     * — not all callers wrap their query). Belt-and-suspenders.
     *
     * P11.17 · `minScore` — drop results below the similarity floor
     * (cosine similarity = 1 - distance). Default 0.55 prevents
     * returning random low-confidence chunks when the query is
     * semantically off-topic for the KB. Override per call when
     * needed (e.g. memory search may want minScore=0.4).
     *
     * When omitted, the chunk list is unfiltered beyond kb_id (legacy
     * behaviour); RLS still applies if the connection has
     * app.current_user_id set.
     */
    options: {
      callerUserId?: string
      callerWorkspaceId?: string
      minScore?: number
      /** Force-enable hybrid retrieval for this call regardless of env flag. */
      hybrid?: boolean
    } = {}
  ): Promise<KnowledgeSearchResult[]> {
    await this.ensureTables()
    const trimmed = query.trim()
    if (!trimmed) return []

    // P11.18 · transparent hybrid retrieval. When enabled (env or per-call
    // override), route through searchChunksHybrid which fuses vector +
    // lexical via RRF. We still apply the post-filter `minScore` in
    // hybrid mode against the SEMANTIC sub-score (hybridSemScore in
    // metadata) — pure RRF scores aren't comparable to cosine.
    const hybridEnabled = options.hybrid ??
      (process.env.RAG_HYBRID_ENABLED === 'true' || process.env.RAG_HYBRID_ENABLED === '1')
    if (hybridEnabled) {
      const all = await this.searchChunksHybrid(kbId, trimmed, topK, {
        callerUserId: options.callerUserId,
        callerWorkspaceId: options.callerWorkspaceId
      })
      const minScore = typeof options.minScore === 'number'
        ? options.minScore
        : Number(process.env.KB_SEARCH_MIN_SCORE ?? '0.55')
      // Filter by semantic component — RRF rank-fusion guarantees the
      // chunk made it because of EITHER signal. We only drop a chunk
      // when its semantic similarity is below floor AND lexical hits=0
      // (i.e. it sneaked in via a single weak lexical match without
      // any semantic backing).
      return all.filter((r) => {
        const sem = Number(r.metadata?.hybridSemScore ?? 0)
        const lex = Number(r.metadata?.hybridLexHits ?? 0)
        return sem >= minScore || lex >= 2
      })
    }

    const embedding = await embedText(trimmed)
    const limit = Math.max(1, Math.min(50, Math.floor(topK)))

    // Build visibility filter:
    //   - 'global' → always visible
    //   - 'workspace' → must match callerWorkspaceId (when provided)
    //   - 'private' → must match callerUserId (when provided)
    // When neither caller hint is provided, return all chunks for the
    // kb_id (callers without identity context are typically internal
    // admin/migration paths).
    const params: unknown[] = [kbId, toPgVector(embedding.vector)]
    let visibilityFilter = ''
    if (options.callerUserId || options.callerWorkspaceId) {
      const clauses: string[] = ["visibility = 'global'"]
      if (options.callerWorkspaceId) {
        params.push(options.callerWorkspaceId)
        clauses.push(`(visibility = 'workspace' AND workspace_id = $${params.length})`)
      }
      if (options.callerUserId) {
        params.push(options.callerUserId)
        clauses.push(`(visibility = 'private' AND owner_user_id = $${params.length})`)
      }
      visibilityFilter = ` AND (${clauses.join(' OR ')})`
    }
    params.push(limit)

    // Cosine distance: lower is closer; 1 - distance ≈ similarity.
    const result = await pool.query(
      `SELECT doc_id,
              content,
              chunk_index,
              embedding <=> $2::vector AS distance,
              metadata
       FROM kb_chunks
       WHERE kb_id = $1 AND embedding IS NOT NULL${visibilityFilter}
       ORDER BY embedding <=> $2::vector ASC
       LIMIT $${params.length}`,
      params
    )

    const all = (result.rows as Array<Record<string, unknown>>).map((row) => ({
      docId: row.doc_id as string,
      snippet: row.content as string,
      score: 1 - Number(row.distance ?? 1),
      metadata: {
        ...(((row.metadata as Record<string, unknown>) ?? {})),
        chunkIndex: row.chunk_index as number
      }
    }))
    // P11.17 · score-threshold filter. With local-hash embeddings or
    // genuinely off-topic queries the cosine similarity is near-random;
    // dropping results below the floor avoids polluting the agent's
    // context with noise. The default 0.55 is conservative — a real
    // domain match typically scores 0.7+.
    const minScore = typeof options.minScore === 'number'
      ? options.minScore
      : Number(process.env.KB_SEARCH_MIN_SCORE ?? '0.55')
    return all.filter((r) => r.score >= minScore)
  }

  /**
   * P11.18 · Hybrid retrieval (BM25-ish lexical + vector cosine, fused
   * via Reciprocal Rank Fusion).
   *
   * Why hybrid: pure vector cosine misses cases where the query term
   * appears verbatim in the chunk but the surrounding semantics differ
   * (e.g. exact product names, acronyms, numeric thresholds). Pure
   * lexical misses paraphrases. RRF requires no score normalisation:
   * each chunk gets `Σ 1 / (k + rank_in_each_ranker)` (k=60 is the
   * paper-default), so a chunk ranked top-3 in BOTH rankers beats a
   * chunk ranked top-1 in just one.
   *
   * Tokenisation runs in Node (no new PG extension): Latin words ≥3
   * chars + CJK 2-char bigrams. For each token we ask PG
   * `content ILIKE '%token%'` and count hits — cheap on small KBs,
   * trivially indexable later via pg_trgm if a KB grows past ~10k chunks.
   */
  async searchChunksHybrid(
    kbId: string,
    query: string,
    topK = 5,
    options: {
      callerUserId?: string
      callerWorkspaceId?: string
      /** RRF constant; smaller k = more aggressive top-rank weighting. Default 60. */
      rrfK?: number
      /** Override per-ranker candidate pool. Default = topK * 4. */
      poolSize?: number
    } = {}
  ): Promise<KnowledgeSearchResult[]> {
    await this.ensureTables()
    const trimmed = query.trim()
    if (!trimmed) return []

    const limit = Math.max(1, Math.min(50, Math.floor(topK)))
    const pool_ = Math.max(limit, options.poolSize ?? limit * 4)
    const k = Math.max(1, options.rrfK ?? 60)
    const tokens = tokenizeForLexical(trimmed)

    // Visibility filter shared across both rankers.
    const visParams: unknown[] = []
    let visibilityFilter = ''
    if (options.callerUserId || options.callerWorkspaceId) {
      const clauses: string[] = ["visibility = 'global'"]
      if (options.callerWorkspaceId) {
        visParams.push(options.callerWorkspaceId)
        clauses.push(`(visibility = 'workspace' AND workspace_id = $V_W)`)
      }
      if (options.callerUserId) {
        visParams.push(options.callerUserId)
        clauses.push(`(visibility = 'private' AND owner_user_id = $V_U)`)
      }
      visibilityFilter = ` AND (${clauses.join(' OR ')})`
    }

    // Ranker 1: vector cosine (top pool_).
    const embedding = await embedText(trimmed)
    const semParams: unknown[] = [kbId, toPgVector(embedding.vector)]
    let semVisFilter = visibilityFilter
    if (options.callerWorkspaceId) {
      semParams.push(options.callerWorkspaceId)
      semVisFilter = semVisFilter.replace('$V_W', `$${semParams.length}`)
    }
    if (options.callerUserId) {
      semParams.push(options.callerUserId)
      semVisFilter = semVisFilter.replace('$V_U', `$${semParams.length}`)
    }
    semParams.push(pool_)
    const semResult = await pool.query(
      `SELECT id, doc_id, content, chunk_index, metadata,
              embedding <=> $2::vector AS distance
         FROM kb_chunks
        WHERE kb_id = $1 AND embedding IS NOT NULL${semVisFilter}
        ORDER BY embedding <=> $2::vector ASC
        LIMIT $${semParams.length}`,
      semParams
    )

    // Ranker 2: lexical token-overlap. Score = number of distinct query
    // tokens present (case-insensitive substring). Ties broken by chunk
    // length (shorter chunks with hits are more focused).
    let lexResult: { rows: Array<Record<string, unknown>> } = { rows: [] }
    if (tokens.length > 0) {
      const lexParams: unknown[] = [kbId, tokens]
      let lexVisFilter = visibilityFilter
      if (options.callerWorkspaceId) {
        lexParams.push(options.callerWorkspaceId)
        lexVisFilter = lexVisFilter.replace('$V_W', `$${lexParams.length}`)
      }
      if (options.callerUserId) {
        lexParams.push(options.callerUserId)
        lexVisFilter = lexVisFilter.replace('$V_U', `$${lexParams.length}`)
      }
      lexParams.push(pool_)
      lexResult = await pool.query(
        `SELECT id, doc_id, content, chunk_index, metadata,
                (SELECT COUNT(*)::int FROM unnest($2::text[]) AS t
                  WHERE content ILIKE '%' || t || '%') AS lex_hits
           FROM kb_chunks
          WHERE kb_id = $1${lexVisFilter}
            AND EXISTS (
              SELECT 1 FROM unnest($2::text[]) AS t WHERE content ILIKE '%' || t || '%'
            )
          ORDER BY lex_hits DESC, length(content) ASC
          LIMIT $${lexParams.length}`,
        lexParams
      )
    }

    // RRF merge. Each chunk gets contributions from both rankers.
    type Row = {
      id: string
      docId: string
      content: string
      chunkIndex: number
      metadata: Record<string, unknown>
      semScore: number  // 1 - distance, for debug
      lexHits: number   // for debug
      rrf: number
    }
    const byId = new Map<string, Row>()
    ;(semResult.rows as Array<Record<string, unknown>>).forEach((row, idx) => {
      const id = row.id as string
      const distance = Number(row.distance ?? 1)
      byId.set(id, {
        id,
        docId: row.doc_id as string,
        content: row.content as string,
        chunkIndex: row.chunk_index as number,
        metadata: ((row.metadata as Record<string, unknown>) ?? {}),
        semScore: 1 - distance,
        lexHits: 0,
        rrf: 1 / (k + idx + 1)
      })
    })
    ;(lexResult.rows as Array<Record<string, unknown>>).forEach((row, idx) => {
      const id = row.id as string
      const existing = byId.get(id)
      const lexHits = Number(row.lex_hits ?? 0)
      if (existing) {
        existing.lexHits = lexHits
        existing.rrf += 1 / (k + idx + 1)
      } else {
        byId.set(id, {
          id,
          docId: row.doc_id as string,
          content: row.content as string,
          chunkIndex: row.chunk_index as number,
          metadata: ((row.metadata as Record<string, unknown>) ?? {}),
          semScore: 0,
          lexHits,
          rrf: 1 / (k + idx + 1)
        })
      }
    })
    void visParams // referenced to satisfy linter; visParams is captured by name-substituted SQL above

    return Array.from(byId.values())
      .sort((a, b) => b.rrf - a.rrf)
      .slice(0, limit)
      .map((row) => ({
        docId: row.docId,
        snippet: row.content,
        // Surface the FUSED score as the canonical `score`; expose
        // sub-scores via metadata so callers can debug.
        score: row.rrf,
        metadata: {
          ...row.metadata,
          chunkIndex: row.chunkIndex,
          hybridSemScore: row.semScore,
          hybridLexHits: row.lexHits,
          hybridRrf: row.rrf
        }
      }))
  }

  async listDocuments(
    kbId: string,
    workspaceId?: string
  ): Promise<KbDocumentRow[]> {
    await this.ensureTables()
    const filters = ['kb_id = $1']
    const params: unknown[] = [kbId]
    if (workspaceId) {
      params.push(workspaceId)
      filters.push(`workspace_id = $${params.length}`)
    }
    const result = await pool.query(
      `SELECT * FROM kb_documents
       WHERE ${filters.join(' AND ')}
       ORDER BY updated_at DESC
       LIMIT 200`,
      params
    )
    return (result.rows as Array<Record<string, unknown>>).map((row) => ({
      id: row.id as string,
      workspaceId: row.workspace_id as string,
      kbId: row.kb_id as string,
      title: row.title as string,
      content: row.content as string,
      contentType: row.content_type as string,
      sourceUrl: (row.source_url as string | null) ?? null,
      metadata: ((row.metadata as Record<string, unknown>) ?? {}),
      createdAt: new Date(row.created_at as string).toISOString(),
      updatedAt: new Date(row.updated_at as string).toISOString()
    }))
  }

  async removeDocument(docId: string): Promise<void> {
    await this.ensureTables()
    await pool.query('DELETE FROM kb_documents WHERE id = $1', [docId])
  }

  /** Test-only / admin: drop both tables. NOT used by production paths. */
  async dropAll(): Promise<void> {
    await pool.query('DROP TABLE IF EXISTS kb_chunks CASCADE')
    await pool.query('DROP TABLE IF EXISTS kb_documents CASCADE')
    this.ddlPromise = null
  }
}

let cachedStore: KbStore | null = null
export function getKbStore(): KbStore {
  if (!cachedStore) cachedStore = new KbStore()
  return cachedStore
}
