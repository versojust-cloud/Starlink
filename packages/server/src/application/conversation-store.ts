import { nanoid } from 'nanoid'
import type {
  CanvasEdge,
  CanvasGraph,
  CardCitation,
  CitationSpan,
  WorkspaceMetadataUpdateInput,
  CanvasNode,
  CommunityPostInput,
  ConversationEvent,
  ConversationMetadata,
  ConversationMessage,
  KnowledgeEvidence,
  MemoryItem,
  MemoryKind,
  MemoryScope,
  PracticeSessionInput,
  WorkspaceDirectoryItem,
  WorkspaceMetadataHistoryEntry,
  WorkspaceAsset,
  WorkspaceContextSnapshot,
  SeminarPhase
} from '@starlink/shared'
import {
  canvasEdgeSchema,
  canvasNodeSchema,
  conversationEventSchema,
  conversationMetadataSchema
} from '@starlink/shared'
import { BusinessLangGraphService, type BusinessStreamUpdate, type GraphDelta } from '../services/business-langgraph.js'
import { MentionRouter, type MentionResult } from '../services/mention-router.js'
import type { ConversationEventBus, ConversationEventFilter } from './conversation-event-bus.js'
import type {
  ConversationRecord,
  ConversationRuntimeRepository,
  PendingApprovalData
} from './conversation-runtime-repository.js'
import { ConversationSessionStore } from './conversation-session-store.js'
import { WorkspaceGraphStore } from './workspace-graph-store.js'
import { WorkspaceAssetStore } from './workspace-asset-store.js'
import { RuntimeEventStore } from './runtime-event-store.js'
import { ConversationMemoryStore, type AppendMessageInput, type UpsertMemoryInput } from './conversation-memory-store.js'
// Re-export for back-compat: external callers (resolvers, tests) can
// keep importing { WorkspaceLockError } from this module. The class
// itself lives in its own file so test runners can import it without
// pulling in the PG pool's module-load-time DATABASE_URL check.
export { WorkspaceLockError } from './workspace-lock-error.js'
import { WorkspaceLockError } from './workspace-lock-error.js'
import { HitlApprovalStore } from './hitl-approval-store.js'
import { parseHitlDecision } from './hitl-resume.js'
import { WorkspaceContextBuilder } from './workspace-context-builder.js'
import { applyGraphDelta } from './graph-delta.js'
import { BmcFlowAdapter } from '../engine/bmc-flow-adapter.js'
import type { ToolRegistry } from '../tool-registry/registry.js'
import { streamBmcFlowConversation } from './bmc-flow-conversation-stream.js'
import {
  readBmcFlowRuntime,
  shouldUseBmcTemplateRuntime,
  type BmcFlowRuntime
} from './bmc-runtime-selection.js'
import {
  getWorkspaceMetadata as getWorkspaceMetadataPg,
  listWorkspaceMetadata as listWorkspaceMetadataPg,
  listWorkspaceMetadataHistory as listWorkspaceMetadataHistoryPg,
  updateWorkspaceMetadata as updateWorkspaceMetadataPg
} from './workspace-metadata-pg-store.js'
import {
  getWorkspaceMetadata as getWorkspaceMetadataFile,
  listWorkspaceMetadata as listWorkspaceMetadataFile,
  listWorkspaceMetadataHistory as listWorkspaceMetadataHistoryFile,
  updateWorkspaceMetadata as updateWorkspaceMetadataFile
} from './workspace-metadata-store.js'
import {
  getViewerPermissions,
  requireWorkspacePermission,
  type WorkspaceMetadataRecord
} from './workspace-access.js'

const usePg = (process.env.WORKSPACE_METADATA_DRIVER ?? 'pg') === 'pg'
const getWorkspaceMetadata = usePg ? getWorkspaceMetadataPg : getWorkspaceMetadataFile
const listWorkspaceMetadata = usePg ? listWorkspaceMetadataPg : listWorkspaceMetadataFile
const listWorkspaceMetadataHistory = usePg ? listWorkspaceMetadataHistoryPg : listWorkspaceMetadataHistoryFile
const updateWorkspaceMetadata = usePg ? updateWorkspaceMetadataPg : updateWorkspaceMetadataFile

/**
 * P12 fix N2 · short-lived metadata cache. See assertWorkspacePermission
 * for why. Cache entry hits the PG once per workspace per ~1s; concurrent
 * callers reach the same in-flight Promise so they don't all fire
 * parallel queries on cold cache.
 */
const METADATA_CACHE_TTL_MS = 1000
const metadataCache = new Map<
  string,
  { promise: Promise<WorkspaceMetadataRecord>; expiresAt: number }
>()
async function getWorkspaceMetadataCached(
  workspaceId: string,
  seedOwnerId: string
): Promise<WorkspaceMetadataRecord> {
  const now = Date.now()
  const cached = metadataCache.get(workspaceId)
  if (cached && cached.expiresAt > now) {
    return cached.promise
  }
  const promise = getWorkspaceMetadata(workspaceId, { id: seedOwnerId })
  // Cache the in-flight promise so concurrent first-callers share it
  // (5 parallel resolvers on cold cache → 1 PG query, not 5).
  metadataCache.set(workspaceId, { promise, expiresAt: now + METADATA_CACHE_TTL_MS })
  // Drop from cache on rejection so a transient failure doesn't poison
  // the next 1s of requests.
  promise.catch(() => {
    const current = metadataCache.get(workspaceId)
    if (current?.promise === promise) metadataCache.delete(workspaceId)
  })
  return promise
}
export type ConversationStoreDeps = {
  eventBus: ConversationEventBus
  runtimeRepository: ConversationRuntimeRepository
  businessLangGraphService?: BusinessLangGraphService
  bmcFlowAdapter?: BmcFlowAdapter
  toolRegistry?: ToolRegistry
  bmcFlowRuntime?: BmcFlowRuntime
  /** Task B · optional PG-backed HITL store. When provided, decisions are
   *  also written to PG so a different gateway instance / a post-restart
   *  process can resume HITL via `decide()`. The in-memory resolver map
   *  remains for same-process fast-path. */
  hitlApprovalStore?: HitlApprovalStore | null
}

export class ConversationStore {
  private readonly eventBus: ConversationEventBus
  private readonly runtimeRepository: ConversationRuntimeRepository
  private readonly sessionStore: ConversationSessionStore
  private readonly graphStore: WorkspaceGraphStore
  private readonly assetStore: WorkspaceAssetStore
  private readonly eventStore: RuntimeEventStore
  private readonly memoryStore: ConversationMemoryStore
  private readonly contextBuilder: WorkspaceContextBuilder
  private readonly businessLangGraphService: BusinessLangGraphService
  private readonly mentionRouter: MentionRouter
  private readonly bmcFlowAdapter: BmcFlowAdapter | null
  private readonly toolRegistry: ToolRegistry | null
  private readonly bmcFlowRuntime: BmcFlowRuntime
  // Wave 3 A: the in-memory resolver Map serves the same-instance fast-path
  // (one tick to resume). The PG-backed `hitlApprovalStore` provides cross-
  // restart durability via dual-write AND cross-instance resume via
  // LISTEN/NOTIFY — see `hitlDecisionUnsubscribe` below. The two sources are
  // idempotent: whichever wakes the resolver first wins; the loser's call is
  // a no-op because `pendingDecisionResolvers.delete()` runs synchronously
  // inside `finalize()` before the second wakeup arrives.
  private readonly pendingDecisionTimeouts = new Map<string, NodeJS.Timeout>()
  private readonly pendingDecisionResolvers = new Map<string, (decision: string) => void>()
  private readonly hitlApprovalStore: HitlApprovalStore | null
  private readonly hitlEnabled = process.env.HITL_ENABLED === 'true'
  private readonly hitlApprovalTimeoutMs = Number(process.env.HITL_APPROVAL_TIMEOUT_MS ?? '600000')
  // Wave 3 A: a single process-wide LISTEN subscription routes every decision
  // notification to the resolver Map. Lazily created on first
  // `waitForDecisionApproval` call; torn down when `close()` runs.
  private hitlDecisionUnsubscribe: (() => void) | null = null

