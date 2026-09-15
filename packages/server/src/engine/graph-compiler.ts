/**
 * Graph Compiler — converts a visual FlowDefinition into an ExecutionPlan.
 * Handles: cycle detection, topological sort, parallel group identification, port type validation.
 */

import type { FlowDefinition, FlowNode, FlowEdge } from '@starlink/shared'
import type { ExecutionPlan, ExecutionStep, InputMapping } from '@starlink/shared'

export class GraphCompilationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GraphCompilationError'
  }
}

export class GraphCompiler {
  compile(flow: FlowDefinition): ExecutionPlan {
    this.validateGraph(flow)
    const sorted = this.topologicalSort(flow.nodes, flow.edges)
    const parallelGroups = this.findParallelGroups(sorted, flow.nodes, flow.edges)

    const steps: ExecutionStep[] = sorted.map((nodeId) => {
      const node = flow.nodes.find((n) => n.id === nodeId)!
      return {
        nodeId,
        toolName: node.toolName,
        inputs: this.resolveInputs(nodeId, flow.edges),
        config: node.config,
      }
    })

    return { steps, parallelGroups }
  }

  // ── Validation ─────────────────────────────────────────

  private validateGraph(flow: FlowDefinition): void {
    if (flow.nodes.length === 0) {
      throw new GraphCompilationError('Flow has no nodes')
    }

    // Check for duplicate node IDs
    const ids = new Set<string>()
    for (const node of flow.nodes) {
      if (ids.has(node.id)) {
        throw new GraphCompilationError(`Duplicate node ID: ${node.id}`)
      }
      ids.add(node.id)
    }

    // Validate edges reference existing nodes
    for (const edge of flow.edges) {
      if (!ids.has(edge.source)) {
        throw new GraphCompilationError(`Edge references unknown source node: ${edge.source}`)
      }
      if (!ids.has(edge.target)) {
        throw new GraphCompilationError(`Edge references unknown target node: ${edge.target}`)
      }
      if (edge.source === edge.target) {
        throw new GraphCompilationError(`Self-loop detected on node: ${edge.source}`)
      }
    }

    // Cycle detection via DFS
    this.detectCycles(flow.nodes, flow.edges)

    // Port type compatibility
    this.validatePortTypes(flow.nodes, flow.edges)
  }

  private detectCycles(nodes: FlowNode[], edges: FlowEdge[]): void {
    const adj = new Map<string, string[]>()
    for (const node of nodes) adj.set(node.id, [])
    for (const edge of edges) adj.get(edge.source)!.push(edge.target)

    const WHITE = 0, GRAY = 1, BLACK = 2
    const color = new Map<string, number>()
    for (const node of nodes) color.set(node.id, WHITE)

    const dfs = (u: string): void => {
      color.set(u, GRAY)
      for (const v of adj.get(u) ?? []) {
        if (color.get(v) === GRAY) {
          throw new GraphCompilationError(`Cycle detected involving node: ${v}`)
        }
        if (color.get(v) === WHITE) dfs(v)
      }
      color.set(u, BLACK)
    }

    for (const node of nodes) {
      if (color.get(node.id) === WHITE) dfs(node.id)
    }
  }

  private validatePortTypes(nodes: FlowNode[], edges: FlowEdge[]): void {
    const nodeMap = new Map(nodes.map((n) => [n.id, n]))

    for (const edge of edges) {
      const sourceNode = nodeMap.get(edge.source)!
      const targetNode = nodeMap.get(edge.target)!

      const sourcePort = sourceNode.outputPorts.find((p) => p.name === edge.sourcePort)
      const targetPort = targetNode.inputPorts.find((p) => p.name === edge.targetPort)

      if (!sourcePort) {
        throw new GraphCompilationError(
          `Node "${edge.source}" has no output port "${edge.sourcePort}"`,
        )
      }
      if (!targetPort) {
        throw new GraphCompilationError(
          `Node "${edge.target}" has no input port "${edge.targetPort}"`,
        )
      }

      // Type compatibility: 'any' matches everything
      if (sourcePort.type !== 'any' && targetPort.type !== 'any' && sourcePort.type !== targetPort.type) {
        throw new GraphCompilationError(
          `Type mismatch: ${edge.source}.${edge.sourcePort} (${sourcePort.type}) → ${edge.target}.${edge.targetPort} (${targetPort.type})`,
        )
      }
    }
  }

  // ── Topological Sort (Kahn's Algorithm) ────────────────

  private topologicalSort(nodes: FlowNode[], edges: FlowEdge[]): string[] {
    const inDegree = new Map<string, number>()
    const adj = new Map<string, string[]>()

    for (const node of nodes) {
      inDegree.set(node.id, 0)
      adj.set(node.id, [])
    }

    for (const edge of edges) {
      adj.get(edge.source)!.push(edge.target)
      inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1)
    }

    const queue: string[] = []
    for (const [id, deg] of inDegree) {
      if (deg === 0) queue.push(id)
    }

    const sorted: string[] = []
    while (queue.length > 0) {
      const u = queue.shift()!
      sorted.push(u)
      for (const v of adj.get(u) ?? []) {
        const newDeg = (inDegree.get(v) ?? 1) - 1
        inDegree.set(v, newDeg)
        if (newDeg === 0) queue.push(v)
      }
    }

    return sorted
  }

  // ── Parallel Group Identification ──────────────────────

  private findParallelGroups(
    sorted: string[],
    nodes: FlowNode[],
    edges: FlowEdge[],
  ): string[][] {
    // Compute the "level" of each node (longest path from any root)
    const level = new Map<string, number>()
    const adj = new Map<string, string[]>()
    for (const node of nodes) {
      adj.set(node.id, [])
      level.set(node.id, 0)
    }
    for (const edge of edges) adj.get(edge.source)!.push(edge.target)

    for (const u of sorted) {
      for (const v of adj.get(u) ?? []) {
        level.set(v, Math.max(level.get(v)!, level.get(u)! + 1))
      }
    }

    // Group by level
    const groups = new Map<number, string[]>()
    for (const id of sorted) {
      const lv = level.get(id)!
      if (!groups.has(lv)) groups.set(lv, [])
      groups.get(lv)!.push(id)
    }

    // Return in order
    const maxLevel = Math.max(...groups.keys(), 0)
    const result: string[][] = []
    for (let i = 0; i <= maxLevel; i++) {
      if (groups.has(i)) result.push(groups.get(i)!)
    }
    return result
  }

  // ── Input Resolution ───────────────────────────────────

  private resolveInputs(nodeId: string, edges: FlowEdge[]): InputMapping[] {
    return edges
      .filter((e) => e.target === nodeId)
      .map((e) => ({
        sourceNodeId: e.source,
        sourcePort: e.sourcePort,
        targetPort: e.targetPort,
      }))
  }
}
