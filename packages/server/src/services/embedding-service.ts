import { isPiiRedactionEnabled, redactPii } from './pii-redactor.js'

const STORAGE_EMBEDDING_DIMENSIONS = 1536
const MAX_EMBEDDING_TEXT_LENGTH = Number(process.env.EMBEDDING_MAX_TEXT_LENGTH ?? '8000')

export type EmbeddingResult = {
  vector: number[]
  provider: 'openai-compatible' | 'local-hash'
  model: string
  dimensions: number
}

// Throttle the per-call fallback warning. Without this, every KB chunk
// upsert / search logs a line in production when no embedding key is
// set — fills disk and hides real issues. We log on the first fall-
// through and then summarise every Nth occurrence.
let fallbackCount = 0
const FALLBACK_LOG_EVERY = 100

/**
 * Boot-time embedding configuration check. Call once during server start
 * so operators see "embedding=remote/local-hash" loud and clear in the
 * startup log instead of discovering it 30 minutes later via degraded
 * KB search quality. Returns the configured mode for callers that want
 * to surface it elsewhere (e.g. /health response).
 */
/**
 * Explicit override: `EMBEDDING_PROVIDER=local-hash` (or `=disabled` / `=none`)
 * forces local-hash mode without any remote attempt. Set this when the
 * configured chat endpoint (e.g. DeepSeek `/beta`) doesn't host an
 * embeddings route — otherwise every KB chunk floods the log with
 * "Embedding API failed: 404 Not Found" before the fallback.
 */
function isLocalHashForced(): boolean {
  const v = (process.env.EMBEDDING_PROVIDER ?? '').trim().toLowerCase()
  return v === 'local-hash' || v === 'local' || v === 'disabled' || v === 'none'
}

export function describeEmbeddingConfig(): {
  mode: 'remote' | 'local-hash'
  baseUrl: string | null
  model: string | null
  warning: string | null
} {
  if (isLocalHashForced()) {
    return {
      mode: 'local-hash',
      baseUrl: null,
      model: null,
      warning: null
    }
  }
  const apiKey = process.env.EMBEDDING_API_KEY ?? process.env.OPENAI_API_KEY ?? process.env.LLM_API_KEY
  if (!apiKey) {
    return {
      mode: 'local-hash',
      baseUrl: null,
      model: null,
      warning:
        'No embedding API key configured. KB / memory vector search will use a deterministic local hash (poor quality). ' +
        'Set EMBEDDING_API_KEY (or OPENAI_API_KEY / LLM_API_KEY) for production-grade retrieval.'
    }
  }
  const baseUrl = stripTrailingSlash(
    process.env.EMBEDDING_BASE_URL ??
      process.env.OPENAI_BASE_URL ??
      process.env.LLM_BASE_URL ??
      'https://api.openai.com/v1'
  )
  return {
    mode: 'remote',
    baseUrl,
    model: process.env.EMBEDDING_MODEL ?? 'text-embedding-3-small',
    warning: null
  }
}

/**
 * P12 fix M3 · in-memory LRU cache for query-side embeddings.
 *
 * Wizard prefill makes ~25 embedText() calls per workspace — 7 steps
 * × ~3.5 phrasing variants (P12 fix M4). The seed queries are STATIC
 * (defined in wizard-prefill-service.STEP_SEEDS), so the FIRST
 * wizard pays the cost and every subsequent wizard hits cache.
 *
 * Aliyun text-embedding-v4 serializes per-API-key, so even with
 * Promise.all the wall-clock was ~26s for 25 unique queries. With
 * cache: first wizard ~26s (unchanged), next wizards ~ <500ms (PG
 * vector search only, no embedding API).
 *
 * Also helps repeated user queries with similar phrasing (e.g. typing
 * the same @-mention twice while iterating).
 *
 * LRU is keyed by `${redactedText}::${dimensions}` so a dimension
 * config change auto-invalidates. Capacity 500 entries × ~6KB per
 * 1536d vector = ~3MB; trivial. TTL 1h so stale embeddings don't
 * survive a model swap (rare).
 */
const EMBEDDING_CACHE_MAX = 500
const EMBEDDING_CACHE_TTL_MS = 60 * 60 * 1000
const embeddingCache = new Map<string, { result: EmbeddingResult; expiresAt: number }>()

