import { BookOpenCheck, BrainCircuit, Languages, Microscope, UsersRound } from 'lucide-react'
import {
  ExpertsToolDrawer,
  KnowledgeToolDrawer,
  ResearchToolDrawer,
  TranslateToolDrawer
} from '../components/tools/default-tool-drawers'
import { registerTool } from './tool-registry'
import { getGraphQLClient } from '@/shared/lib/graphql-client'

const KNOWLEDGE_BASES_QUERY = /* GraphQL */ `
  query ToolKnowledgeBases($workspaceId: ID!) {
    knowledgeBases(workspaceId: $workspaceId) {
      id
      name
      status
    }
  }
`

const KNOWLEDGE_BASE_SEARCH_QUERY = /* GraphQL */ `
  query ToolKnowledgeBaseSearch($workspaceId: ID!, $kbId: ID!, $query: String!, $topK: Int) {
    knowledgeBaseSearch(workspaceId: $workspaceId, kbId: $kbId, query: $query, topK: $topK) {
      docId
      snippet
      score
      metadata
    }
  }
`

const WORKSPACE_CONTEXT_SNAPSHOT_QUERY = /* GraphQL */ `
  query ToolWorkspaceContextSnapshot($workspaceId: ID!, $conversationId: ID, $query: String!) {
    workspaceContextSnapshot(workspaceId: $workspaceId, conversationId: $conversationId, query: $query) {
      workspaceId
      conversationId
      query
      builtAt
      promptBlock
      canvasSummary {
        nodeCount
        edgeCount
        highlights
      }
      recentMessages {
        id
        role
        content
        createdAt
      }
      memories {
        id
        kind
        scope
        title
        content
        importance
        confidence
        tags
      }
      knowledgeEvidence {
        docId
        snippet
        score
        metadata
      }
    }
  }
`

const WORKSPACE_MEMORIES_QUERY = /* GraphQL */ `
  query ToolWorkspaceMemories($workspaceId: ID!, $query: String, $limit: Int) {
    workspaceMemories(workspaceId: $workspaceId, query: $query, limit: $limit) {
      id
      kind
      scope
      title
      content
      importance
      confidence
      tags
      updatedAt
    }
  }
`

const CREATE_MEMORY_ITEM_MUTATION = /* GraphQL */ `
  mutation ToolCreateMemoryItem($input: CreateMemoryItemInput!) {
    createMemoryItem(input: $input) {
      id
      kind
      scope
      title
      content
      importance
      confidence
      tags
    }
  }
`

type ResearchInput = {
  query: string
  researchType?: string
  depth?: string
  sources?: string[]
  language?: string
}

type ResearchResult = {
  summary: string
  keyPoints: string[]
  sources: string[]
  detailedAnalysis: string
  recommendations?: string[]
}

type TranslateInput = {
  text: string
  sourceLanguage?: string
  targetLanguage: string
  mode?: string
}

type TranslateResult = {
  translation: string
  detectedSourceLanguage?: string
  model?: string
}

type KnowledgeInput = {
  query?: string
  kbId?: string
  topK?: number
}

type KnowledgeBaseSummary = {
  id: string
  name: string
  status: string
}

type KnowledgeEvidence = {
  docId: string
  snippet: string
  score: number
  metadata?: Record<string, unknown>
}

type KnowledgeResult = {
  kbId: string
  kbName: string
  query: string
  results: KnowledgeEvidence[]
  evidenceCount: number
  selectedNodeCount: number
  summary: string
}

type MemoryInput = {
  query?: string
  title?: string
  content?: string
  kind?: string
  mode?: 'list' | 'context' | 'create'
}

type MemoryItem = {
  id: string
  kind: string
  scope: string
  title: string
  content: string
  importance: number
  confidence: number
  tags: string[]
  updatedAt?: string
}

type MemoryResult = {
  mode: 'list' | 'context' | 'create'
  query: string
  summary: string
  promptBlock?: string
  canvasSummary?: {
    nodeCount: number
    edgeCount: number
    highlights: string[]
  }
  recentMessages?: Array<{
    id: string
    role: string
    content: string
    createdAt: string
  }>
  memories: MemoryItem[]
}

