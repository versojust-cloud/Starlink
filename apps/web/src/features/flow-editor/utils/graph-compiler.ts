import type { Node, Edge } from 'reactflow'

export interface ValidationResult {
  valid: boolean
  errors: string[]
}

/**
 * Validate a flow graph for structural correctness.
 *
 * Checks performed:
 *  1. At least one node exists.
 *  2. No cycles (DAG requirement).
 *  3. Warn about orphan nodes (no incoming or outgoing edges).
 */
export function validateFlowGraph(nodes: Node[], edges: Edge[]): ValidationResult {
  const errors: string[] = []

  // --- check 1: at least one node ---
  if (nodes.length === 0) {
    errors.push('Flow must contain at least one node.')
    return { valid: false, errors }
  }

  // --- check 2: cycle detection (Kahn's algorithm) ---
  const nodeIds = new Set(nodes.map((n) => n.id))

  // build adjacency list and in-degree map
  const inDegree = new Map<string, number>()
  const adjacency = new Map<string, string[]>()

  for (const id of nodeIds) {
    inDegree.set(id, 0)
    adjacency.set(id, [])
  }

  for (const edge of edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) continue
    adjacency.get(edge.source)!.push(edge.target)
    inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1)
  }

  const queue: string[] = []
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id)
  }

  let visited = 0
  while (queue.length > 0) {
    const current = queue.shift()!
    visited++
    for (const neighbor of adjacency.get(current) ?? []) {
      const newDeg = (inDegree.get(neighbor) ?? 1) - 1
      inDegree.set(neighbor, newDeg)
      if (newDeg === 0) queue.push(neighbor)
    }
  }

  if (visited < nodeIds.size) {
    errors.push('Flow contains a cycle. Cycles are not allowed.')
  }

  // --- check 3: orphan nodes warning ---
  const connected = new Set<string>()
  for (const edge of edges) {
    connected.add(edge.source)
    connected.add(edge.target)
  }

  if (nodes.length > 1) {
    const orphans = nodes.filter((n) => !connected.has(n.id))
    for (const orphan of orphans) {
      const label = (orphan.data?.label as string) ?? orphan.id
      errors.push(`Node "${label}" is not connected to any other node.`)
    }
  }

  return { valid: errors.length === 0, errors }
}
