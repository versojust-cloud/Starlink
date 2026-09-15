import type { ExpressContextFunctionArgument } from '@apollo/server/express4'
import { GraphQLError } from 'graphql'
import { ConversationStore } from '../application/conversation-store.js'
import { ConversationMemoryStore } from '../application/conversation-memory-store.js'
import { MemoryCaptureService } from '../application/memory-capture.js'
import { MemoryRetrievalService } from '../application/memory-retrieval.js'
import { MemoryConsolidator } from '../application/memory-consolidator.js'
import { MemoryReaper } from '../application/memory-reaper.js'
import { UserSkillConsolidator } from '../services/user-skill-consolidator.js'
import { TaskEventStore } from '../application/task-event-store.js'
import { createConversationEventBus } from '../application/conversation-event-bus.js'
import { createConversationRuntimeRepository } from '../application/conversation-runtime-repository.js'
import { ToolRegistry } from '../tool-registry/registry.js'
import { loadAllTools } from '../tool-registry/loader.js'
import { ensureYamlAgentsLoaded } from '../agents/index.js'
import { setToolRegistryForAgents } from '../agents/shared/register-helpers.js'
import { FlowStore } from '../application/flow-store.js'
import { ExecutionStore } from '../application/execution-store.js'
import { GraphCompiler } from '../engine/graph-compiler.js'
import { GraphExecutor } from '../engine/graph-executor.js'
import { UserSkillExtractor } from '../services/user-skill-extractor.js'
import { WizardPrefillService } from '../services/wizard-prefill-service.js'
import { LLMClient } from '../services/llm-client.js'
import {
  createWorkspaceMemoryStore,
  setWorkspaceMemoryStore
} from '../infrastructure/memory/workspace-memory-store.js'
import {
  AuthError,
  authenticateConnectionParams,
  authenticateExpress
} from '../middleware/auth.js'

export type GraphQLContext = {
  conversationStore: ConversationStore
  taskEventStore: TaskEventStore
  userId: string
  /** From auth middleware: list of workspace IDs the caller may access, or 'all' (admin/dev). */
  allowedWorkspaceIds: string[] | 'all'
  toolRegistry?: ToolRegistry
  flowStore?: FlowStore
  executionStore?: ExecutionStore
  graphCompiler?: GraphCompiler
  graphExecutor?: GraphExecutor
  /** P3 · UserSkillExtractor exposed for demand-mode mutation (refreshUserSkills). */
  userSkillExtractor?: UserSkillExtractor
  /** Sprint 1.1 · KB-aware wizard prefill service (prefillWizardFromKb). */
  wizardPrefillService?: WizardPrefillService
}

const conversationEventBus = createConversationEventBus()
const conversationRuntimeRepository = createConversationRuntimeRepository()
const toolRegistry = new ToolRegistry()
const conversationStore = new ConversationStore({
  eventBus: conversationEventBus,
  runtimeRepository: conversationRuntimeRepository,
  toolRegistry
})
const taskEventStore = new TaskEventStore()

// Audit C1/C2: bridge the BusinessLangGraph workspace-memory-store to the
// PG-backed ConversationMemoryStore so cross-conversation BMC summaries
// survive restart and are searchable via pgvector. Both stores share the
// same `pool` (infrastructure/db/pool.ts), so constructing a second
// ConversationMemoryStore here is just a thin wrapper — no extra
// connections, no duplicated DDL.
const sharedConversationMemoryStore = new ConversationMemoryStore()
setWorkspaceMemoryStore(
  createWorkspaceMemoryStore({ conversationMemoryStore: sharedConversationMemoryStore })
)

// P14 P4 · MemoryCaptureService — singleton facade for the unified write API.
// Currently a thin wrapper around ConversationMemoryStore + the legacy
// captureConversationOutcome path; new code (mention router, business-langgraph,
// etc.) should call this instead of upsertMemory / appendMessage / record
// directly. Old call sites continue to work during the deprecation window.
export const sharedMemoryCaptureService = new MemoryCaptureService(sharedConversationMemoryStore)

// P14 P5 · MemoryRetrievalService — singleton for the unified read API.
// Implements the canonical salience formula (cosine × recency × importance
// × confidence) over the new layer/facet/category axes. Old legacy methods
// (searchMemories / searchUserSkills / listUserSummaries / etc.) keep
// working for back-compat; new code calls retrieve() directly.
export const sharedMemoryRetrievalService = new MemoryRetrievalService(sharedConversationMemoryStore)

// P3 · Single shared UserSkillExtractor instance (per process). The
// extractor's call counter (Map<userId, count>) is in-memory; a single
// instance keeps cold-start eager mode + throttled mode counters
// consistent across both GraphQL resolvers and the BusinessLangGraph
// fire-and-forget call site.
const sharedUserSkillExtractor = new UserSkillExtractor({
  memoryStore: sharedConversationMemoryStore
})

// P14 P6 · MemoryConsolidator — facade over UserSkillExtractor +
// UserSkillConsolidator + decay cron. Provides 4 trigger entry points
// (run-end / user-patterns / cross-workspace / decay) so callers don't
// need to know which underlying service handles which promotion.
export const sharedUserSkillConsolidator = new UserSkillConsolidator({
  memoryStore: sharedConversationMemoryStore
})
export const sharedMemoryConsolidator = new MemoryConsolidator(
  sharedConversationMemoryStore,
  sharedUserSkillExtractor,
  sharedUserSkillConsolidator,
  // P14 Item 2 · pass capture service so consolidateRunEnd can persist
  // the LLM-distilled chat-history summary as an L2 bmc-summary row.
  sharedMemoryCaptureService
)

