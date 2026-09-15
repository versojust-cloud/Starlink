import type { CanvasGraph, ExecutionEvent } from '@starlink/shared'
import type { ToolRegistry } from '../tool-registry/registry.js'
import { BMC_TEMPLATE } from '../seeds/flow-templates.js'
import { GraphCompiler } from './graph-compiler.js'
import { GraphExecutor } from './graph-executor.js'

export type BmcFlowAdapterInput = {
  workspaceId: string
  userId: string
  question: string
  executionId: string
  abortController?: AbortController
}

export type BmcFlowAdapterResult = {
  graph: CanvasGraph
  finalState: Record<string, unknown>
  events: ExecutionEvent[]
}

export class BmcFlowExecutionError extends Error {
  constructor(readonly errors: Array<{ nodeId: string; error: string }>) {
    super(errors.map((error) => `${error.nodeId}: ${error.error}`).join('; '))
    this.name = 'BmcFlowExecutionError'
  }
}

export class BmcFlowAdapter {
  private readonly compiler = new GraphCompiler()

  constructor(private readonly registry: ToolRegistry) {}

  async execute(input: BmcFlowAdapterInput): Promise<BmcFlowAdapterResult> {
    const plan = this.compiler.compile(BMC_TEMPLATE)
    const events: ExecutionEvent[] = []
    const errors: Array<{ nodeId: string; error: string }> = []
    let finalState: Record<string, unknown> | null = null

    const executor = new GraphExecutor(this.registry)
    for await (const event of executor.execute(
      plan,
      { question: input.question },
      {
        workspaceId: input.workspaceId,
        userId: input.userId,
        executionId: input.executionId,
        abortController: input.abortController ?? new AbortController()
      }
    )) {
      events.push(event)
      if (event.type === 'node_error') {
        errors.push({ nodeId: event.nodeId, error: event.error })
      }
      if (event.type === 'flow_complete') {
        finalState = event.finalState
      }
    }

    if (errors.length > 0) {
      throw new BmcFlowExecutionError(errors)
    }
    if (!finalState) {
      throw new BmcFlowExecutionError([{ nodeId: 'flow', error: 'Flow did not emit final state' }])
    }

    return {
      graph: extractRenderedGraph(finalState),
      finalState,
      events
    }
  }
}

function extractRenderedGraph(finalState: Record<string, unknown>): CanvasGraph {
  const rendererOutput = finalState['bmc-1'] as { canvas?: unknown } | undefined
  if (!isCanvasGraph(rendererOutput?.canvas)) {
    throw new BmcFlowExecutionError([{ nodeId: 'bmc-1', error: 'Renderer did not produce a CanvasGraph' }])
  }
  return rendererOutput.canvas
}

function isCanvasGraph(value: unknown): value is CanvasGraph {
  if (!value || typeof value !== 'object') return false
  const graph = value as Partial<CanvasGraph>
  return typeof graph.workspaceId === 'string'
    && Array.isArray(graph.nodes)
    && Array.isArray(graph.edges)
}