function cacheGet(key: string): EmbeddingResult | null {
  const entry = embeddingCache.get(key)
  if (!entry) return null
  if (entry.expiresAt < Date.now()) {
    embeddingCache.delete(key)
    return null
  }
  // LRU touch — re-insert moves to end of Map iteration order.
  embeddingCache.delete(key)
  embeddingCache.set(key, entry)
  return entry.result
}

function cacheSet(key: string, result: EmbeddingResult): void {
  if (embeddingCache.has(key)) embeddingCache.delete(key)
  embeddingCache.set(key, { result, expiresAt: Date.now() + EMBEDDING_CACHE_TTL_MS })
  // Evict oldest entries when capacity exceeded.
  while (embeddingCache.size > EMBEDDING_CACHE_MAX) {
    const oldest = embeddingCache.keys().next().value
    if (oldest === undefined) break
    embeddingCache.delete(oldest)
  }
}

export async function embedText(text: string): Promise<EmbeddingResult> {
  const normalizedText = normalizeWhitespace(text).slice(0, MAX_EMBEDDING_TEXT_LENGTH)
  // F5 · PII redaction (opt-in via USER_SKILL_REDACT_PII_ON_EMBED=true).
  // Strips emails / phones / IDs / IPs / credit cards / URLs before
  // embedding so the residual leak from embedding inversion can't
  // recover those exact identifiers. See pii-redactor.ts for the full
  // honest scope discussion (this is mitigation, not solution).
  const redacted = isPiiRedactionEnabled() ? redactPii(normalizedText).redacted : normalizedText
  const dimensions = getEmbeddingDimensions()
  const apiKey = process.env.EMBEDDING_API_KEY ?? process.env.OPENAI_API_KEY ?? process.env.LLM_API_KEY

  // P12 · cache check before any I/O.
  const cacheKey = `${redacted}::${dimensions}`
  const cached = cacheGet(cacheKey)
  if (cached) return cached

  if (apiKey && redacted && !isLocalHashForced()) {
    try {
      const result = await embedRemote(redacted, apiKey, dimensions)
      cacheSet(cacheKey, result)
      return result
    } catch (error) {
      // Throttled: log every 1st + every 100th failure. Production with
      // a misconfigured embedding endpoint would otherwise drown the log.
      fallbackCount += 1
      if (fallbackCount === 1 || fallbackCount % FALLBACK_LOG_EVERY === 0) {
        console.warn('[embedding-service] remote embedding failed, falling back to local embedding', {
          error: String(error),
          fallbackCount
        })
      }
    }
  }

  const result: EmbeddingResult = {
    vector: createLocalEmbedding(redacted, dimensions),
    provider: 'local-hash',
    model: `local-hash-${dimensions}`,
    dimensions
  }
  // Cache local-hash too — same key would have produced the same hash
  // anyway, but the cache lookup saves the createLocalEmbedding work.
  cacheSet(cacheKey, result)
  return result
}

export function getEmbeddingDimensions() {
  return STORAGE_EMBEDDING_DIMENSIONS
}

export function toPgVector(vector: number[]) {
  return `[${fitDimensions(vector, getEmbeddingDimensions())
    .map((value) => Number.isFinite(value) ? value.toFixed(8) : '0')
    .join(',')}]`
}