type ExpertsResult = {
  selectedNodeCount: number
  summary: string
}

async function postJson<TResponse>(url: string, body: unknown): Promise<TResponse> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })

  if (!response.ok) {
    let message = response.statusText
    try {
      const error = await response.json()
      message = error?.message ?? error?.error ?? message
    } catch {
      // keep statusText fallback
    }
    throw new Error(message)
  }

  return response.json() as Promise<TResponse>
}

function trimText(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function buildNodeContentFromResearch(result: ResearchResult) {
  return [
    result.summary,
    '',
    '## 关键发现',
    ...(result.keyPoints ?? []).map((point) => `- ${point}`),
    '',
    result.recommendations?.length ? '## 建议' : '',
    ...(result.recommendations ?? []).map((item) => `- ${item}`)
  ].filter(Boolean).join('\n')
}

registerTool<KnowledgeInput, KnowledgeResult>({
  id: 'knowledge',
  command: '@knowledge',
  name: 'Knowledge',
  description: '从知识库召回证据，并把 citation 注入画布节点。',
  category: 'knowledge',
  icon: BookOpenCheck,
  accentClassName: 'from-cyan-300 to-blue-500',
  modes: ['inline-drawer', 'slash-command', 'agent-auto'],
  DrawerComponent: KnowledgeToolDrawer,
  invoke: async (input, context) => {
    const query = trimText(input.query)
    if (!query) throw new Error('请输入知识库检索问题。')

    const client = getGraphQLClient()
    const baseResponse = await client.request<{ knowledgeBases: KnowledgeBaseSummary[] }>(
      KNOWLEDGE_BASES_QUERY,
      { workspaceId: context.workspaceId }
    )
    const knowledgeBases = baseResponse.knowledgeBases ?? []
    const selectedKb = input.kbId
      ? knowledgeBases.find((kb) => kb.id === input.kbId)
      : knowledgeBases.find((kb) => kb.status === 'ready') ?? knowledgeBases[0]

    if (!selectedKb) {
      throw new Error('当前 workspace 还没有知识库。请先创建知识库并导入资料。')
    }

    const searchResponse = await client.request<{ knowledgeBaseSearch: KnowledgeEvidence[] }>(
      KNOWLEDGE_BASE_SEARCH_QUERY,
      {
        workspaceId: context.workspaceId,
        kbId: selectedKb.id,
        query,
        topK: input.topK ?? 5
      }
    )
    const results = searchResponse.knowledgeBaseSearch ?? []
    const summary = results.length > 0
      ? `从「${selectedKb.name}」召回 ${results.length} 条证据。`
      : `「${selectedKb.name}」没有检索到相关证据。`

    return {
      kbId: selectedKb.id,
      kbName: selectedKb.name,
      query,
      results,
      evidenceCount: results.length,
      selectedNodeCount: context.selectedNodeIds.length,
      summary
    }
  },
  onResult: (result, context) => {
    context.store.setKnowledgeEvidence(result.results)
    context.addNode({
      type: 'data-source',
      data: {
        label: `Knowledge: ${result.kbName}`,
        content: buildKnowledgeNodeContent(result),
        metadata: {
          agent_signature: '@knowledge',
          confidence: result.evidenceCount > 0 ? 'medium' : 'low'
        }
      }
    })
    context.appendChatMessage({
      role: 'assistant',
      content: result.summary
    })
  }
})

registerTool<MemoryInput, MemoryResult>({
  id: 'memory',
  command: '@memory',
  name: 'Memory',
  description: '查看本轮上下文快照，或把关键偏好/决策写入长期记忆。',
  category: 'utility',
  icon: BrainCircuit,
  accentClassName: 'from-fuchsia-300 to-rose-500',
  modes: ['slash-command', 'agent-auto'],
  invoke: async (input, context) => {
    const client = getGraphQLClient()

    if (input.mode === 'list') {
      const query = trimText(input.query)
      const response = await client.request<{ workspaceMemories: MemoryItem[] }>(
        WORKSPACE_MEMORIES_QUERY,
        {
          workspaceId: context.workspaceId,
          query: query || null,
          limit: 30
        }
      )
      const memories = response.workspaceMemories ?? []
      return {
        mode: 'list',
        query,
        summary: query
          ? `找到 ${memories.length} 条与「${query}」相关的长期记忆。`
          : `当前 workspace 有 ${memories.length} 条长期记忆。`,
        memories
      }
    }

    if (input.mode === 'create') {
      const title = trimText(input.title)
      const content = trimText(input.content)
      if (!title || !content) throw new Error('写入长期记忆需要 title 和 content。')

      const response = await client.request<{ createMemoryItem: MemoryItem }>(
        CREATE_MEMORY_ITEM_MUTATION,
        {
          input: {
            workspaceId: context.workspaceId,
            scope: 'workspace',
            kind: input.kind ?? 'insight',
            title,
            content,
            sourceType: 'manual',
            // User-authored memory: importance + confidence default to
            // 1.0 because the user explicitly wrote it (not LLM-derived).
            // The user can lower these via the memory drawer if they
            // later realize the entry was speculative.
            importance: 1.0,
            confidence: 1.0,
            tags: ['manual', '@memory']
          }
        }
      )
      const memory = response.createMemoryItem
      return {
        mode: 'create',
        query: title,
        summary: `已写入长期记忆：${memory.title}`,
        memories: [memory]
      }
    }

    const query = trimText(input.query, '当前工作区上下文')
    const response = await client.request<{
      workspaceContextSnapshot: Omit<MemoryResult, 'mode' | 'summary' | 'memories'> & { memories: MemoryItem[] }
    }>(
      WORKSPACE_CONTEXT_SNAPSHOT_QUERY,
      {
        workspaceId: context.workspaceId,
        conversationId: context.conversationId,
        query
      }
    )
    const snapshot = response.workspaceContextSnapshot
    return {
      mode: 'context',
      query,
      summary: `上下文快照：${snapshot.memories.length} 条长期记忆，${snapshot.recentMessages?.length ?? 0} 条近期消息，${snapshot.canvasSummary?.nodeCount ?? 0} 个画布节点。`,
      promptBlock: snapshot.promptBlock,
      canvasSummary: snapshot.canvasSummary,
      recentMessages: snapshot.recentMessages,
      memories: snapshot.memories
    }
  },
  onResult: (result, context) => {
    context.addNode({
      type: 'insight-note',
      data: {
        label: result.mode === 'create' ? 'Memory Saved' : 'Context Snapshot',
        content: buildMemoryNodeContent(result),
        metadata: {
          agent_signature: '@memory',
          confidence: 'medium'
        }
      }
    })
    context.appendChatMessage({
      role: 'assistant',
      content: result.summary
    })
  }
})

function buildMemoryNodeContent(result: MemoryResult) {
  if (result.mode === 'list') {
    return [
      result.summary,
      '',
      ...result.memories.map((memory) => (
        `## ${memory.title}\n[${memory.kind}/${memory.scope}] ${memory.content}`
      ))
    ].join('\n')
  }

  if (result.mode === 'create') {
    return result.memories.map((memory) => `## ${memory.title}\n${memory.content}`).join('\n\n')
  }

  return [
    `查询：${result.query}`,
    '',
    result.summary,
    '',
    '## 长期记忆',
    ...(result.memories.length > 0
      ? result.memories.slice(0, 6).map((memory) => `- [${memory.kind}] ${memory.title}: ${memory.content}`)
      : ['- 暂无相关长期记忆']),
    '',
    '## Canvas 摘要',
    ...(result.canvasSummary?.highlights?.slice(0, 6).map((item) => `- ${item}`) ?? ['- 暂无画布摘要'])
  ].join('\n')
}

function buildKnowledgeNodeContent(result: KnowledgeResult) {
  return [
    `检索问题：${result.query}`,
    '',
    result.summary,
    '',
    ...result.results.map((item, index) => (
      `## Evidence ${index + 1}\n${item.snippet}\n\nscore: ${item.score.toFixed(3)}`
    ))
  ].join('\n')
}

registerTool<ResearchInput, ResearchResult>({
  id: 'research',
  command: '@research',
  name: 'Deep Research',
  description: '把研究问题整理成可执行 brief，生成报告和引用。',
  category: 'research',
  icon: Microscope,
  accentClassName: 'from-sky-300 to-indigo-500',
  modes: ['inline-drawer', 'slash-command', 'agent-auto'],
  DrawerComponent: ResearchToolDrawer,
  invoke: async (input) => {
    const query = trimText(input.query)
    if (!query) throw new Error('请输入研究问题。')

    const data = await postJson<{ result: ResearchResult }>('/api/deep-research', {
      query,
      researchType: input.researchType ?? 'comprehensive',
      depth: input.depth ?? 'medium',
      sources: input.sources ?? ['academic', 'news'],
      language: input.language ?? 'zh'
    })

    return data.result
  },
  onResult: (result, context) => {
    context.addNode({
      type: 'insight-note',
      data: {
        label: 'Deep Research',
        content: buildNodeContentFromResearch(result),
        metadata: {
          agent_signature: '@research',
          confidence: 'medium',
          sources: result.sources
        }
      }
    })
    context.appendChatMessage({
      role: 'assistant',
      content: `@research 完成：${result.summary}`
    })
  }
})

registerTool<TranslateInput, TranslateResult>({
  id: 'translate',
  command: '@translate',
  name: 'Translate',
  description: '翻译卡片、报告片段和跨文化表达。',
  category: 'translation',
  icon: Languages,
  accentClassName: 'from-amber-300 to-orange-500',
  modes: ['inline-drawer', 'slash-command'],
  DrawerComponent: TranslateToolDrawer,
  invoke: async (input) => {
    const text = trimText(input.text)
    if (!text) throw new Error('请输入要翻译的文本。')

    return postJson<TranslateResult>('/api/translate', {
      text,
      sourceLanguage: input.sourceLanguage === 'auto' ? undefined : input.sourceLanguage,
      targetLanguage: input.targetLanguage,
      mode: input.mode ?? 'professional'
    })
  },
  onResult: (result, context) => {
    context.addNode({
      type: 'insight-note',
      data: {
        label: 'Translation',
        content: result.translation,
        metadata: {
          agent_signature: '@translate',
          confidence: 'medium'
        }
      }
    })
    context.appendChatMessage({
      role: 'assistant',
      content: `@translate 完成：${result.translation.slice(0, 120)}`
    })
  }
})

registerTool<unknown, ExpertsResult>({
  id: 'experts',
  command: '@experts',
  name: 'Experts',
  description: '召集专家 Agent 对当前节点或画布进行审阅。',
  category: 'expert',
  icon: UsersRound,
  accentClassName: 'from-emerald-300 to-teal-500',
  modes: ['inline-drawer', 'slash-command', 'agent-auto'],
  DrawerComponent: ExpertsToolDrawer,
  invoke: async (_input, context) => {
    const selectedNodes = context.store.nodes.filter((node) => context.selectedNodeIds.includes(node.id))
    const summary = selectedNodes.length > 0
      ? `已召集专家审阅 ${selectedNodes.length} 个选中节点，建议从市场、文化语境、证据质量三个方向继续追问。`
      : '已召集专家审阅当前画布。建议先选择一个关键节点，再运行专家审阅以获得更聚焦的反馈。'

    return {
      selectedNodeCount: selectedNodes.length,
      summary
    }
  },
  onResult: (result, context) => {
    context.addNode({
      type: 'insight-note',
      data: {
        label: 'Expert Review',
        content: result.summary,
        metadata: {
          agent_signature: '@experts',
          confidence: result.selectedNodeCount > 0 ? 'medium' : 'low'
        }
      }
    })
    context.appendChatMessage({
      role: 'assistant',
      content: result.summary
    })
  }
})
