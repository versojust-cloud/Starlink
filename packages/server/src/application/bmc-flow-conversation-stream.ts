import type { CanvasGraph, KnowledgeEvidence } from '@starlink/shared'
import type { BmcFlowAdapter } from '../engine/bmc-flow-adapter.js'
import type { BusinessStreamUpdate } from '../services/business-langgraph.js'

export type BmcFlowConversationContext = {
  workspaceId: string
  userId: string
  question: string
  traceId: string
  baseGraph?: CanvasGraph
  knowledgeEvidence?: KnowledgeEvidence[]
}

export async function* streamBmcFlowConversation(
  adapter: BmcFlowAdapter,
  context: BmcFlowConversationContext
): AsyncGenerator<BusinessStreamUpdate> {
  const initialGraph: CanvasGraph = context.baseGraph
    ? cloneGraph(context.baseGraph)
    : {
        workspaceId: context.workspaceId,
        nodes: [],
        edges: []
      }

  yield {
    type: 'init',
    graph: initialGraph,
    knowledgeEvidence: context.knowledgeEvidence ?? []
  }

  const result = await adapter.execute({
    workspaceId: context.workspaceId,
    userId: context.userId,
    executionId: context.traceId,
    question: context.question
  })

  yield {
    type: 'delta',
    delta: {
      nodes: result.graph.nodes,
      edges: result.graph.edges
    }
  }

  yield {
    type: 'status',
    status: 'completed'
  }
}

function cloneGraph(graph: CanvasGraph): CanvasGraph {
  return {
    workspaceId: graph.workspaceId,
    nodes: graph.nodes.map((node) => ({
      ...node,
      position: { ...node.position },
      data: { ...node.data }
    })),
    edges: graph.edges.map((edge) => ({ ...edge }))
  }
}