// P14 P7 · MemoryReaper — TTL maintenance. Layer-specific archival rules:
// session=30d, workspace=90d, user=∞. Invoked from cron via the
// `memory:reap` npm script.
export const sharedMemoryReaper = new MemoryReaper()

// P15-fix #3 · Auto-schedule the reaper so production deployments don't
// silently grow memory_items forever just because nobody wired the cron.
// Disabled by default in NODE_ENV=test to avoid hitting the DB during
// unit tests. Set MEMORY_REAPER_INTERVAL_HOURS=0 to opt out.
const reaperIntervalHours = Number(process.env.MEMORY_REAPER_INTERVAL_HOURS ?? 24)
if (process.env.NODE_ENV !== 'test' && reaperIntervalHours > 0) {
  const ms = reaperIntervalHours * 60 * 60 * 1000
  // First tick after a delay so server boot stays fast; subsequent
  // ticks fire every `ms`.
  const firstDelay = Math.min(60_000, ms) // 1min or interval, whichever smaller
  setTimeout(() => {
    const tick = async (): Promise<void> => {
      try {
        const result = await sharedMemoryReaper.reap()
        console.info('[memory-reaper] auto-tick', {
          archived: result.archived,
          total: result.total
        })
      } catch (err) {
        console.warn('[memory-reaper] auto-tick failed', err instanceof Error ? err.message : err)
      }
    }
    void tick()
    setInterval(() => void tick(), ms).unref()
  }, firstDelay).unref()
}

// Sprint 1.1 · single shared WizardPrefillService. The LLM client picks
// up the same env config used by the Socratic coach (DEEPSEEK_API_KEY /
// LLM_API_KEY etc.); no new env knobs.
const sharedWizardPrefillService = new WizardPrefillService({
  llm: new LLMClient()
})

// Flow infrastructure (initialized lazily)
const flowStore = new FlowStore()
const executionStore = new ExecutionStore()
const graphCompiler = new GraphCompiler()
const graphExecutor = new GraphExecutor(toolRegistry)

// P11.18 fix · race-condition guard. Previously a boolean flag let
// concurrent first-callers (multiple GraphQL requests on cold start)
// each see `toolsLoaded === false` and trigger parallel loadAllTools
// calls, causing 38 duplicate-registration warnings per extra caller.
// Cache the in-flight promise so concurrent callers await the SAME
// load and only execute it once.
let toolsLoadPromise: Promise<void> | null = null

async function ensureToolsLoaded(): Promise<void> {
  if (!toolsLoadPromise) {
    toolsLoadPromise = (async () => {
      try {
        await loadAllTools(toolRegistry)
        setToolRegistryForAgents(toolRegistry)
      } catch (err) {
        console.warn('[context] Failed to load tools:', err)
      }
    })()
  }
  await toolsLoadPromise
}

let yamlAgentsLoadPromise: Promise<void> | null = null
async function ensureAgentsLoaded(): Promise<void> {
  if (!yamlAgentsLoadPromise) {
    yamlAgentsLoadPromise = (async () => {
      try {
        await ensureYamlAgentsLoaded()
      } catch (err) {
        console.warn('[context] Failed to load YAML agents:', err)
      }
    })()
  }
  await yamlAgentsLoadPromise
}

export async function createContext(
  { req }: ExpressContextFunctionArgument
): Promise<GraphQLContext> {
  await ensureToolsLoaded()
  await ensureAgentsLoaded()
  let identity
  try {
    identity = authenticateExpress(req)
  } catch (err) {
    if (err instanceof AuthError) {
      throw new GraphQLError(err.message, {
        extensions: { code: 'UNAUTHENTICATED', http: { status: err.statusCode } }
      })
    }
    throw err
  }
  return {
    conversationStore,
    taskEventStore,
    userId: identity.userId,
    allowedWorkspaceIds: identity.allowedWorkspaceIds,
    toolRegistry,
    flowStore,
    executionStore,
    graphCompiler,
    graphExecutor,
    userSkillExtractor: sharedUserSkillExtractor,
    wizardPrefillService: sharedWizardPrefillService
  }
}

export async function createWsContext(connectionParams?: Record<string, unknown>): Promise<GraphQLContext> {
  await ensureToolsLoaded()
  await ensureAgentsLoaded()
  let identity
  try {
    identity = authenticateConnectionParams(connectionParams)
  } catch (err) {
    if (err instanceof AuthError) {
      throw new GraphQLError(err.message, {
        extensions: { code: 'UNAUTHENTICATED' }
      })
    }
    throw err
  }
  return {
    conversationStore,
    taskEventStore,
    userId: identity.userId,
    allowedWorkspaceIds: identity.allowedWorkspaceIds,
    toolRegistry,
    flowStore,
    executionStore,
    graphCompiler,
    graphExecutor,
    userSkillExtractor: sharedUserSkillExtractor,
    wizardPrefillService: sharedWizardPrefillService
  }
}

export function getTaskEventStore() {
  return taskEventStore
}

export function getToolRegistry() {
  return toolRegistry
}

export async function shutdownContextServices() {
  await taskEventStore.close()
  await conversationStore.close()
}