  constructor({
    eventBus,
    runtimeRepository,
    businessLangGraphService = new BusinessLangGraphService(),
    bmcFlowAdapter,
    toolRegistry,
    bmcFlowRuntime = readBmcFlowRuntime(),
    hitlApprovalStore
  }: ConversationStoreDeps) {
    this.eventBus = eventBus
    this.runtimeRepository = runtimeRepository
    this.businessLangGraphService = businessLangGraphService
    this.toolRegistry = toolRegistry ?? null
    this.bmcFlowAdapter = bmcFlowAdapter ?? (toolRegistry ? new BmcFlowAdapter(toolRegistry) : null)
    this.bmcFlowRuntime = bmcFlowRuntime
    this.sessionStore = new ConversationSessionStore(runtimeRepository)
    this.graphStore = new WorkspaceGraphStore(runtimeRepository)
    this.assetStore = new WorkspaceAssetStore(runtimeRepository)
    this.eventStore = new RuntimeEventStore(runtimeRepository, eventBus)
    this.memoryStore = new ConversationMemoryStore()
    // P15 · pass a message-fetcher closure so MentionRouter can pull
    // prior user messages (the /chat seed) as agent context. Without
    // this, the first @-mention on a fresh canvas has no idea what the
    // user's pitch was — agents refuse and force a re-paste.
    const memStore = this.memoryStore
    this.mentionRouter = new MentionRouter(
      businessLangGraphService,
      undefined,
      async (conversationId, limit) => {
        const rows = await memStore.listMessages(conversationId, limit)
        return rows.map((m) => ({
          role: (m.role === 'user' ? 'user' : m.role === 'system' ? 'system' : 'ai') as
            | 'user'
            | 'ai'
            | 'system',
          content: m.content,
          createdAt: typeof m.createdAt === 'string' ? m.createdAt : String(m.createdAt)
        }))
      }
    )
    this.contextBuilder = new WorkspaceContextBuilder(this.memoryStore)
    this.hitlApprovalStore = hitlApprovalStore === undefined
      ? (this.hitlEnabled ? new HitlApprovalStore() : null)
      : hitlApprovalStore
  }

