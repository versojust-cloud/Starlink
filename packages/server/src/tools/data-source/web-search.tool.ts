import {
  BaseTool,
  type ToolDefinition,
  type ToolContext,
  type ToolMessage,
} from '@starlink/shared'

/**
 * web-search v2 — multi-provider with auto-fallback, in-memory cache,
 * structured output (with domain + relevance), and filters.
 *
 * Provider selection priority (when `provider: 'auto'`):
 *   1. Tavily       (best for RAG; needs TAVILY_API_KEY)
 *   2. Brave        (good general; needs BRAVE_API_KEY)
 *   3. SerpAPI      (Google wrapper; needs SERPAPI_KEY or credentials)
 *   4. DuckDuckGo   (free, no key — fallback for offline / no-budget)
 *
 * Output shape (per result):
 *   { title, url, snippet, domain, publishedAt?, score, provider }
 *
 * DeepSearch hooks: cache key includes filters so DeepSearch can do
 * iterative narrowing without re-paying API tokens.
 */

type SearchResult = {
  title: string
  url: string
  snippet: string
  domain: string
  publishedAt?: string
  score: number
  provider: string
}

type Provider = 'auto' | 'tavily' | 'brave' | 'serpapi' | 'duckduckgo'

const CACHE = new Map<string, { results: SearchResult[]; expiresAt: number }>()
const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour
const MAX_CACHE = 200

function cacheKey(query: string, opts: Record<string, unknown>): string {
  return JSON.stringify({ query, ...opts })
}

function readCache(key: string): SearchResult[] | null {
  const hit = CACHE.get(key)
  if (!hit) return null
  if (hit.expiresAt < Date.now()) {
    CACHE.delete(key)
    return null
  }
  return hit.results
}

function writeCache(key: string, results: SearchResult[]): void {
  if (CACHE.size >= MAX_CACHE) {
    const firstKey = CACHE.keys().next().value
    if (firstKey) CACHE.delete(firstKey)
  }
  CACHE.set(key, { results, expiresAt: Date.now() + CACHE_TTL_MS })
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

/** Re-rank: query-term overlap + recency boost + domain trust heuristic. */
function rerank(results: SearchResult[], query: string): SearchResult[] {
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length >= 2)
  const trustedDomains = new Set([
    'wikipedia.org', 'github.com', 'medium.com', 'arxiv.org',
    'stackoverflow.com', 'mit.edu', 'harvard.edu', 'nature.com',
    'ycombinator.com', 'producthunt.com', '36kr.com', 'huxiu.com',
    'sohu.com', 'qq.com', 'zhihu.com', 'toutiao.com',
  ])
  return [...results]
    .map((r) => {
      const haystack = `${r.title} ${r.snippet}`.toLowerCase()
      const overlap = terms.filter((t) => haystack.includes(t)).length / Math.max(terms.length, 1)
      const trustBoost = trustedDomains.has(r.domain) ? 0.15 : 0
      const recencyBoost = (() => {
        if (!r.publishedAt) return 0
        const days = (Date.now() - new Date(r.publishedAt).getTime()) / (24 * 60 * 60 * 1000)
        if (days < 30) return 0.1
        if (days < 365) return 0.05
        return 0
      })()
      return { ...r, score: r.score + overlap * 0.5 + trustBoost + recencyBoost }
    })
    .sort((a, b) => b.score - a.score)
}

async function searchTavily(
  query: string,
  apiKey: string,
  maxResults: number,
  signal: AbortSignal | undefined
): Promise<SearchResult[]> {
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      max_results: maxResults,
      search_depth: 'advanced',
      include_answer: false,
    }),
    signal,
  })
  if (!res.ok) throw new Error(`Tavily ${res.status}`)
  const data = (await res.json()) as { results?: Array<Record<string, unknown>> }
  return (data.results ?? []).map((r) => ({
    title: String(r.title ?? ''),
    url: String(r.url ?? ''),
    snippet: String(r.content ?? ''),
    domain: extractDomain(String(r.url ?? '')),
    score: typeof r.score === 'number' ? r.score : 0.5,
    provider: 'tavily',
  }))
}

async function searchBrave(
  query: string,
  apiKey: string,
  maxResults: number,
  signal: AbortSignal | undefined
): Promise<SearchResult[]> {
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${maxResults}`
  const res = await fetch(url, {
    headers: { 'X-Subscription-Token': apiKey, Accept: 'application/json' },
    signal,
  })
  if (!res.ok) throw new Error(`Brave ${res.status}`)
  const data = (await res.json()) as { web?: { results?: Array<Record<string, unknown>> } }
  return (data.web?.results ?? []).slice(0, maxResults).map((r) => ({
    title: String(r.title ?? ''),
    url: String(r.url ?? ''),
    snippet: String(r.description ?? ''),
    domain: extractDomain(String(r.url ?? '')),
    publishedAt: typeof r.age === 'string' ? r.age : undefined,
    score: 0.5,
    provider: 'brave',
  }))
}

async function searchSerpApi(
  query: string,
  apiKey: string,
  maxResults: number,
  signal: AbortSignal | undefined
): Promise<SearchResult[]> {
  const url = `https://serpapi.com/search.json?q=${encodeURIComponent(query)}&num=${maxResults}&api_key=${apiKey}`
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`SerpAPI ${res.status}`)
  const data = (await res.json()) as { organic_results?: Array<Record<string, unknown>> }
  return (data.organic_results ?? []).slice(0, maxResults).map((r) => ({
    title: String(r.title ?? ''),
    url: String(r.link ?? ''),
    snippet: String(r.snippet ?? ''),
    domain: extractDomain(String(r.link ?? '')),
    publishedAt: typeof r.date === 'string' ? r.date : undefined,
    score: 0.5,
    provider: 'serpapi',
  }))
}

