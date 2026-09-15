import { Redis } from 'ioredis'
import type {
  CanvasGraph,
  CardCitation,
  ConversationEvent,
  ConversationMetadata,
  KnowledgeEvidence,
  WorkspaceAsset
} from '@starlink/shared'

export type ConversationRecord = {
  metadata: ConversationMetadata
  graph: CanvasGraph
  knowledgeEvidence: KnowledgeEvidence[]
  /** Cell-level citations collected across agent outputs. */
  citations: CardCitation[]
}

export type PendingApprovalData = {
  conversationId: string
  workspaceId: string
  decision: string
  createdAt: string
  timeoutMs: number
}

export type ConversationRuntimeRepository = {
  createConversation: (id: string, record: ConversationRecord) => Promise<void>
  updateConversation: (id: string, record: ConversationRecord) => Promise<void>
  touchConversation: (id: string) => Promise<void>
  getConversation: (id: string) => Promise<ConversationRecord | null>
  getConversationsByWorkspace: (workspaceId: string) => Promise<Array<{ id: string; record: ConversationRecord }>>
  appendConversationEvent: (workspaceId: string, event: ConversationEvent) => Promise<void>
  listConversationEvents: (workspaceId: string, conversationId?: string) => Promise<ConversationEvent[]>
  listWorkspaces: () => Promise<Array<{ workspaceId: string; updatedAt: string; status: 'draft' | 'active' | 'error' }>>
  upsertWorkspaceAsset: (asset: WorkspaceAsset) => Promise<void>
  listWorkspaceAssets: (workspaceId: string) => Promise<WorkspaceAsset[]>
  setWorkspaceGraph: (workspaceId: string, graph: CanvasGraph) => Promise<void>
  getWorkspaceGraph: (workspaceId: string) => Promise<CanvasGraph | null>
  setPendingApproval: (conversationId: string, data: PendingApprovalData) => Promise<void>
  getPendingApproval: (conversationId: string) => Promise<PendingApprovalData | null>
  deletePendingApproval: (conversationId: string) => Promise<void>
  close: () => Promise<void>
}

type SerializableConversationRecord = {
  metadata: Omit<ConversationMetadata, 'createdAt' | 'updatedAt'> & {
    createdAt: string
    updatedAt: string
  }
  graph: CanvasGraph
  knowledgeEvidence: KnowledgeEvidence[]
  citations: CardCitation[]
}

type RepositoryConfig = {
  maxConversations: number
  conversationTtlMs: number
  maxRuntimeEventsPerWorkspace: number
}

type WorkspaceRuntimeStatus = 'draft' | 'active' | 'error'

class InMemoryConversationRuntimeRepository implements ConversationRuntimeRepository {
  private readonly conversations = new Map<string, ConversationRecord>()
  private readonly touchedAt = new Map<string, number>()
  private readonly workspaceGraphs = new Map<string, CanvasGraph>()
  private readonly workspaceAssets = new Map<string, Map<string, WorkspaceAsset>>()
  private readonly workspaceEvents = new Map<string, ConversationEvent[]>()
  private readonly pendingApprovals = new Map<string, PendingApprovalData>()
  private readonly maxConversations: number
  private readonly conversationTtlMs: number
  private readonly maxRuntimeEventsPerWorkspace: number

  constructor(config: RepositoryConfig) {
    this.maxConversations = config.maxConversations
    this.conversationTtlMs = config.conversationTtlMs
    this.maxRuntimeEventsPerWorkspace = config.maxRuntimeEventsPerWorkspace
  }

  async createConversation(id: string, record: ConversationRecord) {
    this.conversations.set(id, cloneRecord(record))
    this.touch(id)
    this.cleanup()
  }

  async updateConversation(id: string, record: ConversationRecord) {
    this.conversations.set(id, cloneRecord(record))
    this.touch(id)
    this.cleanup()
  }

  async touchConversation(id: string) {
    if (!this.conversations.has(id)) return
    this.touch(id)
  }

  async getConversation(id: string) {
    const record = this.conversations.get(id)
    if (!record) return null
    this.touch(id)
    return cloneRecord(record)
  }

  async getConversationsByWorkspace(workspaceId: string) {
    const results: Array<{ id: string; record: ConversationRecord }> = []
    for (const [id, record] of this.conversations.entries()) {
      if (record.graph.workspaceId !== workspaceId) continue
      results.push({ id, record: cloneRecord(record) })
    }
    return results
  }

