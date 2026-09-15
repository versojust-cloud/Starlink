/**
 * Execution engine type definitions.
 * Covers compilation plans, runtime events, and agent events.
 */

// ── Execution Plan (output of Graph Compiler) ─────────────

export interface InputMapping {
  sourceNodeId: string
  sourcePort: string
  targetPort: string
}

export interface ExecutionStep {
  nodeId: string
  toolName: string
  inputs: InputMapping[]
  config: Record<string, unknown>
}

export interface ExecutionPlan {
  steps: ExecutionStep[]
  parallelGroups: string[][]
}

// ── Execution Status ──────────────────────────────────────

export type ExecutionStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
export type NodeStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped'

// ── Execution Events (emitted by Graph Executor) ──────────

export type ExecutionEvent =
  | { type: 'group_start'; nodeIds: string[] }
  | { type: 'node_start'; nodeId: string; toolName: string }
  | { type: 'node_progress'; nodeId: string; percent: number; message: string }
  | { type: 'node_complete'; nodeId: string; output: unknown; duration: number }
  | { type: 'node_error'; nodeId: string; error: string }
  | { type: 'flow_complete'; finalState: Record<string, unknown> }

// ── Agent Events (emitted by Agent Executor) ──────────────

export interface ToolCall {
  id: string
  name: string
  args: Record<string, unknown>
}

export type AgentEvent =
  | { type: 'thinking'; round: number }
  | { type: 'tool_calls'; calls: ToolCall[] }
  | { type: 'tool_result'; toolCallId: string; toolName: string; result: unknown }
  | { type: 'answer'; content: string }
  | { type: 'error'; error: string }

// ── Execution Context ─────────────────────────────────────

export interface ExecutionContext {
  workspaceId: string
  userId: string
  executionId: string
  abortController: AbortController
}
