/**
 * ExecutionStore — tracks workflow execution state.
 * In-memory implementation; swap to PostgreSQL for production.
 */

import type { ExecutionStatus, NodeStatus } from '@starlink/shared'
import { nanoid } from 'nanoid'

export interface ExecutionRecord {
  id: string
  flowId: string
  status: ExecutionStatus
  inputs: Record<string, unknown>
  state: Record<string, unknown> | null
  error: string | null
  startedAt: Date
  completedAt: Date | null
}

export interface NodeStateRecord {
  executionId: string
  nodeId: string
  status: NodeStatus
  input: unknown
  output: unknown
  error: string | null
  startedAt: Date | null
  completedAt: Date | null
  duration: number | null
}

export class ExecutionStore {
  private executions = new Map<string, ExecutionRecord>()
  private nodeStates = new Map<string, NodeStateRecord[]>()

  async createExecution(flowId: string, inputs: Record<string, unknown>): Promise<ExecutionRecord> {
    const id = nanoid()
    const record: ExecutionRecord = {
      id,
      flowId,
      status: 'pending',
      inputs,
      state: null,
      error: null,
      startedAt: new Date(),
      completedAt: null,
    }
    this.executions.set(id, record)
    this.nodeStates.set(id, [])
    return record
  }

  async getExecution(id: string): Promise<ExecutionRecord | null> {
    return this.executions.get(id) ?? null
  }

  async updateExecutionStatus(
    id: string,
    status: ExecutionStatus,
    state?: Record<string, unknown>,
    error?: string,
  ): Promise<void> {
    const record = this.executions.get(id)
    if (!record) return
    record.status = status
    if (state) record.state = state
    if (error) record.error = error
    if (status === 'completed' || status === 'failed' || status === 'cancelled') {
      record.completedAt = new Date()
    }
  }

  async updateNodeState(
    executionId: string,
    nodeId: string,
    status: NodeStatus,
    output?: unknown,
    error?: string,
    duration?: number,
  ): Promise<void> {
    const states = this.nodeStates.get(executionId)
    if (!states) return
    const existing = states.find((s) => s.nodeId === nodeId)
    if (existing) {
      existing.status = status
      if (output !== undefined) existing.output = output
      if (error) existing.error = error
      if (duration) existing.duration = duration
      if (status === 'running') existing.startedAt = new Date()
      if (status === 'completed' || status === 'failed') existing.completedAt = new Date()
    } else {
      states.push({
        executionId,
        nodeId,
        status,
        input: null,
        output: output ?? null,
        error: error ?? null,
        startedAt: status === 'running' ? new Date() : null,
        completedAt: null,
        duration: duration ?? null,
      })
    }
  }

  async listExecutions(flowId: string): Promise<ExecutionRecord[]> {
    return Array.from(this.executions.values())
      .filter((e) => e.flowId === flowId)
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
  }

  async getNodeStates(executionId: string): Promise<NodeStateRecord[]> {
    return this.nodeStates.get(executionId) ?? []
  }
}
