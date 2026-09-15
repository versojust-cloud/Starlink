import {
  workspaceMetadataHistoryEntrySchema,
  workspaceMetadataUpdateInputSchema,
  type WorkspaceMember,
  type WorkspaceMetadataHistoryEntry,
  type WorkspaceMetadataUpdateInput
} from '@starlink/shared'
import { pool } from '../infrastructure/db/pool.js'

type StoredWorkspaceMetadataRecord = {
  workspaceId: string
  name: string
  type: string
  focus: string
  ownerId: string
  ownerName: string
  members: WorkspaceMember[]
}

const DEFAULT_WORKSPACES: StoredWorkspaceMetadataRecord[] = [
  {
    workspaceId: 'proj-001',
    name: 'AI 竞品分析',
    type: 'research-program',
    focus: '从访谈、竞品文档到产品策略方案',
    ownerId: 'lead-alex',
    ownerName: 'Alex Chen',
    members: [
      {
        id: 'lead-alex',
        name: 'Alex Chen',
        role: 'owner',
        permissions: ['workspace.read', 'workspace.write', 'workspace.publish', 'workspace.manage']
      },
      {
        id: 'analyst-sarah',
        name: 'Sarah Lee',
        role: 'analyst',
        permissions: ['workspace.read', 'workspace.write']
      },
      {
        id: 'pm-marcus',
        name: 'Marcus Reid',
        role: 'strategist',
        permissions: ['workspace.read', 'workspace.write', 'workspace.publish']
      }
    ]
  },
  {
    workspaceId: 'proj-002',
    name: '市场调研 - 教育行业',
    type: 'market-study',
    focus: '聚焦行业趋势、定价与区域市场判断',
    ownerId: 'lead-maria',
    ownerName: 'Maria Garcia',
    members: [
      {
        id: 'lead-maria',
        name: 'Maria Garcia',
        role: 'owner',
        permissions: ['workspace.read', 'workspace.write', 'workspace.publish', 'workspace.manage']
      },
      {
        id: 'research-chen',
        name: 'Chen Wei',
        role: 'researcher',
        permissions: ['workspace.read', 'workspace.write']
      }
    ]
  },
  {
    workspaceId: 'proj-003',
    name: '新产品 PRD 草案',
    type: 'product-delivery',
    focus: '从策略画布进入执行评审和汇报表达',
    ownerId: 'lead-jade',
    ownerName: 'Jade Lin',
    members: [
      {
        id: 'lead-jade',
        name: 'Jade Lin',
        role: 'owner',
        permissions: ['workspace.read', 'workspace.write', 'workspace.publish', 'workspace.manage']
      },
      {
        id: 'design-ivy',
        name: 'Ivy Zhou',
        role: 'designer',
        permissions: ['workspace.read', 'workspace.write']
      },
      {
        id: 'ops-leo',
        name: 'Leo Wang',
        role: 'operations',
        permissions: ['workspace.read', 'workspace.write', 'workspace.share']
      }
    ]
  }
]

const initTables = pool.query(`
  CREATE TABLE IF NOT EXISTS workspace_metadata (
    workspace_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    focus TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    owner_name TEXT NOT NULL,
    members JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS workspace_metadata_history (
    history_id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    changed_by TEXT NOT NULL,
    changed_at TIMESTAMPTZ NOT NULL,
    summary TEXT NOT NULL,
    version INTEGER NOT NULL
  );
`)

let seeded = false

async function ensureTables(): Promise<void> {
  await initTables
  if (!seeded) {
    seeded = true
    for (const workspace of DEFAULT_WORKSPACES) {
      await pool.query(
        `INSERT INTO workspace_metadata (workspace_id, name, type, focus, owner_id, owner_name, members)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
         ON CONFLICT (workspace_id) DO NOTHING`,
        [
          workspace.workspaceId,
          workspace.name,
          workspace.type,
          workspace.focus,
          workspace.ownerId,
          workspace.ownerName,
          JSON.stringify(workspace.members)
        ]
      )
    }
  }
}

function rowToRecord(row: Record<string, unknown>): StoredWorkspaceMetadataRecord {
  return {
    workspaceId: row.workspace_id as string,
    name: row.name as string,
    type: row.type as string,
    focus: row.focus as string,
    ownerId: row.owner_id as string,
    ownerName: row.owner_name as string,
    members: (typeof row.members === 'string' ? JSON.parse(row.members) : row.members) as WorkspaceMember[]
  }
}

function buildDefaultWorkspaceMetadata(
  workspaceId: string,
  seedOwner?: { id: string; name?: string }
): StoredWorkspaceMetadataRecord {
  // When a workspace is auto-created (URL navigation hits getWorkspaceMetadata
  // for an unknown id), default the owner to the requesting user so they
  // can immediately read/write. Without this the new workspace only has
  // 'system-owner' and every subsequent op fails with FORBIDDEN.
  const ownerId = seedOwner?.id || 'system-owner'
  const ownerName = seedOwner?.name || (seedOwner?.id ? seedOwner.id : 'Workspace Owner')
  return {
    workspaceId,
    name: workspaceId,
    type: 'workspace',
    focus: '等待工作区元数据接入',
    ownerId,
    ownerName,
    members: [
      {
        id: ownerId,
        name: ownerName,
        role: 'owner',
        permissions: ['workspace.read', 'workspace.write', 'workspace.publish', 'workspace.manage']
      }
    ]
  }
}