async function embedRemote(
  text: string,
  apiKey: string,
  dimensions: number
): Promise<EmbeddingResult> {
  const baseUrl = stripTrailingSlash(
    process.env.EMBEDDING_BASE_URL ??
    process.env.OPENAI_BASE_URL ??
    process.env.LLM_BASE_URL ??
    'https://api.openai.com/v1'
  )
  const model = process.env.EMBEDDING_MODEL ?? 'text-embedding-3-small'
  const requestedDimensions = Number(process.env.EMBEDDING_DIMENSIONS)
  const shouldSendDimensions = Number.isFinite(requestedDimensions) && requestedDimensions > 0

  // P11.18 · retry envelope. SiliconFlow / DashScope routinely 503 on
  // hot models when capacity is tight. Without retry, every transient
  // overload immediately falls back to local-hash and the chunk's
  // semantic embedding is wasted (recall ≈ 0). Retry up to 3 times
  // with exponential backoff for 408 / 429 / 5xx.
  const maxRetries = Number(process.env.EMBEDDING_MAX_RETRIES ?? '3')
  const timeoutMs = Number(process.env.EMBEDDING_TIMEOUT_MS ?? '30000')
  let lastErr: unknown = null

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), timeoutMs)
    try {
      const response = await fetch(`${baseUrl}/embeddings`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model,
          input: text,
          ...(shouldSendDimensions ? { dimensions: Math.floor(requestedDimensions) } : {})
        }),
        signal: ac.signal
      })
      clearTimeout(timer)

      if (!response.ok) {
        const retryable = response.status === 408 || response.status === 429 || response.status >= 500
        if (retryable && attempt < maxRetries) {
          const backoff = Math.min(8000, 1000 * Math.pow(2, attempt)) + Math.floor(Math.random() * 400)
          console.warn(`[embedding-service] HTTP ${response.status} on ${model}, retry ${attempt + 1}/${maxRetries} in ${backoff}ms`)
          await new Promise((r) => setTimeout(r, backoff))
          continue
        }
        throw new Error(`Embedding API failed: ${response.status} ${response.statusText}`)
      }

      const payload = await response.json() as { data?: Array<{ embedding?: unknown }> }
      const embedding = payload.data?.[0]?.embedding
      if (!Array.isArray(embedding)) {
        throw new Error('Embedding API returned invalid payload')
      }

      return {
        vector: fitDimensions(
          normalizeVector(embedding.map((value) => Number(value)).filter(Number.isFinite)),
          dimensions
        ),
        provider: 'openai-compatible',
        model,
        dimensions
      }
    } catch (err) {
      clearTimeout(timer)
      lastErr = err
      const errStr = err instanceof Error ? err.message : String(err)
      const isAbort = err instanceof Error && (err.name === 'AbortError' || /aborted/i.test(errStr))
      const isNetwork = /fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND/i.test(errStr)
      if ((isAbort || isNetwork) && attempt < maxRetries) {
        const backoff = Math.min(8000, 1000 * Math.pow(2, attempt)) + Math.floor(Math.random() * 400)
        console.warn(`[embedding-service] ${isAbort ? 'timeout' : 'network'} on ${model}, retry ${attempt + 1}/${maxRetries} in ${backoff}ms`)
        await new Promise((r) => setTimeout(r, backoff))
        continue
      }
      throw err
    }
  }
  throw lastErr ?? new Error('embedding retries exhausted')
}

function createLocalEmbedding(text: string, dimensions: number) {
  const vector = Array.from({ length: dimensions }, () => 0)
  const tokens = tokenize(text)

  for (const token of tokens) {
    const hash = hashToken(token)
    const index = Math.abs(hash) % dimensions
    const sign = hash % 2 === 0 ? 1 : -1
    vector[index] += sign
  }

  return normalizeVector(vector)
}

function fitDimensions(vector: number[], dimensions: number) {
  if (vector.length === dimensions) return vector
  if (vector.length > dimensions) return normalizeVector(vector.slice(0, dimensions))
  return normalizeVector([...vector, ...Array.from({ length: dimensions - vector.length }, () => 0)])
}

function tokenize(text: string) {
  const normalized = text.toLowerCase()
  const latinTokens = normalized.match(/[a-z0-9]+/g) ?? []
  const cjkChars = Array.from(normalized.match(/[\u3400-\u9fff]/g) ?? [])
  const cjkBigrams = cjkChars.slice(0, -1).map((char, index) => `${char}${cjkChars[index + 1]}`)
  return [...latinTokens, ...cjkChars, ...cjkBigrams].filter((token) => token.length > 0)
}

function hashToken(token: string) {
  let hash = 2166136261
  for (let i = 0; i < token.length; i += 1) {
    hash ^= token.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash | 0
}

function normalizeVector(vector: number[]) {
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0))
  if (!norm) return vector
  return vector.map((value) => value / norm)
}

function normalizeWhitespace(text: string) {
  return text.replace(/\r/g, '').replace(/[ \t]+/g, ' ').trim()
}

function stripTrailingSlash(value: string) {
  return value.replace(/\/+$/, '')
}