  async appendConversationEvent(workspaceId: string, event: ConversationEvent) {
    const next = (this.workspaceEvents.get(workspaceId) ?? []).concat(cloneConversationEvent(event))
    const trimmed = next.slice(-this.maxRuntimeEventsPerWorkspace)
    this.workspaceEvents.set(workspaceId, trimmed)
  }

  async listConversationEvents(workspaceId: string, conversationId?: string) {
    const events = this.workspaceEvents.get(workspaceId) ?? []
    return events
      .filter((event) => !conversationId || event.conversationId === conversationId)
      .map((event) => cloneConversationEvent(event))
  }

  async listWorkspaces(): Promise<Array<{ workspaceId: string; updatedAt: string; status: WorkspaceRuntimeStatus }>> {
    const workspaceIds = new Set<string>(this.workspaceGraphs.keys())
    for (const record of this.conversations.values()) {
      workspaceIds.add(record.graph.workspaceId)
    }
    for (const workspaceId of this.workspaceAssets.keys()) {
      workspaceIds.add(workspaceId)
    }
    for (const workspaceId of this.workspaceEvents.keys()) {
      workspaceIds.add(workspaceId)
    }

    return [...workspaceIds].map((workspaceId) => {
      const records = [...this.conversations.values()].filter((item) => item.graph.workspaceId === workspaceId)
      const assets = [...(this.workspaceAssets.get(workspaceId)?.values() ?? [])]
      const latest = records
        .map((item) => item.metadata.updatedAt.toISOString())
        .concat(assets.map((item) => item.updatedAt))
        .sort((a, b) => b.localeCompare(a))[0]
      const hasRunning = records.some((item) => item.metadata.status === 'running')
      const hasFailed = records.some((item) => item.metadata.status === 'failed')

      const status: WorkspaceRuntimeStatus =
        hasFailed ? 'error' : hasRunning || records.length > 0 || assets.length > 0 ? 'active' : 'draft'
      return {
        workspaceId,
        updatedAt: latest ?? new Date().toISOString(),
        status
      }
    })
  }

  async upsertWorkspaceAsset(asset: WorkspaceAsset) {
    const byWorkspace = this.workspaceAssets.get(asset.workspaceId) ?? new Map<string, WorkspaceAsset>()
    byWorkspace.set(asset.assetId, cloneAsset(asset))
    this.workspaceAssets.set(asset.workspaceId, byWorkspace)
  }

  async listWorkspaceAssets(workspaceId: string) {
    return [...(this.workspaceAssets.get(workspaceId)?.values() ?? [])]
      .map((asset) => cloneAsset(asset))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  async setWorkspaceGraph(workspaceId: string, graph: CanvasGraph) {
    this.workspaceGraphs.set(workspaceId, cloneGraph(graph))
  }

  async getWorkspaceGraph(workspaceId: string) {
    const graph = this.workspaceGraphs.get(workspaceId)
    if (!graph) return null
    return cloneGraph(graph)
  }

  async setPendingApproval(conversationId: string, data: PendingApprovalData) {
    this.pendingApprovals.set(conversationId, { ...data })
  }

  async getPendingApproval(conversationId: string) {
    const data = this.pendingApprovals.get(conversationId)
    return data ? { ...data } : null
  }

  async deletePendingApproval(conversationId: string) {
    this.pendingApprovals.delete(conversationId)
  }

  async close() {}

  private touch(id: string) {
    this.touchedAt.set(id, Date.now())
  }

  private cleanup() {
    const now = Date.now()

    for (const [id, record] of this.conversations.entries()) {
      const touched = this.touchedAt.get(id) ?? record.metadata.updatedAt.getTime()
      const expired = now - touched > this.conversationTtlMs
      const finished = record.metadata.status !== 'running'
      if (!expired || !finished) continue

      this.conversations.delete(id)
      this.touchedAt.delete(id)
    }

    if (this.conversations.size <= this.maxConversations) return

    const candidates = [...this.conversations.entries()]
      .map(([id, record]) => ({
        id,
        status: record.metadata.status,
        touched: this.touchedAt.get(id) ?? record.metadata.updatedAt.getTime()
      }))
      .sort((a, b) => {
        if (a.status === 'running' && b.status !== 'running') return 1
        if (a.status !== 'running' && b.status === 'running') return -1
        return a.touched - b.touched
      })

    const overflow = this.conversations.size - this.maxConversations
    for (let index = 0; index < overflow; index += 1) {
      const target = candidates[index]
      if (!target) break
      this.conversations.delete(target.id)
      this.touchedAt.delete(target.id)
    }
  }
}

class RedisConversationRuntimeRepository implements ConversationRuntimeRepository {
  private readonly fallback: InMemoryConversationRuntimeRepository
  private readonly redis: Redis
  private readonly keyPrefix: string
  private readonly ttlSeconds: number
  private readonly maxRuntimeEventsPerWorkspace: number
  private available = true