function buildSummary(previous: StoredWorkspaceMetadataRecord | null, next: StoredWorkspaceMetadataRecord) {
  if (!previous) return 'Created workspace metadata'
  const changes: string[] = []
  if (previous.name !== next.name) changes.push('name')
  if (previous.type !== next.type) changes.push('type')
  if (previous.focus !== next.focus) changes.push('focus')
  if (previous.ownerId !== next.ownerId || previous.ownerName !== next.ownerName) changes.push('owner')
  if (JSON.stringify(previous.members) !== JSON.stringify(next.members)) changes.push('members')
  return changes.length > 0 ? `Updated ${changes.join(', ')}` : 'Saved workspace metadata'
}

export function resolveViewerPermissions(userId: string, members: WorkspaceMember[]) {
  const member = members.find((item) => item.id === userId)
  return member?.permissions ?? []
}

export async function listWorkspaceMetadata(): Promise<StoredWorkspaceMetadataRecord[]> {
  await ensureTables()
  const result = await pool.query('SELECT * FROM workspace_metadata ORDER BY workspace_id')
  return result.rows.map(rowToRecord)
}

export async function getWorkspaceMetadata(
  workspaceId: string,
  seedOwner?: { id: string; name?: string }
): Promise<StoredWorkspaceMetadataRecord> {
  await ensureTables()
  const result = await pool.query(
    'SELECT * FROM workspace_metadata WHERE workspace_id = $1',
    [workspaceId]
  )
  if (result.rowCount === 0) {
    const defaultRecord = buildDefaultWorkspaceMetadata(workspaceId, seedOwner)
    await pool.query(
      `INSERT INTO workspace_metadata (workspace_id, name, type, focus, owner_id, owner_name, members)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
       ON CONFLICT (workspace_id) DO NOTHING`,
      [
        defaultRecord.workspaceId,
        defaultRecord.name,
        defaultRecord.type,
        defaultRecord.focus,
        defaultRecord.ownerId,
        defaultRecord.ownerName,
        JSON.stringify(defaultRecord.members)
      ]
    )
    return defaultRecord
  }
  return rowToRecord(result.rows[0])
}

export async function listWorkspaceMetadataHistory(workspaceId: string): Promise<WorkspaceMetadataHistoryEntry[]> {
  await ensureTables()
  const result = await pool.query(
    'SELECT * FROM workspace_metadata_history WHERE workspace_id = $1 ORDER BY changed_at DESC',
    [workspaceId]
  )
  return result.rows.map((row: Record<string, unknown>) =>
    workspaceMetadataHistoryEntrySchema.parse({
      historyId: row.history_id,
      workspaceId: row.workspace_id,
      changedBy: row.changed_by,
      changedAt: (row.changed_at as Date).toISOString(),
      summary: row.summary,
      version: row.version
    })
  )
}

export async function updateWorkspaceMetadata(input: WorkspaceMetadataUpdateInput, changedBy: string) {
  const parsed = workspaceMetadataUpdateInputSchema.parse(input)
  await ensureTables()

  const previousResult = await pool.query(
    'SELECT * FROM workspace_metadata WHERE workspace_id = $1',
    [parsed.workspaceId]
  )
  const previous = previousResult.rowCount ? rowToRecord(previousResult.rows[0]) : null

  const nextRecord: StoredWorkspaceMetadataRecord = {
    workspaceId: parsed.workspaceId,
    name: parsed.name,
    type: parsed.type,
    focus: parsed.focus,
    ownerId: parsed.ownerId,
    ownerName: parsed.ownerName,
    members: parsed.members.map((m) => ({ ...m, permissions: [...m.permissions] }))
  }

  await pool.query(
    `INSERT INTO workspace_metadata (workspace_id, name, type, focus, owner_id, owner_name, members, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, NOW())
     ON CONFLICT (workspace_id) DO UPDATE
     SET name = EXCLUDED.name,
         type = EXCLUDED.type,
         focus = EXCLUDED.focus,
         owner_id = EXCLUDED.owner_id,
         owner_name = EXCLUDED.owner_name,
         members = EXCLUDED.members,
         updated_at = NOW()`,
    [
      nextRecord.workspaceId,
      nextRecord.name,
      nextRecord.type,
      nextRecord.focus,
      nextRecord.ownerId,
      nextRecord.ownerName,
      JSON.stringify(nextRecord.members)
    ]
  )

  const versionResult = await pool.query(
    'SELECT COUNT(*) AS cnt FROM workspace_metadata_history WHERE workspace_id = $1',
    [parsed.workspaceId]
  )
  const version = Number(versionResult.rows[0].cnt) + 1

  const historyEntry = workspaceMetadataHistoryEntrySchema.parse({
    historyId: `history-${parsed.workspaceId}-${Date.now()}`,
    workspaceId: parsed.workspaceId,
    changedBy,
    changedAt: new Date().toISOString(),
    summary: buildSummary(previous, nextRecord),
    version
  })

  await pool.query(
    `INSERT INTO workspace_metadata_history (history_id, workspace_id, changed_by, changed_at, summary, version)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      historyEntry.historyId,
      historyEntry.workspaceId,
      historyEntry.changedBy,
      historyEntry.changedAt,
      historyEntry.summary,
      historyEntry.version
    ]
  )

  return {
    workspace: nextRecord,
    historyEntry
  }
}
