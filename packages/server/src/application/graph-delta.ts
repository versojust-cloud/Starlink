import type { CanvasGraph } from '@starlink/shared'
import type { GraphDelta } from '../services/business-langgraph.js'

export function applyGraphDelta(graph: CanvasGraph, delta: GraphDelta): CanvasGraph {
  return {
    workspaceId: graph.workspaceId,
    nodes: mergeById(
      removeById(graph.nodes, delta.removedNodeIds),
      delta.nodes
    ),
    edges: mergeById(
      removeById(graph.edges, delta.removedEdgeIds),
      delta.edges
    )
  }
}

function mergeById<T extends { id: string }>(current: T[], updates?: T[]): T[] {
  if (!updates || updates.length === 0) return current
  const merged = new Map(current.map((item) => [item.id, item]))
  for (const item of updates) {
    merged.set(item.id, item)
  }
  return [...merged.values()]
}

function removeById<T extends { id: string }>(current: T[], removedIds?: string[]): T[] {
  if (!removedIds || removedIds.length === 0) return current
  const removed = new Set(removedIds)
  return current.filter((item) => !removed.has(item.id))
}
