/**
 * FlowStore — CRUD for workflow definitions.
 * Uses in-memory storage; swap to PostgreSQL for production.
 */

import type { FlowDefinition } from '@starlink/shared'
import { nanoid } from 'nanoid'

export interface FlowRecord {
  id: string
  workspaceId: string
  name: string
  description?: string
  definition: FlowDefinition
  isTemplate: boolean
  version: number
  ownerId: string
  createdAt: Date
  updatedAt: Date
}

export class FlowStore {
  private flows = new Map<string, FlowRecord>()

  async createFlow(
    workspaceId: string,
    name: string,
    definition: FlowDefinition,
    ownerId: string,
  ): Promise<FlowRecord> {
    const id = nanoid()
    const now = new Date()
    const record: FlowRecord = {
      id,
      workspaceId,
      name,
      definition: { ...definition, id },
      isTemplate: false,
      version: 1,
      ownerId,
      createdAt: now,
      updatedAt: now,
    }
    this.flows.set(id, record)
    return record
  }

  async getFlow(id: string): Promise<FlowRecord | null> {
    return this.flows.get(id) ?? null
  }

  async updateFlow(id: string, updates: Partial<Pick<FlowRecord, 'name' | 'description' | 'definition'>>): Promise<FlowRecord | null> {
    const record = this.flows.get(id)
    if (!record) return null
    Object.assign(record, updates, { updatedAt: new Date(), version: record.version + 1 })
    return record
  }

  async deleteFlow(id: string): Promise<boolean> {
    return this.flows.delete(id)
  }

  async listFlows(workspaceId: string): Promise<FlowRecord[]> {
    return Array.from(this.flows.values())
      .filter((f) => f.workspaceId === workspaceId)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
  }

  async listTemplates(): Promise<FlowRecord[]> {
    return Array.from(this.flows.values()).filter((f) => f.isTemplate)
  }

  async saveAsTemplate(flowId: string, name: string): Promise<FlowRecord | null> {
    const source = this.flows.get(flowId)
    if (!source) return null
    const id = nanoid()
    const record: FlowRecord = {
      ...source,
      id,
      name,
      isTemplate: true,
      definition: { ...source.definition, id },
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    this.flows.set(id, record)
    return record
  }
}