  async startConversation(
    workspaceId: string,
    userId: string,
    question: string,
    kbId?: string,
    /**
     * Sprint 1.3 · Headless mode. When true, all critic interrupts are
     * auto-resolved with `[ACCEPTED]` so the pipeline doesn't hang
     * waiting for human-in-the-loop input. Used by the in-chat wizard
     * graduation path (no human in the loop) + scripted runs.
     *
     * The auto-accept happens at HitlApprovalStore level (resume directive
     * pre-set so the next interrupt-resume cycle finds it immediately).
     */
    options: { headless?: boolean } = {}
  ): Promise<ConversationRecord> {
    await this.assertWorkspacePermission(workspaceId, userId, 'workspace.write')

    // DEC-5 soft-lock: refuse to start a second conversation while another
    // is still running in this workspace. Without this, the two graphs
    // race on memory_items inserts (sourceId conflicts → archived rows) +
    // canvas writes (last-writer-wins for graph snapshot). Frontend should
    // catch WORKSPACE_HAS_ACTIVE_CONVERSATION and offer "open the active
    // one" or "cancel and start fresh" rather than retry blindly.
    const active = await this.memoryStore.findActiveSession(workspaceId)
    if (active) {
      throw new WorkspaceLockError(workspaceId, active.id)
    }

    const existingGraph = await this.getGraph(workspaceId)
    const id = nanoid()
    const contextSnapshot = await this.contextBuilder.build({
      workspaceId,
      userId,
      conversationId: id,
      query: question,
      kbId,
      graph: existingGraph
    })
    const knowledgeEvidence: KnowledgeEvidence[] = contextSnapshot.knowledgeEvidence
    const startedAt = new Date()
    const metadata: ConversationMetadata = {
      id,
      createdAt: startedAt,
      updatedAt: startedAt,
      status: 'running',
      latestQuestion: question
    }

    const record: ConversationRecord = {
      metadata,
      graph: existingGraph,
      knowledgeEvidence,
      citations: []
    }

    await this.sessionStore.createConversation(id, record)
    await this.graphStore.setWorkspaceGraph(workspaceId, record.graph)
    await this.memoryStore.createSession({
      id,
      workspaceId,
      userId,
      title: buildConversationTitle(question),
      status: 'running',
      latestQuestion: question,
      contextSnapshot: contextSnapshot as unknown as Record<string, unknown>
    })
    await this.memoryStore.appendMessage({
      conversationId: id,
      workspaceId,
      userId,
      role: 'user',
      content: question,
      metadata: {
        kbId: kbId ?? null,
        evidenceCount: knowledgeEvidence.length
      }
    })

    const stream = this.createBusinessStream({
      workspaceId,
      userId,
      question,
      traceId: id,
      baseGraph: existingGraph,
      knowledgeEvidence,
      contextPrompt: contextSnapshot.promptBlock,
      headless: options.headless === true
    })
    let initialized = false

    try {
      const initResult = await stream.next()
      if (!initResult.done && initResult.value?.type === 'init') {
        initialized = true
        const currentGraph = initResult.value.graph
        record.graph = currentGraph
        await this.graphStore.setWorkspaceGraph(workspaceId, currentGraph)
        await this.sessionStore.updateConversation(id, record)
        await this.persistGraphWithWarning(workspaceId, id, currentGraph)
        const baseEvent: ConversationEvent = {
          type: 'graph/appended',
          conversationId: id,
          payload: currentGraph
        }
        await this.publishEvent(workspaceId, baseEvent)

        if (knowledgeEvidence.length > 0) {
          const evidenceEvent: ConversationEvent = {
            type: 'evidence/updated',
            conversationId: id,
            payload: knowledgeEvidence
          }
          await this.publishEvent(workspaceId, evidenceEvent)
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const failedEvent: ConversationEvent = {
        type: 'status',
        conversationId: id,
        status: 'failed',
        message
      }
      await this.publishEvent(workspaceId, failedEvent)
      record.metadata = {
        ...record.metadata,
        status: 'failed',
        updatedAt: new Date()
      }
      await this.sessionStore.updateConversation(id, record)
      return record
    }

    setTimeout(() => {
      void this.runConversationStream({
        stream,
        record,
        workspaceId,
        userId,
        conversationId: id,
        initialized,
        headless: options.headless === true
      })
    }, 0)

    return record
  }

  async getConversation(id: string, userId?: string): Promise<ConversationRecord | null> {
    const record = await this.sessionStore.getConversation(id)
    if (!record) return null
    if (userId) {
      await this.assertWorkspacePermission(record.graph.workspaceId, userId, 'workspace.read')
    }
    const metadata = conversationMetadataSchema.parse(record.metadata)
    return {
      ...record,
      metadata
    }
  }

  async listConversationRuntimeEvents(
    workspaceId: string,
    userId: string,
    conversationId?: string
  ): Promise<ConversationEvent[]> {
    await this.assertWorkspacePermission(workspaceId, userId, 'workspace.read')
    if (conversationId) {
      await this.assertConversationBelongsToWorkspace(workspaceId, conversationId)
    }
    const events = await this.eventStore.listConversationEvents(workspaceId, conversationId)
    return events.map((event) => conversationEventSchema.parse(event))
  }

  async listConversationSessions(
    workspaceId: string,
    userId: string,
    limit?: number
  ) {
    await this.assertWorkspacePermission(workspaceId, userId, 'workspace.read')
    return await this.memoryStore.listSessions(workspaceId, limit ?? 20)
  }

  async listConversationMessages(
    workspaceId: string,
    userId: string,
    conversationId: string,
    limit?: number
  ): Promise<ConversationMessage[]> {
    await this.assertWorkspacePermission(workspaceId, userId, 'workspace.read')
    await this.assertConversationBelongsToWorkspaceOrSession(workspaceId, conversationId)
    return await this.memoryStore.listMessages(conversationId, limit ?? 30)
  }

  async listWorkspaceMemories(
    workspaceId: string,
    userId: string,
    options: {
      query?: string | null
      scope?: string | null
      kind?: string | null
      limit?: number | null
    } = {}
  ): Promise<MemoryItem[]> {
    await this.assertWorkspacePermission(workspaceId, userId, 'workspace.read')
    return await this.memoryStore.listMemories(workspaceId, {
      query: options.query ?? undefined,
      scope: parseMemoryScope(options.scope),
      kind: parseMemoryKind(options.kind),
      limit: options.limit ?? undefined
    })
  }

  async buildWorkspaceContextSnapshot(
    workspaceId: string,
    userId: string,
    query: string,
    options: { conversationId?: string | null; kbId?: string | null } = {}
  ): Promise<WorkspaceContextSnapshot> {
    await this.assertWorkspacePermission(workspaceId, userId, 'workspace.read')
    if (options.conversationId) {
      await this.assertConversationBelongsToWorkspaceOrSession(workspaceId, options.conversationId)
    }
    const graph = await this.getGraph(workspaceId)
    return await this.contextBuilder.build({
      workspaceId,
      userId,
      query,
      conversationId: options.conversationId ?? null,
      kbId: options.kbId ?? null,
      graph
    })
  }

  async appendConversationMessage(
    input: Omit<AppendMessageInput, 'role'> & { role: string },
    userId: string
  ): Promise<ConversationMessage> {
    await this.assertWorkspacePermission(input.workspaceId, userId, 'workspace.write')
    await this.assertConversationBelongsToWorkspaceOrSession(input.workspaceId, input.conversationId)
    return await this.memoryStore.appendMessage({
      ...input,
      userId: input.role === 'user' ? userId : input.userId ?? userId,
      role: parseMessageRole(input.role)
    })
  }

  async createMemoryItem(
    input: Omit<UpsertMemoryInput, 'scope' | 'kind'> & { scope?: string | null; kind?: string | null },
    userId: string
  ): Promise<MemoryItem> {
    await this.assertWorkspacePermission(input.workspaceId, userId, 'workspace.write')
    return await this.memoryStore.upsertMemory({
      ...input,
      userId: input.userId ?? userId,
      scope: parseMemoryScope(input.scope) ?? 'workspace',
      // P14 P2 · `insight` legacy default replaced with `summary`. Old
      // 'insight' write path was used as a generic fallback; new code
      // should specify (facet, category) explicitly via upsertMemory's
      // canonical axes — this default only fires when callers omit kind
      // entirely (rare).
      kind: parseMemoryKind(input.kind) ?? 'summary',
      sourceType: input.sourceType ?? 'manual'
    })
  }

  async extractConversationMemory(conversationId: string, userId: string): Promise<MemoryItem[]> {
    const record = await this.sessionStore.getConversation(conversationId)
    const persistedSession = await this.memoryStore.getSession(conversationId)
    const workspaceId = record?.graph.workspaceId ?? persistedSession?.workspaceId
    if (!workspaceId) return []

    await this.assertWorkspacePermission(workspaceId, userId, 'workspace.write')
    const graph = record?.graph ?? await this.getGraph(workspaceId)
    const question = record?.metadata.latestQuestion ?? persistedSession?.latestQuestion ?? null
    const decision = findLatestDecision(graph)
    return await this.memoryStore.captureConversationOutcome({
      workspaceId,
      userId,
      conversationId,
      question,
      graph,
      decision,
      evidenceCount: record?.knowledgeEvidence.length ?? 0
    })
  }

  async assertWorkspaceAccess(
    workspaceId: string,
    userId: string,
    requiredPermission: 'workspace.read' | 'workspace.write' | 'workspace.publish' | 'workspace.manage'
  ) {
    await this.assertWorkspacePermission(workspaceId, userId, requiredPermission)
  }

  async assertConversationScope(workspaceId: string, userId: string, conversationId?: string) {
    await this.assertWorkspacePermission(workspaceId, userId, 'workspace.read')
    if (!conversationId) return
    await this.assertConversationBelongsToWorkspace(workspaceId, conversationId)
  }

  async getGraph(workspaceId: string, userId?: string): Promise<CanvasGraph> {
    if (userId) {
      await this.assertWorkspacePermission(workspaceId, userId, 'workspace.read')
    }

    const manualGraph = await this.graphStore.getWorkspaceGraph(workspaceId)
    if (manualGraph) {
      return {
        workspaceId: manualGraph.workspaceId,
        nodes: [...manualGraph.nodes],
        edges: [...manualGraph.edges]
      }
    }

    const workspaceConversations = await this.sessionStore.getConversationsByWorkspace(workspaceId)
    const existing = workspaceConversations[0]?.record
    if (existing) {
      await this.graphStore.setWorkspaceGraph(workspaceId, existing.graph)
      return {
        workspaceId,
        nodes: [...existing.graph.nodes],
        edges: [...existing.graph.edges]
      }
    }

    const persistedGraph = await this.graphStore.loadPersistedGraph(workspaceId)
    if (persistedGraph) {
      await this.graphStore.setWorkspaceGraph(workspaceId, persistedGraph)
      return {
        workspaceId,
        nodes: [...persistedGraph.nodes],
        edges: [...persistedGraph.edges]
      }
    }

    const emptyGraph: CanvasGraph = {
      workspaceId,
      nodes: [],
      edges: []
    }
    await this.graphStore.setWorkspaceGraph(workspaceId, emptyGraph)
    return emptyGraph
  }

  async listWorkspaces(userId: string): Promise<WorkspaceDirectoryItem[]> {
    const workspaces = await this.runtimeRepository.listWorkspaces()
    const metadataRecords = await listWorkspaceMetadata()
    const runtimeById = new Map(workspaces.map((workspace) => [workspace.workspaceId, workspace] as const))
    const knownIds = new Set<string>([
      ...metadataRecords.map((item) => item.workspaceId),
      ...workspaces.map((item) => item.workspaceId)
    ])

    return await Promise.all([...knownIds].map(async (workspaceId) => {
      const metadata = await getWorkspaceMetadata(workspaceId)
      const runtime = runtimeById.get(workspaceId)
      const viewerPermissions = getViewerPermissions(userId, metadata.members)
      return {
        workspaceId,
        name: metadata.name,
        type: metadata.type,
        focus: metadata.focus,
        ownerId: metadata.ownerId,
        ownerName: metadata.ownerName,
        members: metadata.members,
        viewerPermissions,
        canManage: viewerPermissions.includes('workspace.manage'),
        status: runtime?.status ?? 'draft',
        updatedAt: runtime?.updatedAt ?? new Date().toISOString()
      }
    })).then((items) => items.filter((workspace) => workspace.viewerPermissions.length > 0))
  }

  async listWorkspaceHistory(workspaceId: string, userId: string): Promise<WorkspaceMetadataHistoryEntry[]> {
    await this.assertWorkspacePermission(workspaceId, userId, 'workspace.read')
    return await listWorkspaceMetadataHistory(workspaceId)
  }

  async updateWorkspace(input: WorkspaceMetadataUpdateInput, userId: string): Promise<WorkspaceDirectoryItem> {
    const currentMetadata = await getWorkspaceMetadata(input.workspaceId)
    let viewerPermissions: string[]
    try {
      viewerPermissions = this.assertPermissionFromMetadata(currentMetadata, userId, 'workspace.manage')
    } catch (error) {
      if (error instanceof Error && error.message === 'FORBIDDEN_WORKSPACE') {
        throw new Error('FORBIDDEN_WORKSPACE_METADATA')
      }
      throw error
    }

    const { workspace: metadata } = await updateWorkspaceMetadata(input, userId)
    const runtime = (await this.runtimeRepository.listWorkspaces()).find(
      (workspace) => workspace.workspaceId === input.workspaceId
    )
    const nextViewerPermissions = getViewerPermissions(userId, metadata.members)

    return {
      workspaceId: metadata.workspaceId,
      name: metadata.name,
      type: metadata.type,
      focus: metadata.focus,
      ownerId: metadata.ownerId,
      ownerName: metadata.ownerName,
      members: metadata.members,
      viewerPermissions: nextViewerPermissions,
      canManage: nextViewerPermissions.includes('workspace.manage'),
      status: runtime?.status ?? 'draft',
      updatedAt: runtime?.updatedAt ?? new Date().toISOString()
    }
  }

  async listWorkspaceAssets(workspaceId: string, userId: string): Promise<WorkspaceAsset[]> {
    await this.assertWorkspacePermission(workspaceId, userId, 'workspace.read')
    return await this.assetStore.listWorkspaceAssets(workspaceId)
  }

  async saveCommunityPost(input: CommunityPostInput, userId: string): Promise<WorkspaceAsset> {
    await this.assertWorkspacePermission(input.workspaceId, userId, 'workspace.write')

    const createdAt = new Date().toISOString()
    const postId = nanoid()
    const asset: WorkspaceAsset = {
      assetId: `community:${postId}`,
      workspaceId: input.workspaceId,
      assetType: 'community-post',
      title: input.title,
      sourceModule: 'community',
      sourceTaskId: null,
      metadata: {
        tags: input.tags,
        authorName: input.authorName,
        authorRole: input.authorRole ?? null
      },
      content: {
        id: postId,
        workspaceId: input.workspaceId,
        title: input.title,
        body: input.body,
        tags: input.tags,
        authorName: input.authorName,
        authorRole: input.authorRole ?? null,
        createdAt
      },
      version: 1,
      status: 'published',
      createdBy: userId,
      createdAt,
      updatedAt: createdAt
    }

    await this.assetStore.upsertWorkspaceAsset(asset)
    return asset
  }

  async savePracticeSession(input: PracticeSessionInput, userId: string): Promise<WorkspaceAsset> {
    await this.assertWorkspacePermission(input.workspaceId, userId, 'workspace.write')

    const updatedAt = input.lastUpdated ?? new Date().toISOString()
    const assetId = `practice:${input.workspaceId}:${input.scenarioId}`
    const current = (await this.assetStore.listWorkspaceAssets(input.workspaceId))
      .find((asset) => asset.assetId === assetId)
    const asset: WorkspaceAsset = {
      assetId,
      workspaceId: input.workspaceId,
      assetType: 'practice-output',
      title: input.scenarioTitle?.trim() ? `Practice Session · ${input.scenarioTitle}` : `Practice Session · ${input.scenarioId}`,
      sourceModule: 'practice',
      sourceTaskId: null,
      metadata: {
        scenarioId: input.scenarioId,
        messageCount: input.messages.length,
        insightCount: input.insights.length,
        resourceCount: input.resources.length
      },
      content: {
        scenarioId: input.scenarioId,
        scenarioTitle: input.scenarioTitle ?? null,
        messages: input.messages,
        insights: input.insights,
        resources: input.resources,
        quickReplies: input.quickReplies,
        lastUpdated: updatedAt
      },
      version: Math.max(current?.version ?? 0, input.messages.length),
      status: input.messages.length > 1 ? 'ready' : 'draft',
      createdBy: current?.createdBy ?? userId,
      createdAt: current?.createdAt ?? updatedAt,
      updatedAt
    }

    await this.assetStore.upsertWorkspaceAsset(asset)
    return asset
  }

  /**
   * @-mention agent (2026-05-04). Reads the current canvas snapshot, calls
   * MentionRouter.mention to get a single-shot agent response, then writes
   * any appended nodes/edges to the workspace graph and returns the result.
   *
   * Permission: workspace.write (the mention may add canvas nodes).
   * Refusals (e.g. critic without BMC) DO NOT mutate the canvas — the
   * MentionResult is returned with refused=true and an explanation.
   */
  async mentionAgent(
    workspaceId: string,
    userId: string,
    input: { agentId: string; message: string; conversationId?: string; priorChat?: string[] }
  ): Promise<MentionResult> {
    await this.assertWorkspacePermission(workspaceId, userId, 'workspace.write')
    const baseGraph = await this.getGraph(workspaceId)
    // P15 · build priorContext from client-supplied chat history. The
    // /chat homepage stores its seed in localStorage and the chat dock
    // never persists user messages to conversation_messages, so the
    // server-side fetcher comes up empty on first @-mention. Trust
    // the client for context (it's just text, not state).
    const priorContext = (() => {
      if (!input.priorChat || input.priorChat.length === 0) return undefined
      const useful = input.priorChat
        .map((m) => m.trim())
        .filter((m) => m.length > 0)
        .filter((m) => !/^\s*@\w[-\w]*\s+/.test(m) || m.length > 80)
      if (useful.length === 0) return undefined
      const seed = useful[0]
      const tail = useful.slice(1).slice(-2)
      const unique = [seed, ...tail.filter((m) => m !== seed)]
      const lines = unique.map((m, i) => `[${i === 0 ? '原始 idea' : `近期补充 ${i}`}] ${m.slice(0, 400)}`)
      return `## 用户先前在本对话里说过的话\n${lines.join('\n')}`
    })()
    const result = await this.mentionRouter.mention({
      workspaceId,
      userId,
      conversationId: input.conversationId,
      agentId: input.agentId,
      message: input.message,
      canvasNodes: baseGraph.nodes,
      canvasEdges: baseGraph.edges,
      knowledgeEvidence: [],
      priorContext
    })

    if (!result.refused && (result.appendedNodes.length > 0 || result.appendedEdges.length > 0)) {
      const newNodeIds = new Set(result.appendedNodes.map((n) => n.id))
      const newEdgeIds = new Set(result.appendedEdges.map((e) => e.id))
      const newNodes: CanvasNode[] = result.appendedNodes.map((n) =>
        canvasNodeSchema.parse({
          id: n.id,
          type: n.type,
          position: n.position,
          data: n.data
        })
      )
      const newEdges: CanvasEdge[] = result.appendedEdges.map((e) =>
        // P11.15 · preserve `kind` through mention persistence so the
        // bmc-structure / llm-insight / user-drawn / revision tag
        // survives the DB round-trip and the frontend renders the
        // correct visual style.
        canvasEdgeSchema.parse({
          id: e.id,
          source: e.source,
          target: e.target,
          label: e.label ?? null,
          kind: e.kind
        })
      )
      const updatedGraph: CanvasGraph = {
        workspaceId,
        nodes: [...baseGraph.nodes.filter((n) => !newNodeIds.has(n.id)), ...newNodes],
        edges: [...baseGraph.edges.filter((e) => !newEdgeIds.has(e.id)), ...newEdges]
      }
      await this.graphStore.setWorkspaceGraph(workspaceId, updatedGraph)
      // P12 · Use warning helper when we have a conversation context
      // (mention came from an active chat); otherwise let it throw so
      // the GraphQL mutation surfaces the error to the caller.
      if (input.conversationId) {
        await this.persistGraphWithWarning(workspaceId, input.conversationId, updatedGraph)
      } else {
        await this.graphStore.persistGraph(updatedGraph)
      }

      const conversations = await this.sessionStore.getConversationsByWorkspace(workspaceId)
      for (const item of conversations) {
        const nextRecord: ConversationRecord = {
          ...item.record,
          graph: {
            ...item.record.graph,
            nodes: updatedGraph.nodes,
            edges: updatedGraph.edges
          }
        }
        await this.sessionStore.updateConversation(item.id, nextRecord)
      }
    }

    return result
  }

  async addNode(
    workspaceId: string,
    userId: string,
    input: { id?: string; type: string; position: { x: number; y: number }; data: unknown }
  ): Promise<CanvasNode> {
    await this.assertWorkspacePermission(workspaceId, userId, 'workspace.write')

    const id = input.id ?? nanoid()
    const parsed = canvasNodeSchema.parse({
      id,
      type: input.type,
      position: input.position,
      data: input.data
    })

    const baseGraph = await this.getGraph(workspaceId)

    const updatedNodes = [...baseGraph.nodes.filter((node) => node.id !== parsed.id), parsed]
    const updatedGraph: CanvasGraph = {
      workspaceId,
      nodes: updatedNodes,
      edges: baseGraph.edges
    }

    await this.graphStore.setWorkspaceGraph(workspaceId, updatedGraph)
    await this.graphStore.persistGraph(updatedGraph)

    const conversations = await this.sessionStore.getConversationsByWorkspace(workspaceId)
    for (const item of conversations) {
      const nextRecord: ConversationRecord = {
        ...item.record,
        graph: {
          ...item.record.graph,
          nodes: updatedNodes
        }
      }
      await this.sessionStore.updateConversation(item.id, nextRecord)
    }

    return parsed
  }

  async connectNodes(
    workspaceId: string,
    userId: string,
    input: { id?: string; source: string; target: string; label?: string | null }
  ): Promise<CanvasEdge> {
    await this.assertWorkspacePermission(workspaceId, userId, 'workspace.write')

    const id = input.id ?? nanoid()
    // P11.15 · user-drawn edges get kind='user-drawn' so the frontend
    // renders them in mid-gray solid (vs. light-gray dashed for the
    // rule-based BMC structure edges). This is the only edge-creation
    // path users hit directly via the connectNodes mutation; all other
    // edges originate from buildBMCEdges / synthesizer / mention-router.
    const parsed = canvasEdgeSchema.parse({
      id,
      source: input.source,
      target: input.target,
      label: input.label ?? null,
      kind: 'user-drawn' as const
    })

    const baseGraph = await this.getGraph(workspaceId)
    const updatedEdges = [...baseGraph.edges.filter((edge) => edge.id !== parsed.id), parsed]
    const updatedGraph: CanvasGraph = {
      workspaceId,
      nodes: baseGraph.nodes,
      edges: updatedEdges
    }

    await this.graphStore.setWorkspaceGraph(workspaceId, updatedGraph)
    await this.graphStore.persistGraph(updatedGraph)

    const conversations = await this.sessionStore.getConversationsByWorkspace(workspaceId)
    for (const item of conversations) {
      const nextRecord: ConversationRecord = {
        ...item.record,
        graph: {
          ...item.record.graph,
          edges: updatedEdges
        }
      }
      await this.sessionStore.updateConversation(item.id, nextRecord)
    }

    return parsed
  }

  getEventIterator(filter: ConversationEventFilter) {
    return this.eventStore.getEventIterator(filter)
  }

  async close() {
    for (const timeout of this.pendingDecisionTimeouts.values()) {
      clearTimeout(timeout)
    }
    this.pendingDecisionTimeouts.clear()
    this.pendingDecisionResolvers.clear()
    if (this.hitlDecisionUnsubscribe) {
      try {
        this.hitlDecisionUnsubscribe()
      } catch (error) {
        console.error('[conversation-store] hitl LISTEN unsubscribe failed', error)
      }
      this.hitlDecisionUnsubscribe = null
    }
    await this.runtimeRepository.close()
    await this.eventBus.close()
  }

  async approveDecision(conversationId: string, userId: string, decision?: string): Promise<boolean> {
    const pending = await this.sessionStore.getPendingApproval(conversationId)
    if (!pending) {
      return false
    }

    await this.assertWorkspacePermission(pending.workspaceId, userId, 'workspace.write')

    const nextDecision = (decision ?? '').trim() || pending.decision
    const resolver = this.pendingDecisionResolvers.get(conversationId)
    if (resolver) {
      resolver(nextDecision)
    }
    // Dual-write to PG store so a different gateway instance / a post-restart
    // worker can observe the decision. No-op when the store is not configured.
    if (this.hitlApprovalStore) {
      try {
        await this.hitlApprovalStore.decide(conversationId, nextDecision)
      } catch (error) {
        console.error('[conversation-store] hitl PG decide failed, in-memory resolver still ran', error)
      }
    }
    return true
  }

  private async runConversationStream(options: {
    stream: AsyncGenerator<BusinessStreamUpdate>
    record: ConversationRecord
    workspaceId: string
    userId: string
    conversationId: string
    initialized: boolean
    /** Sprint 1.3 · auto-accept HITL interrupts (no human in the loop). */
    headless?: boolean
  }) {
    let { stream, record, workspaceId, userId, conversationId, initialized, headless = false } = options
    let currentGraph = record.graph
    const emittedTurnNodeIds = new Set<string>()
    let currentPhase: SeminarPhase | null = null
    let latestDecision = ''

    const publishEvent = async (event: ConversationEvent) => {
      await this.publishEvent(workspaceId, event)
    }

    const publishPhaseChanged = async (phase: SeminarPhase, reason?: string | null) => {
      if (currentPhase === phase) return
      currentPhase = phase
      await publishEvent({
        type: 'phase.changed',
        conversationId,
        payload: {
          workspaceId,
          phase,
          reason: reason ?? null,
          occurredAt: new Date().toISOString()
        }
      })
    }

    const publishSeminarTurn = async (payload: Omit<ExtractRuntimeInfo, 'stage'> & { phase: SeminarPhase }) => {
      await publishEvent({
        type: 'seminar.turn.completed',
        conversationId,
        payload: {
          workspaceId,
          phase: payload.phase,
          agentId: payload.agentId,
          agentName: payload.agentName,
          nodeId: payload.nodeId,
          title: payload.title,
          summary: payload.summary,
          occurredAt: new Date().toISOString()
        }
      })
    }

    await publishPhaseChanged('planning', 'conversation.started')

    try {
      for await (const update of stream) {
        if (update.type === 'init') {
          currentGraph = update.graph
          record.graph = currentGraph
          await this.graphStore.setWorkspaceGraph(workspaceId, currentGraph)
          await this.persistGraphWithWarning(workspaceId, conversationId, currentGraph)
          record.knowledgeEvidence = update.knowledgeEvidence ?? []
          await this.sessionStore.updateConversation(conversationId, record)
          if (!initialized) {
            initialized = true
            const appendedEvent: ConversationEvent = {
              type: 'graph/appended',
              conversationId,
              payload: currentGraph
            }
            await this.publishEvent(workspaceId, appendedEvent)
          }
          if (record.knowledgeEvidence.length > 0) {
            const evidenceEvent: ConversationEvent = {
              type: 'evidence/updated',
              conversationId,
              payload: record.knowledgeEvidence
            }
            await this.publishEvent(workspaceId, evidenceEvent)
          }
          continue
        }

        if (update.type === 'delta') {
          currentGraph = applyGraphDelta(currentGraph, update.delta)
          record.graph = currentGraph
          await this.graphStore.setWorkspaceGraph(workspaceId, currentGraph)
          await this.sessionStore.updateConversation(conversationId, record)
          await this.persistGraphWithWarning(workspaceId, conversationId, currentGraph)

          const event: ConversationEvent = initialized
            ? {
                type: 'graph/diff',
              conversationId,
              payload: {
                nodes: update.delta.nodes,
                edges: update.delta.edges,
                removedNodeIds: update.delta.removedNodeIds,
                removedEdgeIds: update.delta.removedEdgeIds
              }
              }
            : {
                type: 'graph/appended',
                conversationId,
                payload: currentGraph
              }

          await publishEvent(event)
          initialized = true

          const deltaNodes = update.delta.nodes ?? []
          for (const node of deltaNodes) {
            const nodeCitations = extractCitationsFromNode(node)
            if (nodeCitations) {
              record.citations = upsertCardCitation(record.citations, nodeCitations)
              const groundingRate = extractGroundingRate(node)
              await publishEvent({
                type: 'card/cited',
                conversationId,
                payload: {
                  cardId: nodeCitations.cardId,
                  citation: nodeCitations,
                  groundingRate
                }
              })
            }

            const info = extractRuntimeInfo(node)
            if (!info) continue

            await publishPhaseChanged(info.stage, `from.${info.agentName}`)

            if (!emittedTurnNodeIds.has(node.id)) {
              emittedTurnNodeIds.add(node.id)
              await publishSeminarTurn({
                phase: info.stage,
                agentId: info.agentId,
                agentName: info.agentName,
                nodeId: node.id,
                title: info.title,
                summary: info.summary
              })
            }

            if (info.stage === 'decision' && info.summary.trim().length > 0) {
              latestDecision = info.summary
            }
          }
          continue
        }

        if (update.type === 'status') {
          continue
        }

        if (update.type === 'persistence-warning') {
          // P12 · Persistence visibility passthrough. The stream raised
          // a warning (e.g. writeConversationSummary memory_items insert
          // failed) — translate to a 'persistence/warning' ConversationEvent
          // and publish so the front-end chat dock renders a yellow ⚠
          // bubble. The conversation itself is unaffected.
          await publishEvent({
            type: 'persistence/warning',
            conversationId,
            payload: {
              severity: update.severity ?? 'warning',
              source: update.source,
              message: update.message
            }
          } as ConversationEvent)
          continue
        }

        if (update.type === 'subagent-progress') {
          // BMC subgraph internal state update (e.g. ToolNode invocation,
          // intermediate LLM call inside market/product/finance ReAct loop).
          // Surface to subscribers as a lightweight 'agent/subagent-progress'
          // ConversationEvent so the frontend can render breadcrumbs like
          // "market-agent is calling web-search…" between high-level
          // node-completion events.
          //
          // Payload kept narrow on purpose: full subgraph state lives in
          // the LangGraph checkpoint, never on the wire.
          await publishEvent({
            type: 'agent/subagent-progress',
            conversationId,
            payload: {
              ns: update.ns,
              nodeName: update.nodeName,
              payloadKeys: update.payloadKeys
            }
          } as ConversationEvent)
          continue
        }

        if (update.type === 'interrupt') {
          // Sprint 1.3 + Issue 1 · headless mode (wizard graduation, scripted
          // runs): skip the human wait. Auto-resolve as
          // `[EDIT_PLAN]:auto-revise` so:
          //   1. shouldHaltCriticLoop returns false → graph routes critic →
          //      supervisor → agents for round 2 (auto-revision)
          //   2. The supervisor sees an edit_plan directive with no dimension
          //      and falls into auto-revision with the body as guidance preamble
          // Sending [ACCEPTED] (the previous behavior) made the loop halt,
          // which masked high-severity conflicts and prevented round 2 from
          // ever firing. Avoids the 10-min HITL_APPROVAL_TIMEOUT_MS stall.
          if (headless) {
            const directive = parseHitlDecision(
              '[EDIT_PLAN]:auto-revise (headless graduation: re-run agents to address critic conflicts)'
            )
            if (directive.kind !== 'invalid') {
              await this.businessLangGraphService.setHitlResumeDirective(
                conversationId,
                directive
              )
            }
            record.metadata = {
              ...record.metadata,
              status: 'running',
              updatedAt: new Date()
            }
            await this.sessionStore.updateConversation(conversationId, record)
            continue
          }
          if (this.hitlEnabled) {
            const userDecision = await this.waitForDecisionApproval({
              conversationId,
              workspaceId,
              decision: update.decision,
              record
            })

            // Phase 2.6 · parse the human's decision and stash a directive
            // for the next supervisor revision round. The supervisor consumes
            // and clears the entry; this is the link between the GraphQL
            // mutation and the LangGraph node.
            //
            // `conversationId === traceId` in this app (see conversation
            // creation site that passes `traceId: id`).
            const directive = parseHitlDecision(userDecision)
            if (directive.kind === 'invalid') {
              console.warn(
                '[conversation-store] HITL decision parse failed; falling back to auto-revision',
                { conversationId, reason: directive.reason }
              )
            } else {
              await this.businessLangGraphService.setHitlResumeDirective(
                conversationId,
                directive
              )
            }

            record.metadata = {
              ...record.metadata,
              status: 'running',
              updatedAt: new Date()
            }
            await this.sessionStore.updateConversation(conversationId, record)

            await publishEvent({
              type: 'seminar.decision.made',
              conversationId,
              payload: {
                workspaceId,
                phase: 'decision' as const,
                decision: userDecision,
                occurredAt: new Date().toISOString()
              }
            })
          }
          continue
        }
      }

      if (!latestDecision) {
        latestDecision = findLatestDecision(currentGraph)
      }

      if (latestDecision) {
        if (this.hitlEnabled) {
          latestDecision = await this.waitForDecisionApproval({
            conversationId,
            workspaceId,
            decision: latestDecision,
            record
          })
        }

        await publishPhaseChanged('decision', 'seminar.final-decision')
        await publishEvent({
          type: 'seminar.decision.made',
          conversationId,
          payload: {
            workspaceId,
            phase: 'decision',
            decision: latestDecision,
            occurredAt: new Date().toISOString()
          }
        })
      }

      record.metadata = {
        ...record.metadata,
        status: 'completed',
        updatedAt: new Date()
      }
      await this.sessionStore.updateConversation(conversationId, record)

      // P12 race fix · run persistConversationCompletion BEFORE emitting
      // status='completed'. The frontend conversation-sync-engine cancels
      // the WS subscription as soon as status='completed' arrives, so any
      // 'persistence/warning' event emitted after the completion event
      // would be invisible to live subscribers (still saved to the ring
      // buffer, but the user would only see it after a separate reconnect
      // — which doesn't happen for a finished conversation). Order below
      // ensures the warning rides ahead of completion.
      await this.persistConversationCompletion({
        workspaceId,
        userId,
        conversationId,
        record,
        graph: currentGraph,
        decision: latestDecision
      })

      const completeEvent: ConversationEvent = {
        type: 'status',
        conversationId,
        status: 'completed'
      }
      await publishEvent(completeEvent)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const stack = error instanceof Error ? error.stack : undefined
      console.error('❌ [runConversationStream] Stream failed:', message)
      if (stack) {
        console.error('Stack trace:', stack)
      }
      record.metadata = {
        ...record.metadata,
        status: 'failed',
        updatedAt: new Date()
      }
      await this.sessionStore.updateConversation(conversationId, record)

      // P12 race fix · same reasoning as the success path: persistence
      // warning must fire before status='failed' so live subscribers
      // receive both events before unsubscribing.
      await this.persistConversationFailure({
        workspaceId,
        userId,
        conversationId,
        message
      })

      const failedEvent: ConversationEvent = {
        type: 'status',
        conversationId,
        status: 'failed',
        message
      }
      await publishEvent(failedEvent)
    }
  }

  private createBusinessStream(context: {
    workspaceId: string
    userId: string
    question: string
    traceId: string
    baseGraph: CanvasGraph
    knowledgeEvidence: KnowledgeEvidence[]
    contextPrompt: string
    /** Sprint 1.3 · headless mode short-circuits HITL waits (auto-accept). */
    headless?: boolean
  }): AsyncGenerator<BusinessStreamUpdate> {
    if (
      this.bmcFlowAdapter
      && shouldUseBmcTemplateRuntime({
        runtime: this.bmcFlowRuntime,
        question: context.question,
        toolRegistry: this.toolRegistry
      })
    ) {
      return streamBmcFlowConversation(this.bmcFlowAdapter, context)
    }

    return this.businessLangGraphService.streamConversation(context)
  }

  private async persistConversationCompletion(options: {
    workspaceId: string
    userId: string
    conversationId: string
    record: ConversationRecord
    graph: CanvasGraph
    decision: string
  }) {
    try {
      await this.memoryStore.updateSessionStatus(options.conversationId, 'completed', {
        latestQuestion: options.record.metadata.latestQuestion ?? null,
        completed: true
      })
      await this.memoryStore.appendMessage({
        conversationId: options.conversationId,
        workspaceId: options.workspaceId,
        userId: options.userId,
        role: 'assistant',
        content: buildAssistantOutcome(options.decision, options.graph),
        metadata: {
          source: 'langgraph',
          nodeCount: options.graph.nodes.length,
          edgeCount: options.graph.edges.length,
          evidenceCount: options.record.knowledgeEvidence.length
        }
      })
      await this.memoryStore.captureConversationOutcome({
        workspaceId: options.workspaceId,
        userId: options.userId,
        conversationId: options.conversationId,
        question: options.record.metadata.latestQuestion ?? null,
        graph: options.graph,
        decision: options.decision,
        evidenceCount: options.record.knowledgeEvidence.length
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error('[conversation-store] failed to persist conversation completion memory', error)
      // P12 · Surface to user. The conversation itself is already
      // marked completed in-memory; only the durable summary write
      // failed (memory_items / session status / outcome). User can
      // continue but cross-session memory is missing this round.
      try {
        await this.publishEvent(options.workspaceId, {
          type: 'persistence/warning',
          conversationId: options.conversationId,
          payload: {
            severity: 'warning',
            source: 'conversation-completion',
            message: `本次会话总结持久化失败：${message}（不影响当前画布；下次跨会话记忆可能缺这一轮）`
          }
        })
      } catch (publishErr) {
        console.error('[conversation-store] failed to publish completion warning', publishErr)
      }
    }
  }

  private async persistConversationFailure(options: {
    workspaceId: string
    userId: string
    conversationId: string
    message: string
  }) {
    try {
      await this.memoryStore.updateSessionStatus(options.conversationId, 'failed')
      await this.memoryStore.appendMessage({
        conversationId: options.conversationId,
        workspaceId: options.workspaceId,
        userId: options.userId,
        role: 'system',
        content: options.message,
        metadata: {
          source: 'langgraph',
          status: 'failed'
        }
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error('[conversation-store] failed to persist conversation failure memory', error)
      try {
        await this.publishEvent(options.workspaceId, {
          type: 'persistence/warning',
          conversationId: options.conversationId,
          payload: {
            severity: 'warning',
            source: 'conversation-completion',
            message: `失败状态持久化失败：${message}（重启后恢复机制可能识别为 stale）`
          }
        })
      } catch (publishErr) {
        console.error('[conversation-store] failed to publish failure warning', publishErr)
      }
    }
  }

  /**
   * P12 · Persist canvas graph + surface failures as 'persistence/warning'
   * events. Replaces the old silent `try { persistCanvasGraph } catch
   * console.error` swallow in WorkspaceGraphStore. Caller no longer has
   * to choose between "keep going on error" (data loss invisible to UI)
   * vs "throw and abort the whole stream" — the stream continues with a
   * yellow ⚠ bubble in the chat dock telling the user the canvas may
   * not have been saved this round.
   *
   * Uses 'warning' severity by default: in-memory graph state is still
   * coherent, only the canvas_graphs UPSERT failed. User can reload
   * later to verify; for the active session, the in-memory graph is
   * authoritative.
   */
  private async persistGraphWithWarning(
    workspaceId: string,
    conversationId: string | null,
    graph: CanvasGraph
  ): Promise<void> {
    try {
      await this.graphStore.persistGraph(graph)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error('[conversation-store] canvas_graphs persist failed', error)
      if (conversationId) {
        const event: ConversationEvent = {
          type: 'persistence/warning',
          conversationId,
          payload: {
            severity: 'warning',
            source: 'canvas-graph',
            message: `画布快照保存失败：${message}（会话可继续，状态以本次内存为准）`
          }
        }
        try {
          await this.publishEvent(workspaceId, event)
        } catch (publishErr) {
          console.error('[conversation-store] failed to publish persistence warning', publishErr)
        }
      }
    }
  }

  private async publishEvent(workspaceId: string, event: ConversationEvent) {
    if (shouldPersistRuntimeEvent(event)) {
      await this.eventStore.appendConversationEvent(workspaceId, event)
    }
    await this.eventStore.publish(workspaceId, event)
  }

  private async waitForDecisionApproval(options: {
    conversationId: string
    workspaceId: string
    decision: string
    record: ConversationRecord
  }) {
    const { conversationId, workspaceId, decision, record } = options
    await this.publishEvent(workspaceId, {
      type: 'seminar.decision.requested',
      conversationId,
      payload: {
        workspaceId,
        phase: 'decision',
        decision,
        occurredAt: new Date().toISOString()
      }
    })

    record.metadata = {
      ...record.metadata,
      status: 'paused',
      updatedAt: new Date()
    }
    await this.sessionStore.updateConversation(conversationId, record)

    const approvalData: PendingApprovalData = {
      conversationId,
      workspaceId,
      decision,
      createdAt: new Date().toISOString(),
      timeoutMs: this.hitlApprovalTimeoutMs
    }
    await this.sessionStore.setPendingApproval(conversationId, approvalData)
    // Mirror to PG store so HITL state survives restart / is visible across
    // gateway instances. The in-memory resolver below remains the same-process
    // fast-path; PG is the durable backstop.
    if (this.hitlApprovalStore) {
      // Wave 3 A: the Map serves same-instance fast-path; LISTEN/NOTIFY serves
      // cross-instance. Subscribe lazily once per process — every decision
      // notification dispatches to the local resolver Map, so a `decide()`
      // call on Instance-B wakes the awaiter parked on Instance-A in roughly
      // one PG round-trip. If a same-instance resolver already ran (the Map
      // entry was deleted inside `finalize()`), the LISTEN-driven wakeup is
      // a no-op — the lookup just returns undefined.
      this.ensureHitlDecisionSubscription()
      try {
        const ttlSec = Math.max(1, Math.ceil(this.hitlApprovalTimeoutMs / 1000))
        await this.hitlApprovalStore.enqueue(
          conversationId,
          { workspaceId, decision, createdAt: approvalData.createdAt },
          ttlSec
        )
      } catch (error) {
        console.error('[conversation-store] hitl PG enqueue failed, falling back to in-memory only', error)
      }
    }

    return await new Promise<string>((resolve) => {
      const finalize = (nextDecision: string) => {
        const existingTimeout = this.pendingDecisionTimeouts.get(conversationId)
        if (existingTimeout) {
          clearTimeout(existingTimeout)
        }
        this.pendingDecisionTimeouts.delete(conversationId)
        this.pendingDecisionResolvers.delete(conversationId)
        void this.sessionStore.deletePendingApproval(conversationId)
        resolve(nextDecision)
      }

      const timeout = setTimeout(() => {
        finalize(decision)
      }, this.hitlApprovalTimeoutMs)

      this.pendingDecisionTimeouts.set(conversationId, timeout)
      this.pendingDecisionResolvers.set(conversationId, finalize)
    })
  }

  /**
   * Wave 3 A: lazily attach a single LISTEN subscriber for the lifetime of
   * this ConversationStore. The callback looks the conversationId up in the
   * local resolver Map; if no resolver is registered (e.g. the awaiter lives
   * on a different instance, or this instance already woke via the local
   * `approveDecision` fast-path) the callback is a harmless no-op.
   */
  private ensureHitlDecisionSubscription() {
    if (this.hitlDecisionUnsubscribe || !this.hitlApprovalStore) return
    this.hitlDecisionUnsubscribe = this.hitlApprovalStore.subscribeToDecisions(
      (conversationId, decision) => {
        const resolver = this.pendingDecisionResolvers.get(conversationId)
        if (resolver) {
          resolver(decision)
        }
      }
    )
  }

  private assertPermissionFromMetadata(
    metadata: WorkspaceMetadataRecord,
    userId: string,
    requiredPermission: 'workspace.read' | 'workspace.write' | 'workspace.publish' | 'workspace.manage'
  ) {
    return requireWorkspacePermission(userId, metadata, requiredPermission)
  }

  /**
   * Public wrapper for the workspace.write permission check. Used by
   * clearWorkspaceCanvas mutation (resolvers.ts) so a non-owner can't
   * wipe someone else's canvas. Same path the private helper uses.
   */
  async assertWorkspaceWritePermission(workspaceId: string, userId: string): Promise<void> {
    await this.assertWorkspacePermission(workspaceId, userId, 'workspace.write')
  }

  private async assertWorkspacePermission(
    workspaceId: string,
    userId: string,
    requiredPermission: 'workspace.read' | 'workspace.write' | 'workspace.publish' | 'workspace.manage'
  ) {
    // Pass userId as seedOwner so that auto-created workspaces (URL
    // navigation to an unknown id) immediately give the requesting user
    // full ownership instead of leaving them locked out.
    //
    // P12 fix N2 · short-lived metadata cache. A single GraphQL
    // request typically calls 6+ resolvers, each independently asking
    // for the same (workspaceId, userId) metadata row. Without a
    // cache that's 6 PG round-trips per request — measured in audit
    // logs as 6× workspace-access.granted within 30ms.
    //
    // 1-second TTL keyed by workspaceId is short enough that revoked
    // permissions take effect within ~1s (acceptable: GraphQL
    // requests typically complete in <100ms so they all see the
    // same snapshot anyway), and long enough that a single multi-
    // resolver request hits cache after the first call. We pass
    // seedOwner only on cache miss so the auto-create semantics
    // still apply for the first caller.
    const metadata = await getWorkspaceMetadataCached(workspaceId, userId)
    return this.assertPermissionFromMetadata(metadata, userId, requiredPermission)
  }

  private async assertConversationBelongsToWorkspace(workspaceId: string, conversationId: string) {
    const record = await this.sessionStore.getConversation(conversationId)
    if (!record) return
    if (record.graph.workspaceId !== workspaceId) {
      throw new Error('INVALID_CONVERSATION_SCOPE')
    }
  }

  private async assertConversationBelongsToWorkspaceOrSession(workspaceId: string, conversationId: string) {
    const record = await this.sessionStore.getConversation(conversationId)
    if (record) {
      if (record.graph.workspaceId !== workspaceId) {
        throw new Error('INVALID_CONVERSATION_SCOPE')
      }
      return
    }

    const session = await this.memoryStore.getSession(conversationId)
    if (!session) return
    if (session.workspaceId !== workspaceId) {
      throw new Error('INVALID_CONVERSATION_SCOPE')
    }
  }
}

function shouldPersistRuntimeEvent(event: ConversationEvent) {
  return event.type === 'status'
    || event.type === 'phase.changed'
    || event.type === 'seminar.turn.completed'
    || event.type === 'seminar.decision.made'
    || event.type === 'seminar.decision.requested'
    // P12 · Persist persistence-warning events to the ring buffer so a
    // client reconnecting after a transient drop replays the warning
    // and learns about silent persistence failures it missed.
    || event.type === 'persistence/warning'
}

function buildConversationTitle(question: string) {
  const compact = question.replace(/\s+/g, ' ').trim()
  return compact ? truncate(compact, 48) : '未命名会话'
}

function buildAssistantOutcome(decision: string, graph: CanvasGraph) {
  if (decision.trim()) {
    return `最终决策：\n${decision.trim()}`
  }

  const highlights = graph.nodes
    .map((node) => {
      const data = node.data as { title?: string; content?: string } | undefined
      if (!data?.title || !data.content) return null
      return `- ${data.title}: ${truncate(data.content.replace(/\s+/g, ' '), 120)}`
    })
    .filter((item): item is string => item !== null)
    .slice(0, 8)

  if (highlights.length === 0) {
    return `本轮已更新画布：${graph.nodes.length} 个节点，${graph.edges.length} 条连线。`
  }

  return [
    `本轮已更新画布：${graph.nodes.length} 个节点，${graph.edges.length} 条连线。`,
    ...highlights
  ].join('\n')
}

function parseMessageRole(role: string): ConversationMessage['role'] {
  if (role === 'user' || role === 'assistant' || role === 'system' || role === 'tool') {
    return role
  }
  throw new Error(`INVALID_MESSAGE_ROLE:${role}`)
}

function parseMemoryScope(scope?: string | null): MemoryScope | undefined {
  if (!scope) return undefined
  if (scope === 'workspace' || scope === 'user') return scope
  // P14 P2 · `agent` was a dead enum value (0 production writes audited
  // 2026-05-09). Coerce to 'workspace' instead of erroring so any legacy
  // GraphQL input that still sends 'agent' degrades gracefully.
  if (scope === 'agent') return 'workspace'
  throw new Error(`INVALID_MEMORY_SCOPE:${scope}`)
}

function parseMemoryKind(kind?: string | null): MemoryKind | undefined {
  if (!kind) return undefined
  if (kind === 'decision' || kind === 'summary' || kind === 'canvas' || kind === 'user-skill') {
    return kind
  }
  // P14 P2 · `preference` / `insight` / `constraint` dropped from live
  // enum (0 production writes audited 2026-05-09). Coerce to the closest
  // semantic equivalent so any legacy input degrades gracefully — new
  // code should pass facet/category via the canonical upsertMemory path.
  if (kind === 'preference' || kind === 'constraint') return 'user-skill'
  if (kind === 'insight') return 'summary'
  throw new Error(`INVALID_MEMORY_KIND:${kind}`)
}

function truncate(text: string, max: number) {
  const value = text.trim()
  if (value.length <= max) return value
  return `${value.slice(0, Math.max(0, max - 1))}…`
}

type ExtractRuntimeInfo = {
  stage: SeminarPhase
  agentId: string
  agentName: string
  nodeId: string
  title: string
  summary: string
}

const AGENT_NAME_MAP: Record<string, string> = {
  Market_Agent: 'Market Agent',
  Product_Agent: 'Product Agent',
  Finance_Agent: 'Finance Agent',
  Adversarial_Critic: 'Critic Agent',
  Orchestrator: 'Orchestrator'
}

function extractRuntimeInfo(node: CanvasNode): ExtractRuntimeInfo | null {
  const data = (node.data ?? {}) as {
    title?: string
    content?: string
    meta?: {
      macraType?: string
      agentType?: string
      metadata?: {
        agent_signature?: string
        stage?: SeminarPhase
      }
    }
  }
  const meta = data.meta
  const agentId = meta?.metadata?.agent_signature ?? meta?.agentType
  if (!agentId) return null

  const title = (typeof data.title === 'string' && data.title.trim()) || node.id
  const summary = typeof data.content === 'string' ? data.content : ''
  const stage = meta?.metadata?.stage ?? inferPhase(agentId, meta?.macraType, title, summary)

  return {
    stage,
    agentId,
    agentName: AGENT_NAME_MAP[agentId] ?? agentId,
    nodeId: node.id,
    title,
    summary
  }
}

function inferPhase(agentId: string, macraType?: string, title = '', content = ''): SeminarPhase {
  const corpus = `${title}\n${content}`
  if (agentId === 'Adversarial_Critic' || macraType === 'conflict-alert') {
    return 'review'
  }
  if (agentId === 'Orchestrator') {
    if (/规划|计划|路线|拆解|阶段|里程碑/.test(corpus)) {
      return 'planning'
    }
    return 'decision'
  }
  return 'execution'
}

function findLatestDecision(graph: CanvasGraph): string {
  const decisionNodes = graph.nodes
    .map((node) => extractRuntimeInfo(node))
    .filter((item): item is ExtractRuntimeInfo => item !== null)
    .filter((item) => item.stage === 'decision')
  return decisionNodes[decisionNodes.length - 1]?.summary ?? ''
}

/**
 * Pull `citations` (CitationSpan[]) from a node's metadata and wrap it into
 * a `CardCitation` entry keyed by cardId + fieldName='content'.
 *
 * Returns null if the node has no citation metadata (e.g., non-BMC node,
 * or agent output that didn't contain [[ref:...]] tokens).
 */
export function extractCitationsFromNode(node: CanvasNode): CardCitation | null {
  const data = node.data as { meta?: { citations?: unknown } } | undefined
  const meta = data?.meta
  if (!meta || typeof meta !== 'object') return null
  const rawCitations = (meta as { citations?: unknown }).citations
  if (!Array.isArray(rawCitations) || rawCitations.length === 0) return null

  const spans: CitationSpan[] = []
  for (const entry of rawCitations) {
    if (!entry || typeof entry !== 'object') continue
    const span = entry as Partial<CitationSpan>
    if (
      typeof span.textStart === 'number' &&
      typeof span.textEnd === 'number' &&
      Array.isArray(span.refs)
    ) {
      spans.push({
        textStart: span.textStart,
        textEnd: span.textEnd,
        refs: span.refs.map((r) => ({
          evidenceId: String((r as { evidenceId?: unknown }).evidenceId ?? ''),
          docId: String((r as { docId?: unknown }).docId ?? ''),
          snippetId: String((r as { snippetId?: unknown }).snippetId ?? '')
        }))
      })
    }
  }

  if (spans.length === 0) return null
  return {
    cardId: node.id,
    fieldName: 'content',
    spans
  }
}

/**
 * Insert-or-replace: keep a single CardCitation per (cardId, fieldName) key.
 * A newer emission for the same card replaces the previous one (supports
 * Stage 4 revision rounds, DEC-3 soft-delete handled at Stage 4).
 */
function upsertCardCitation(
  list: CardCitation[],
  next: CardCitation
): CardCitation[] {
  const idx = list.findIndex(
    (c) => c.cardId === next.cardId && c.fieldName === next.fieldName
  )
  if (idx === -1) return [...list, next]
  const copy = [...list]
  copy[idx] = next
  return copy
}

function extractGroundingRate(node: CanvasNode): number {
  const meta = (node.data as { meta?: { groundingRate?: unknown } } | undefined)?.meta
  if (!meta || typeof meta !== 'object') return 0
  const value = (meta as { groundingRate?: unknown }).groundingRate
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}