  constructor(config: RepositoryConfig) {
    this.fallback = new InMemoryConversationRuntimeRepository(config)
    const url = process.env.CONVERSATION_RUNTIME_STORE_REDIS_URL
      ?? process.env.REDIS_URL
      ?? 'redis://localhost:6379'
    this.redis = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      retryStrategy: () => null
    })
    this.keyPrefix = process.env.CONVERSATION_RUNTIME_STORE_REDIS_PREFIX ?? 'conversation'
    this.ttlSeconds = Math.max(1, Math.floor(config.conversationTtlMs / 1000))
    this.maxRuntimeEventsPerWorkspace = config.maxRuntimeEventsPerWorkspace

    this.redis.on('error', (error: unknown) => {
      this.available = false
      console.error('[conversation-runtime-repository] redis error, fallback to memory', {
        error: String(error)
      })
    })
  }

  async createConversation(id: string, record: ConversationRecord) {
    await this.fallback.createConversation(id, record)
    await this.tryWrite(async () => {
      const serialized = serializeRecord(record)
      await this.redis
        .multi()
        .set(this.recordKey(id), JSON.stringify(serialized), 'EX', this.ttlSeconds)
        .sadd(this.workspaceConversationSetKey(record.graph.workspaceId), id)
        .expire(this.workspaceConversationSetKey(record.graph.workspaceId), this.ttlSeconds)
        .sadd(this.workspaceIndexKey(), record.graph.workspaceId)
        .expire(this.workspaceIndexKey(), this.ttlSeconds)
        .zadd(this.workspaceUpdatedSetKey(), Date.now(), record.graph.workspaceId)
        .zadd(this.touchedSetKey(), Date.now(), id)
        .exec()
    })
  }

  async updateConversation(id: string, record: ConversationRecord) {
    await this.fallback.updateConversation(id, record)
    await this.tryWrite(async () => {
      const serialized = serializeRecord(record)
      await this.redis
        .multi()
        .set(this.recordKey(id), JSON.stringify(serialized), 'EX', this.ttlSeconds)
        .sadd(this.workspaceConversationSetKey(record.graph.workspaceId), id)
        .expire(this.workspaceConversationSetKey(record.graph.workspaceId), this.ttlSeconds)
        .sadd(this.workspaceIndexKey(), record.graph.workspaceId)
        .expire(this.workspaceIndexKey(), this.ttlSeconds)
        .zadd(this.workspaceUpdatedSetKey(), Date.now(), record.graph.workspaceId)
        .zadd(this.touchedSetKey(), Date.now(), id)
        .exec()
    })
  }

  async touchConversation(id: string) {
    await this.fallback.touchConversation(id)
    await this.tryWrite(async () => {
      await this.redis
        .multi()
        .expire(this.recordKey(id), this.ttlSeconds)
        .zadd(this.touchedSetKey(), Date.now(), id)
        .exec()
    })
  }

  async getConversation(id: string) {
    const record = await this.tryRead(async () => {
      const payload = await this.redis.get(this.recordKey(id))
      if (!payload) return null
      const parsed = deserializeRecord(payload)
      await this.fallback.updateConversation(id, parsed)
      return parsed
    })
    return record ?? this.fallback.getConversation(id)
  }

  async getConversationsByWorkspace(workspaceId: string) {
    const records = await this.tryRead(async () => {
      const ids = await this.redis.smembers(this.workspaceConversationSetKey(workspaceId))
      if (ids.length === 0) return null

      const pipeline = this.redis.pipeline()
      ids.forEach((id: string) => {
        pipeline.get(this.recordKey(id))
      })
      const responses = await pipeline.exec()
      if (!responses) return []

      const result: Array<{ id: string; record: ConversationRecord }> = []
      for (let index = 0; index < ids.length; index += 1) {
        const id = ids[index]
        const item = responses[index]
        if (!item || item[0]) continue
        const payload = item[1]
        if (typeof payload !== 'string') continue
        try {
          const record = deserializeRecord(payload)
          await this.fallback.updateConversation(id, record)
          result.push({ id, record })
        } catch (error) {
          console.error('[conversation-runtime-repository] invalid redis record payload', {
            id,
            error: String(error)
          })
        }
      }
      return result
    })

    return records ?? this.fallback.getConversationsByWorkspace(workspaceId)
  }

  async appendConversationEvent(workspaceId: string, event: ConversationEvent) {
    await this.fallback.appendConversationEvent(workspaceId, event)
    await this.tryWrite(async () => {
      const payload = JSON.stringify(cloneConversationEvent(event))
      await this.redis
        .multi()
        .rpush(this.workspaceEventListKey(workspaceId), payload)
        .ltrim(this.workspaceEventListKey(workspaceId), -this.maxRuntimeEventsPerWorkspace, -1)
        .expire(this.workspaceEventListKey(workspaceId), this.ttlSeconds)
        .sadd(this.workspaceIndexKey(), workspaceId)
        .expire(this.workspaceIndexKey(), this.ttlSeconds)
        .zadd(this.workspaceUpdatedSetKey(), Date.now(), workspaceId)
        .exec()
    })
  }

  async listConversationEvents(workspaceId: string, conversationId?: string) {
    const events = await this.tryRead(async () => {
      const payloads = await this.redis.lrange(this.workspaceEventListKey(workspaceId), 0, -1)
      if (payloads.length === 0) return null

      const result: ConversationEvent[] = []
      for (const payload of payloads) {
        try {
          const event = JSON.parse(payload) as ConversationEvent
          result.push(cloneConversationEvent(event))
        } catch (error) {
          console.error('[conversation-runtime-repository] invalid redis runtime event payload', {
            workspaceId,
            error: String(error)
          })
        }
      }

      for (const event of result) {
        await this.fallback.appendConversationEvent(workspaceId, event)
      }

      return conversationId
        ? result.filter((event) => event.conversationId === conversationId)
        : result
    })

    return events ?? this.fallback.listConversationEvents(workspaceId, conversationId)
  }

  async listWorkspaces(): Promise<Array<{ workspaceId: string; updatedAt: string; status: WorkspaceRuntimeStatus }>> {
    const records = await this.tryRead(async () => {
      const workspaceIds = await this.redis.smembers(this.workspaceIndexKey())
      if (workspaceIds.length === 0) return null

      const pipeline = this.redis.pipeline()
      workspaceIds.forEach((workspaceId) => {
        pipeline.zscore(this.workspaceUpdatedSetKey(), workspaceId)
        pipeline.scard(this.workspaceConversationSetKey(workspaceId))
        pipeline.scard(this.workspaceAssetSetKey(workspaceId))
      })
      const responses = await pipeline.exec()
      if (!responses) return []

      return workspaceIds.map((workspaceId, index) => {
        const score = responses[index * 3]?.[1]
        const conversationCount = Number(responses[index * 3 + 1]?.[1] ?? 0)
        const assetCount = Number(responses[index * 3 + 2]?.[1] ?? 0)
        const status: WorkspaceRuntimeStatus = conversationCount > 0 || assetCount > 0 ? 'active' : 'draft'
        return {
          workspaceId,
          updatedAt: typeof score === 'string' ? new Date(Number(score)).toISOString() : new Date().toISOString(),
          status
        }
      })
    })

    return records ?? this.fallback.listWorkspaces()
  }

  async upsertWorkspaceAsset(asset: WorkspaceAsset) {
    await this.fallback.upsertWorkspaceAsset(asset)
    await this.tryWrite(async () => {
      const payload = JSON.stringify(cloneAsset(asset))
      await this.redis
        .multi()
        .set(this.workspaceAssetKey(asset.workspaceId, asset.assetId), payload, 'EX', this.ttlSeconds)
        .sadd(this.workspaceAssetSetKey(asset.workspaceId), asset.assetId)
        .expire(this.workspaceAssetSetKey(asset.workspaceId), this.ttlSeconds)
        .sadd(this.workspaceIndexKey(), asset.workspaceId)
        .expire(this.workspaceIndexKey(), this.ttlSeconds)
        .zadd(this.workspaceUpdatedSetKey(), Date.now(), asset.workspaceId)
        .exec()
    })
  }

  async listWorkspaceAssets(workspaceId: string) {
    const assets = await this.tryRead(async () => {
      const ids = await this.redis.smembers(this.workspaceAssetSetKey(workspaceId))
      if (ids.length === 0) return null

      const pipeline = this.redis.pipeline()
      ids.forEach((assetId) => {
        pipeline.get(this.workspaceAssetKey(workspaceId, assetId))
      })
      const responses = await pipeline.exec()
      if (!responses) return []

      const result: WorkspaceAsset[] = []
      for (let index = 0; index < ids.length; index += 1) {
        const item = responses[index]
        if (!item || item[0]) continue
        const payload = item[1]
        if (typeof payload !== 'string') continue
        try {
          const asset = JSON.parse(payload) as WorkspaceAsset
          await this.fallback.upsertWorkspaceAsset(asset)
          result.push(cloneAsset(asset))
        } catch (error) {
          console.error('[conversation-runtime-repository] invalid redis asset payload', {
            assetId: ids[index],
            error: String(error)
          })
        }
      }

      return result.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    })

    return assets ?? this.fallback.listWorkspaceAssets(workspaceId)
  }

  async setWorkspaceGraph(workspaceId: string, graph: CanvasGraph) {
    await this.fallback.setWorkspaceGraph(workspaceId, graph)
    await this.tryWrite(async () => {
      await this.redis
        .multi()
        .set(this.workspaceGraphKey(workspaceId), JSON.stringify(graph), 'EX', this.ttlSeconds)
        .sadd(this.workspaceIndexKey(), workspaceId)
        .expire(this.workspaceIndexKey(), this.ttlSeconds)
        .zadd(this.workspaceUpdatedSetKey(), Date.now(), workspaceId)
        .exec()
    })
  }

  async getWorkspaceGraph(workspaceId: string) {
    const graph = await this.tryRead(async () => {
      const payload = await this.redis.get(this.workspaceGraphKey(workspaceId))
      if (!payload) return null
      const parsed = JSON.parse(payload) as CanvasGraph
      await this.fallback.setWorkspaceGraph(workspaceId, parsed)
      return parsed
    })
    return graph ?? this.fallback.getWorkspaceGraph(workspaceId)
  }

  async setPendingApproval(conversationId: string, data: PendingApprovalData) {
    await this.fallback.setPendingApproval(conversationId, data)
    await this.tryWrite(async () => {
      const ttl = Math.max(1, Math.ceil(data.timeoutMs / 1000))
      await this.redis.set(
        this.pendingApprovalKey(conversationId),
        JSON.stringify(data),
        'EX',
        ttl
      )
    })
  }

  async getPendingApproval(conversationId: string) {
    const data = await this.tryRead(async () => {
      const payload = await this.redis.get(this.pendingApprovalKey(conversationId))
      if (!payload) return null
      const parsed = JSON.parse(payload) as PendingApprovalData
      await this.fallback.setPendingApproval(conversationId, parsed)
      return parsed
    })
    return data ?? this.fallback.getPendingApproval(conversationId)
  }

  async deletePendingApproval(conversationId: string) {
    await this.fallback.deletePendingApproval(conversationId)
    await this.tryWrite(async () => {
      await this.redis.del(this.pendingApprovalKey(conversationId))
    })
  }

  async close() {
    await this.fallback.close()
    await this.redis.quit().catch(() => {
      // no-op
    })
  }

  private async ensureConnected() {
    if (this.redis.status === 'ready' || this.redis.status === 'connect') return
    await this.redis.connect()
  }

  private async tryWrite(write: () => Promise<void>) {
    if (!this.available) return

    try {
      await this.ensureConnected()
      await write()
    } catch (error) {
      this.available = false
      console.error('[conversation-runtime-repository] redis write failed, fallback to memory', {
        error: String(error)
      })
    }
  }

  private async tryRead<T>(read: () => Promise<T | null>): Promise<T | null> {
    if (!this.available) return null

    try {
      await this.ensureConnected()
      return await read()
    } catch (error) {
      this.available = false
      console.error('[conversation-runtime-repository] redis read failed, fallback to memory', {
        error: String(error)
      })
      return null
    }
  }

  private recordKey(id: string) {
    return `${this.keyPrefix}:record:${id}`
  }

  private workspaceGraphKey(workspaceId: string) {
    return `${this.keyPrefix}:workspace:${workspaceId}:graph`
  }

  private workspaceConversationSetKey(workspaceId: string) {
    return `${this.keyPrefix}:workspace:${workspaceId}:conversations`
  }

  private workspaceAssetKey(workspaceId: string, assetId: string) {
    return `${this.keyPrefix}:workspace:${workspaceId}:asset:${encodeURIComponent(assetId)}`
  }

  private workspaceAssetSetKey(workspaceId: string) {
    return `${this.keyPrefix}:workspace:${workspaceId}:assets`
  }

  private workspaceEventListKey(workspaceId: string) {
    return `${this.keyPrefix}:workspace:${workspaceId}:events`
  }

  private workspaceIndexKey() {
    return `${this.keyPrefix}:workspaces`
  }

  private workspaceUpdatedSetKey() {
    return `${this.keyPrefix}:workspace-updated`
  }

  private pendingApprovalKey(conversationId: string) {
    return `${this.keyPrefix}:pending-approval:${conversationId}`
  }

  private touchedSetKey() {
    return `${this.keyPrefix}:touched`
  }
}

