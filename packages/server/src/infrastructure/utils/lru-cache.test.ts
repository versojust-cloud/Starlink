import assert from 'node:assert/strict'
import test from 'node:test'
import { LruCache } from './lru-cache.js'

test('LruCache: get returns null for missing key', () => {
  const c = new LruCache<string, number>()
  assert.equal(c.get('absent'), null)
})

test('LruCache: set then get returns value within TTL', () => {
  const c = new LruCache<string, number>({ ttlMs: 1000 })
  c.set('a', 42)
  assert.equal(c.get('a'), 42)
})

test('LruCache: get returns null after TTL expires', async () => {
  const c = new LruCache<string, number>({ ttlMs: 50 })
  c.set('a', 42)
  await new Promise((resolve) => setTimeout(resolve, 80))
  assert.equal(c.get('a'), null)
})

test('LruCache: max=2 evicts oldest entry on insert', () => {
  const c = new LruCache<string, number>({ max: 2 })
  c.set('a', 1)
  c.set('b', 2)
  c.set('c', 3)
  assert.equal(c.get('a'), null) // evicted
  assert.equal(c.get('b'), 2)
  assert.equal(c.get('c'), 3)
})

test('LruCache: get refreshes LRU order so most-recently-read survives eviction', () => {
  const c = new LruCache<string, number>({ max: 2 })
  c.set('a', 1)
  c.set('b', 2)
  // access a so it becomes most-recent
  assert.equal(c.get('a'), 1)
  c.set('c', 3) // should evict b (oldest), not a
  assert.equal(c.get('a'), 1)
  assert.equal(c.get('b'), null)
  assert.equal(c.get('c'), 3)
})

test('LruCache: memoise dedupes concurrent fetches', async () => {
  const c = new LruCache<string, number>({ ttlMs: 1000 })
  let fetcherCalls = 0
  const fetcher = async () => {
    fetcherCalls++
    await new Promise((resolve) => setTimeout(resolve, 30))
    return 42
  }
  // Fire 5 concurrent calls; the fetcher should run exactly once.
  const results = await Promise.all([
    c.memoise('a', fetcher),
    c.memoise('a', fetcher),
    c.memoise('a', fetcher),
    c.memoise('a', fetcher),
    c.memoise('a', fetcher)
  ])
  assert.deepEqual(results, [42, 42, 42, 42, 42])
  assert.equal(fetcherCalls, 1, 'fetcher should be deduped on cache miss')
})

test('LruCache: memoise hits cache on second call', async () => {
  const c = new LruCache<string, number>({ ttlMs: 1000 })
  let fetcherCalls = 0
  const fetcher = async () => {
    fetcherCalls++
    return 7
  }
  await c.memoise('a', fetcher)
  await c.memoise('a', fetcher)
  await c.memoise('a', fetcher)
  assert.equal(fetcherCalls, 1)
})