/** DuckDuckGo HTML scrape — free, no key, but bot-detected sometimes. */
async function searchDuckDuckGo(
  query: string,
  maxResults: number,
  signal: AbortSignal | undefined
): Promise<SearchResult[]> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    },
    signal,
  })
  if (!res.ok) throw new Error(`DuckDuckGo ${res.status}`)
  const html = await res.text()
  // Cheap regex parse — DDG HTML structure: result blocks with <a class="result__a"
  // and <a class="result__snippet">. Good enough for our needs without cheerio.
  const results: SearchResult[] = []
  const blockRegex =
    /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g
  let match: RegExpExecArray | null
  while ((match = blockRegex.exec(html)) && results.length < maxResults) {
    const rawUrl = match[1]
    const title = stripTags(match[2])
    const snippet = stripTags(match[3])
    // DDG wraps URLs in /l/?uddg=... — unwrap
    let url2 = rawUrl
    try {
      const u = new URL(rawUrl, 'https://duckduckgo.com')
      const real = u.searchParams.get('uddg')
      if (real) url2 = decodeURIComponent(real)
    } catch {
      /* keep raw */
    }
    if (!url2 || !title) continue
    results.push({
      title,
      url: url2,
      snippet,
      domain: extractDomain(url2),
      score: 0.5,
      provider: 'duckduckgo',
    })
  }
  return results
}

function stripTags(s: string): string {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim()
}

function applyFilters(
  results: SearchResult[],
  opts: { siteFilter?: string; afterDate?: string }
): SearchResult[] {
  let filtered = results
  if (opts.siteFilter) {
    const want = opts.siteFilter.replace(/^www\./, '')
    filtered = filtered.filter((r) => r.domain === want || r.domain.endsWith(`.${want}`))
  }
  if (opts.afterDate) {
    const cutoff = new Date(opts.afterDate).getTime()
    if (!Number.isNaN(cutoff)) {
      filtered = filtered.filter((r) => {
        if (!r.publishedAt) return true
        const t = new Date(r.publishedAt).getTime()
        return Number.isNaN(t) || t >= cutoff
      })
    }
  }
  return filtered
}