export function createConversationRuntimeRepository(): ConversationRuntimeRepository {
  const config: RepositoryConfig = {
    maxConversations: Number(process.env.CONVERSATION_STORE_MAX_ITEMS ?? '200'),
    conversationTtlMs: Number(process.env.CONVERSATION_STORE_TTL_MS ?? '1800000'),
    maxRuntimeEventsPerWorkspace: Number(process.env.CONVERSATION_RUNTIME_EVENT_LIMIT ?? '400')
  }
  const driver = process.env.CONVERSATION_RUNTIME_STORE_DRIVER ?? 'memory'

  if (driver === 'redis') {
    return new RedisConversationRuntimeRepository(config)
  }

  return new InMemoryConversationRuntimeRepository(config)
}

function serializeRecord(record: ConversationRecord): SerializableConversationRecord {
  return {
    metadata: {
      ...record.metadata,
      createdAt: record.metadata.createdAt.toISOString(),
      updatedAt: record.metadata.updatedAt.toISOString()
    },
    graph: cloneGraph(record.graph),
    knowledgeEvidence: cloneKnowledgeEvidence(record.knowledgeEvidence),
    citations: cloneCitations(record.citations)
  }
}

function deserializeRecord(payload: string): ConversationRecord {
  const parsed = JSON.parse(payload) as SerializableConversationRecord
  return {
    metadata: {
      ...parsed.metadata,
      createdAt: new Date(parsed.metadata.createdAt),
      updatedAt: new Date(parsed.metadata.updatedAt)
    },
    graph: cloneGraph(parsed.graph),
    knowledgeEvidence: cloneKnowledgeEvidence(parsed.knowledgeEvidence ?? []),
    citations: cloneCitations(parsed.citations ?? [])
  }
}

