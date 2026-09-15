/**
 * Per-process LRU cache with TTL.
 *
 * Designed for short-lived (1-10s) caching of expensive lookups within
 * a single conversation stream. The typical pattern: a stream invokes
 * 5-6 LangGraph agents, each calling `readWorkspaceMemoriesPrompt(...)`
 * with the same workspaceId + question. Without caching that's 6 PG
 * round-trips for identical results; with a 5s TTL cache it's 1.
 *
 * Multi-instance correctness:
 *   - This is an in-process cache. Across gateway processes it does
 *     nothing (each process maintains its own Map). That's intentional:
 *     a 5s TTL across distributed processes adds Redis dependency for
 *     marginal benefit. Within-stream agents always hit the same
 *     process, so the cache is effective where it matters.
 *
 * Per-user isolation:
 *   - The cache key is opaque — callers MUST include userId in the key.
 *     There is no automatic user-scoping. We DELIBERATELY don't tie the
 *     cache to PG's RLS context (current_user_id) because the cache
 *     stores already-filtered results — re-using them across users
 *     would leak. Constructing keys correctly is the caller's
 *     responsibility.
 *
 * LRU eviction:
 *   - max=1000 entries per cache instance (tunable). When full, the
 *     oldest entry by insertion order is removed (Map's insertion-
 *     order iteration; same algorithm as the popular `lru-cache` npm
 *     package without the dependency).
 *
 * TTL eviction:
 *   - Entries past their TTL are returned as null by `get()` and the
 *     stale entry is removed. There is NO background sweeper; expired
 *     entries linger until their slot is reused or `get()` is called.
 *     Acceptable because memory cost is bounded by `max`.
 */

export interface LruCacheOptions {
  /** Time-to-live in milliseconds. Default 5000 (5s). */
  ttlMs?: number
  /** Max entries before LRU eviction. Default 1000. */
  max?: number
}

interface Entry<V> {
  value: V
  expiresAt: number
}

export class LruCache<K, V> {
  private readonly map = new Map<K, Entry<V>>()
  private readonly ttlMs: number
  private readonly max: number

  constructor(options: LruCacheOptions = {}) {
    this.ttlMs = options.ttlMs ?? 5_000
    this.max = options.max ?? 1000
  }

  get(key: K): V | null {
    const entry = this.map.get(key)
    if (!entry) return null
    if (entry.expiresAt < Date.now()) {
      this.map.delete(key)
      return null
    }
    // Refresh insertion order to mark as recently used (LRU semantics)
    this.map.delete(key)
    this.map.set(key, entry)
    return entry.value
  }

  set(key: K, value: V): void {
    // Evict oldest if at capacity
    if (this.map.size >= this.max && !this.map.has(key)) {
      const firstKey = this.map.keys().next().value
      if (firstKey !== undefined) this.map.delete(firstKey)
    }
    this.map.set(key, {
      value,
      expiresAt: Date.now() + this.ttlMs
    })
  }

  delete(key: K): void {
    this.map.delete(key)
  }

  /** Remove all entries (e.g. on test setup or config change). */
  clear(): void {
    this.map.clear()
  }

  /** Current entry count, including any not-yet-evicted expired entries. */
  size(): number {
    return this.map.size
  }

  /**
   * Memoise an async fetcher with TTL caching. Hitting the cache returns
   * the cached value without calling the fetcher. On miss, the fetcher
   * runs once; concurrent callers with the same key in flight share the
   * same promise (in-flight dedup avoids double-fetch on cache miss).
   */
  async memoise(key: K, fetcher: () => Promise<V>): Promise<V> {
    const cached = this.get(key)
    if (cached !== null) return cached
    const inFlight = this.inFlight.get(key)
    if (inFlight) return inFlight as Promise<V>
    const promise = fetcher()
      .then((value) => {
        this.set(key, value)
        return value
      })
      .finally(() => {
        this.inFlight.delete(key)
      })
    this.inFlight.set(key, promise)
    return promise
  }

  private readonly inFlight = new Map<K, Promise<V>>()
}
