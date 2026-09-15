/**
 * BusinessCanvasBuilder — manages CanvasNode / CanvasEdge state for one
 * conversation, applying MacraNode → CanvasNode projection and computing
 * incremental GraphDelta payloads.
 *
 * Extracted from business-langgraph.ts (Stage 4d cleanup, 2026-05-04).
 * Self-contained class with no orchestrator-internal coupling — only
 * depends on shared canvas types, constants (ROOT_POSITION / NODE_SPACING),
 * the GraphDelta + MacraNodeData types from state, and the layout helpers
 * from parsing.
 */

import { nanoid } from 'nanoid'
import type {
  CanvasEdge,
  CanvasGraph,
  CanvasNode,
  SeminarPhase
} from '@starlink/shared'
import { NODE_SPACING, ROOT_POSITION } from './constants.js'
import { cloneCanvasNode, computeNextY } from './parsing.js'
import type { GraphDelta, MacraNodeData } from './state.js'

export class BusinessCanvasBuilder {
  private readonly nodes = new Map<string, CanvasNode>()
  private readonly edges = new Map<string, CanvasEdge>()
  private readonly rootId: string | null
  private nextY = ROOT_POSITION.y + NODE_SPACING

  constructor(
    private readonly workspaceId: string,
    private readonly userId: string,
    private readonly question: string,
    initialGraph?: CanvasGraph
  ) {
    if (initialGraph?.workspaceId === this.workspaceId) {
      for (const node of initialGraph.nodes) {
        this.nodes.set(node.id, cloneCanvasNode(node))
      }
      for (const edge of initialGraph.edges) {
        this.edges.set(edge.id, { ...edge })
      }
      this.nextY = computeNextY(initialGraph.nodes)
    }

    if (this.nodes.size > 0) {
      this.rootId = null
      return
    }

    this.rootId = `root-${nanoid(8)}`
    const rootNode: CanvasNode = {
      id: this.rootId,
      type: 'note',
      position: { ...ROOT_POSITION },
      data: {
        type: 'note',
        title: 'Business LangGraph 分析任务',
        subtitle: `提问人：${this.userId || 'anonymous'}`,
        content: this.question,
        footerText: 'Multi-Agent 研讨会模式 · MACRA 系统',
        variant: 'primary'
      }
    }
    this.nodes.set(rootNode.id, rootNode)
  }

  getGraph(): CanvasGraph {
    return {
      workspaceId: this.workspaceId,
      nodes: [...this.nodes.values()],
      edges: [...this.edges.values()]
    }
  }

  addMacraNode(macraNode: MacraNodeData): GraphDelta {
    const existing = this.nodes.get(macraNode.id)
    const node: CanvasNode = {
      id: macraNode.id,
      type: 'note',
      position: existing?.position ?? { x: ROOT_POSITION.x, y: this.nextY },
      data: {
        type: 'note',
        title: macraNode.label,
        content: macraNode.content,
        variant: 'insight',
        meta: {
          macraType: macraNode.type,
          domain: macraNode.domain,
          agentType: macraNode.agentType,
          severity: macraNode.severity,
          conflictType: macraNode.conflictType,
          isInteractive: macraNode.isInteractive,
          // P9 Block 1 fix · pass summary + fullContent through to the
          // canvas meta so the BMC drawer can render two distinct
          // sections (摘要 vs 详细内容). Without these, frontend's
          // extractMacraNodeData falls back to data.content for both,
          // collapsing them into the same string. The bmc-renderer.tool
          // path was already fixed in commit f9107ae but the orchestrator
          // path (this addMacraNode → main BMC pipeline) was missed.
          summary: macraNode.summary || '',
          fullContent: macraNode.fullContent || '',
          metadata: macraNode.metadata
        }
      }
    }

    this.nodes.set(node.id, node)
    if (!existing) {
      this.nextY += NODE_SPACING
    }

    return { nodes: [node] }
  }

  replaceNodesByMacraType(macraType: MacraNodeData['type'], nextNodes: MacraNodeData[]): GraphDelta {
    const removedNodeIds = [...this.nodes.values()]
      .filter((node) => {
        const meta = node.data as { meta?: { macraType?: string } } | undefined
        return meta?.meta?.macraType === macraType
      })
      .map((node) => node.id)
    const removedEdgeIds = [...this.edges.values()]
      .filter((edge) => removedNodeIds.includes(edge.source) || removedNodeIds.includes(edge.target))
      .map((edge) => edge.id)

    for (const nodeId of removedNodeIds) {
      this.nodes.delete(nodeId)
    }
    for (const edgeId of removedEdgeIds) {
      this.edges.delete(edgeId)
    }

    const addedNodes: CanvasNode[] = []
    for (const macraNode of nextNodes) {
      const delta = this.addMacraNode(macraNode)
      addedNodes.push(...(delta.nodes ?? []))
    }

    return {
      nodes: addedNodes,
      removedNodeIds,
      removedEdgeIds
    }
  }

  addInsightNode(title: string, content: string, stage: SeminarPhase = 'planning'): GraphDelta {
    const id = `insight-${nanoid(8)}`
    const node: CanvasNode = {
      id,
      type: 'note',
      position: { x: ROOT_POSITION.x, y: this.nextY },
      data: {
        type: 'note',
        title,
        content,
        variant: 'insight',
        meta: {
          macraType: 'insight-note',
          metadata: {
            agent_signature: 'Orchestrator',
            confidence: 'high',
            stage
          }
        }
      }
    }

    this.nodes.set(id, node)
    this.nextY += NODE_SPACING

    return { nodes: [node] }
  }
}