function cloneRecord(record: ConversationRecord): ConversationRecord {
  return {
    metadata: {
      ...record.metadata,
      createdAt: new Date(record.metadata.createdAt),
      updatedAt: new Date(record.metadata.updatedAt)
    },
    graph: cloneGraph(record.graph),
    knowledgeEvidence: cloneKnowledgeEvidence(record.knowledgeEvidence),
    citations: cloneCitations(record.citations)
  }
}

function cloneGraph(graph: CanvasGraph): CanvasGraph {
  return {
    workspaceId: graph.workspaceId,
    nodes: [...graph.nodes],
    edges: [...graph.edges]
  }
}

function cloneKnowledgeEvidence(knowledgeEvidence: KnowledgeEvidence[]) {
  return knowledgeEvidence.map((item) => ({
    ...item,
    metadata: item.metadata ? { ...item.metadata } : undefined
  }))
}

function cloneCitations(citations: CardCitation[]): CardCitation[] {
  return citations.map((c) => ({
    cardId: c.cardId,
    fieldName: c.fieldName,
    spans: c.spans.map((s) => ({
      textStart: s.textStart,
      textEnd: s.textEnd,
      refs: s.refs.map((r) => ({ ...r }))
    }))
  }))
}

function cloneAsset(asset: WorkspaceAsset): WorkspaceAsset {
  return JSON.parse(JSON.stringify(asset)) as WorkspaceAsset
}

function cloneConversationEvent(event: ConversationEvent): ConversationEvent {
  return JSON.parse(JSON.stringify(event)) as ConversationEvent
}