export default class WebSearchTool extends BaseTool {
  readonly definition: ToolDefinition = {
    identity: {
      name: 'web-search',
      provider: 'builtin',
      version: '2.0.0',
    },
    display: {
      label: '网络搜索',
      description: '多 provider 联网搜索：Tavily / Brave / SerpAPI / DuckDuckGo 自动选择，自带缓存 + 重排序 + 域名/时间过滤',
      icon: '🔍',
      category: 'data_source',
      color: '#3b82f6',
    },
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '搜索关键词', required: true },
        maxResults: { type: 'number', description: '最大返回结果数量', default: 8 },
        provider: {
          type: 'string',
          description: 'auto | tavily | brave | serpapi | duckduckgo',
          default: 'auto',
        },
        siteFilter: { type: 'string', description: '限定域名（如 ycombinator.com）' },
        afterDate: { type: 'string', description: 'ISO 日期，仅返回该日期之后的结果' },
        bypassCache: { type: 'boolean', description: '跳过缓存重新查询', default: false },
      },
      required: ['query', 'maxResults'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        results: { type: 'array', description: '搜索结果列表' },
        provider: { type: 'string', description: '实际使用的 provider' },
        cached: { type: 'boolean', description: '是否命中缓存' },
        query: { type: 'string', description: '回声查询词' },
      },
    },
    inputPorts: [
      { name: 'query', type: 'string', description: '搜索关键词', required: true },
      { name: 'maxResults', type: 'number', description: '最大返回结果数量', default: 8 },
    ],
    outputPorts: [
      { name: 'results', type: 'array', description: '搜索结果列表' },
    ],
    credentials: {
      type: 'api_key',
      fields: [
        { name: 'tavilyApiKey', label: 'Tavily API Key', type: 'string', required: false, placeholder: '推荐 — 专为 RAG 优化' },
        { name: 'braveApiKey', label: 'Brave Search Key', type: 'string', required: false, placeholder: '免费 2000q/月' },
        { name: 'serpApiKey', label: 'SerpAPI Key', type: 'string', required: false, placeholder: 'Google wrapper' },
      ],
    },
    runtime: {
      timeout: 30000,
      retries: 1,
      cacheable: true,
      streamable: false,
      parallel: true,
    },
  }

  async *execute(
    input: Record<string, unknown>,
    context: ToolContext,
  ): AsyncGenerator<ToolMessage> {
    const query = (input.query as string ?? '').trim()
    const maxResults = (input.maxResults as number) ?? 8
    const provider = (input.provider as Provider) ?? 'auto'
    const siteFilter = input.siteFilter as string | undefined
    const afterDate = input.afterDate as string | undefined
    const bypassCache = input.bypassCache as boolean | undefined

    if (!query) {
      yield { type: 'error', error: 'query 不能为空', retryable: false }
      return
    }

    // Cache lookup
    const key = cacheKey(query, { provider, maxResults, siteFilter, afterDate })
    if (!bypassCache) {
      const cached = readCache(key)
      if (cached) {
        yield { type: 'progress', percent: 100, message: '命中缓存' }
        yield { type: 'json', data: { results: cached, provider: cached[0]?.provider ?? 'cached', cached: true, query } }
        return
      }
    }

    yield { type: 'progress', percent: 10, message: '开始搜索…' }

    // Resolve provider keys (env > credentials)
    const tavilyKey = process.env.TAVILY_API_KEY ?? (context.credentials?.tavilyApiKey as string | undefined)
    const braveKey = process.env.BRAVE_API_KEY ?? (context.credentials?.braveApiKey as string | undefined)
    const serpKey = process.env.SERPAPI_KEY ?? (context.credentials?.serpApiKey as string | undefined)

    // Build provider waterfall based on chosen mode
    type Attempt = { name: string; run: () => Promise<SearchResult[]> }
    const attempts: Attempt[] = []
    const addTavily = () => tavilyKey && attempts.push({ name: 'tavily', run: () => searchTavily(query, tavilyKey, maxResults, context.abortSignal) })
    const addBrave = () => braveKey && attempts.push({ name: 'brave', run: () => searchBrave(query, braveKey, maxResults, context.abortSignal) })
    const addSerp = () => serpKey && attempts.push({ name: 'serpapi', run: () => searchSerpApi(query, serpKey, maxResults, context.abortSignal) })
    const addDdg = () => attempts.push({ name: 'duckduckgo', run: () => searchDuckDuckGo(query, maxResults, context.abortSignal) })

    if (provider === 'auto') {
      addTavily()
      addBrave()
      addSerp()
      addDdg()
    } else if (provider === 'tavily') addTavily()
    else if (provider === 'brave') addBrave()
    else if (provider === 'serpapi') addSerp()
    else if (provider === 'duckduckgo') addDdg()

    if (attempts.length === 0) {
      yield { type: 'error', error: `所选 provider "${provider}" 缺少凭证`, retryable: false }
      return
    }

    let lastErr: Error | null = null
    for (let i = 0; i < attempts.length; i++) {
      const attempt = attempts[i]
      try {
        yield {
          type: 'progress',
          percent: 20 + Math.floor((i / attempts.length) * 60),
          message: `尝试 ${attempt.name}…`,
        }
        const raw = await attempt.run()
        const filtered = applyFilters(raw, { siteFilter, afterDate })
        const ranked = rerank(filtered, query).slice(0, maxResults)
        writeCache(key, ranked)
        yield { type: 'progress', percent: 100, message: `搜索完成 · ${attempt.name} · ${ranked.length} 条` }
        yield { type: 'json', data: { results: ranked, provider: attempt.name, cached: false, query } }
        return
      } catch (err) {
        lastErr = err instanceof Error ? err : new Error(String(err))
        // Try next provider
      }
    }

    // P11.18 fix · graceful soft-fail. Previously this yielded an
    // `error` ToolMessage which propagated as an exception in the
    // ReAct loop, causing the agent to abort or loop on retries.
    // In environments without TAVILY/BRAVE/SERPAPI keys (most dev
    // setups) AND blocked DuckDuckGo (corporate firewall, China GFW),
    // every web-search call would push the SLO error rate to 100%.
    //
    // Now: emit a successful empty-result payload + a `text` warning,
    // so the agent can continue reasoning without web evidence rather
    // than crash. The SLO records 'success' (no error), but the
    // `degraded: true` flag in the payload lets downstream code
    // distinguish "found nothing" from "search failed gracefully".
    yield {
      type: 'text',
      content: `网络搜索不可用（${lastErr?.message ?? '所有 provider 失败'}）。建议在 .env 配置 TAVILY_API_KEY 启用真实搜索；当前 agent 将依赖知识库 / 记忆 / 已有上下文继续推理。`,
    }
    yield {
      type: 'json',
      data: {
        results: [],
        provider: 'none',
        cached: false,
        query,
        degraded: true,
        degradedReason: lastErr?.message ?? '所有 provider 失败',
      },
    }
  }
}
