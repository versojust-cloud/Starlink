import type { Node, Edge } from 'reactflow'

const HORIZONTAL_SPACING = 250
const VERTICAL_SPACING = 150

/**
 * Apply automatic layout to flow nodes using a simple topological-sort based
 * level assignment. Nodes are arranged in columns (levels) from left to right.
 *
 * Returns a new array of nodes with updated positions.
 */
export function applyAutoLayout(nodes: Node[], edges: Edge[]): Node[] {
  if (nodes.length === 0) return []

  const nodeIds = new Set(nodes.map((n) => n.id))

  // --- build adjacency and in-degree ---
  const adjacency = new Map<string, string[]>()
  const inDegree = new Map<string, number>()

  for (const id of nodeIds) {
    adjacency.set(id, [])
    inDegree.set(id, 0)
  }

  for (const edge of edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) continue
    adjacency.get(edge.source)!.push(edge.target)
    inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1)
  }

  // --- topological sort with level assignment ---
  const level = new Map<string, number>()
  const queue: string[] = []

  for (const [id, deg] of inDegree) {
    if (deg === 0) {
      queue.push(id)
      level.set(id, 0)
    }
  }

  while (queue.length > 0) {
    const current = queue.shift()!
    const currentLevel = level.get(current) ?? 0

    for (const neighbor of adjacency.get(current) ?? []) {
      // assign the maximum level from all incoming edges
      const existingLevel = level.get(neighbor) ?? 0
      level.set(neighbor, Math.max(existingLevel, currentLevel + 1))

      const newDeg = (inDegree.get(neighbor) ?? 1) - 1
      inDegree.set(neighbor, newDeg)
      if (newDeg === 0) queue.push(neighbor)
    }
  }

  // nodes that were not reached (part of a cycle) get level 0
  for (const id of nodeIds) {
    if (!level.has(id)) level.set(id, 0)
  }

  // --- group nodes by level ---
  const levelGroups = new Map<number, string[]>()
  for (const [id, lvl] of level) {
    if (!levelGroups.has(lvl)) levelGroups.set(lvl, [])
    levelGroups.get(lvl)!.push(id)
  }

  // --- assign positions ---
  const positionMap = new Map<string, { x: number; y: number }>()

  for (const [lvl, ids] of levelGroups) {
    const totalHeight = (ids.length - 1) * VERTICAL_SPACING
    const startY = -totalHeight / 2

    ids.forEach((id, index) => {
      positionMap.set(id, {
        x: lvl * HORIZONTAL_SPACING,
        y: startY + index * VERTICAL_SPACING,
      })
    })
  }

  return nodes.map((node) => {
    const pos = positionMap.get(node.id)
    if (!pos) return node
    return { ...node, position: pos }
  })
}
