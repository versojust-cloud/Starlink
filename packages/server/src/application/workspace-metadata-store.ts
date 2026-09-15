import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  workspaceMetadataHistoryEntrySchema,
  workspaceMetadataUpdateInputSchema,
  type WorkspaceDirectoryItem,
  type WorkspaceMember,
  type WorkspaceMetadataHistoryEntry,
  type WorkspaceMetadataUpdateInput
} from '@starlink/shared'

type StoredWorkspaceMetadataRecord = Omit<WorkspaceDirectoryItem, 'status' | 'updatedAt' | 'viewerPermissions' | 'canManage'>

type WorkspaceMetadataStoreDocument = {
  workspaces: StoredWorkspaceMetadataRecord[]
  history: WorkspaceMetadataHistoryEntry[]
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

const DEFAULT_DOCUMENT: WorkspaceMetadataStoreDocument = {
  workspaces: DEFAULT_WORKSPACES,
  history: []
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const STORE_PATH = path.resolve(__dirname, '../data/workspace-metadata.json')

let cache: WorkspaceMetadataStoreDocument | null = null

function cloneMember(member: WorkspaceMember): WorkspaceMember {
  return {
    ...member,
    permissions: [...member.permissions]
  }
}

function cloneWorkspace(record: StoredWorkspaceMetadataRecord): StoredWorkspaceMetadataRecord {
  return {
    ...record,
    members: record.members.map(cloneMember)
  }
}

function cloneHistory(entry: WorkspaceMetadataHistoryEntry): WorkspaceMetadataHistoryEntry {
  return { ...entry }
}

function buildDefaultWorkspaceMetadata(
  workspaceId: string,
  seedOwner?: { id: string; name?: string }
): StoredWorkspaceMetadataRecord {
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

async function persistDocument(document: WorkspaceMetadataStoreDocument) {
  await mkdir(path.dirname(STORE_PATH), { recursive: true })
  await writeFile(STORE_PATH, JSON.stringify(document, null, 2), 'utf8')
}

async function loadDocument() {
  if (cache) return cache

  try {
    const payload = await readFile(STORE_PATH, 'utf8')
    const parsed = JSON.parse(payload) as Partial<WorkspaceMetadataStoreDocument>
    cache = {
      workspaces: Array.isArray(parsed.workspaces)
        ? parsed.workspaces.map((record) => cloneWorkspace(record as StoredWorkspaceMetadataRecord))
        : DEFAULT_DOCUMENT.workspaces.map(cloneWorkspace),
      history: Array.isArray(parsed.history)
        ? parsed.history.map((entry) => workspaceMetadataHistoryEntrySchema.parse(entry))
        : []
    }
  } catch {
    cache = {
      workspaces: DEFAULT_DOCUMENT.workspaces.map(cloneWorkspace),
      history: []
    }
    await persistDocument(cache)
  }

  return cache
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

export async function listWorkspaceMetadata() {
  const document = await loadDocument()
  return document.workspaces.map(cloneWorkspace)
}

export async function getWorkspaceMetadata(
  workspaceId: string,
  seedOwner?: { id: string; name?: string }
) {
  const document = await loadDocument()
  return cloneWorkspace(
    document.workspaces.find((record) => record.workspaceId === workspaceId) ??
      buildDefaultWorkspaceMetadata(workspaceId, seedOwner)
  )
}

export async function listWorkspaceMetadataHistory(workspaceId: string) {
  const document = await loadDocument()
  return document.history
    .filter((entry) => entry.workspaceId === workspaceId)
    .map(cloneHistory)
    .sort((a, b) => b.changedAt.localeCompare(a.changedAt))
}

export async function updateWorkspaceMetadata(input: WorkspaceMetadataUpdateInput, changedBy: string) {
  const parsed = workspaceMetadataUpdateInputSchema.parse(input)
  const document = await loadDocument()
  const previous = document.workspaces.find((record) => record.workspaceId === parsed.workspaceId) ?? null
  const nextRecord: StoredWorkspaceMetadataRecord = {
    workspaceId: parsed.workspaceId,
    name: parsed.name,
    type: parsed.type,
    focus: parsed.focus,
    ownerId: parsed.ownerId,
    ownerName: parsed.ownerName,
    members: parsed.members.map(cloneMember)
  }

  const nextWorkspaces = document.workspaces.filter((record) => record.workspaceId !== parsed.workspaceId)
  nextWorkspaces.push(nextRecord)
  document.workspaces = nextWorkspaces.sort((a, b) => a.workspaceId.localeCompare(b.workspaceId))

  const historyEntry = workspaceMetadataHistoryEntrySchema.parse({
    historyId: `history-${parsed.workspaceId}-${Date.now()}`,
    workspaceId: parsed.workspaceId,
    changedBy,
    changedAt: new Date().toISOString(),
    summary: buildSummary(previous, nextRecord),
    version:
      document.history.filter((entry) => entry.workspaceId === parsed.workspaceId).length + 1
  })
  document.history = [historyEntry, ...document.history].slice(0, 200)

  await persistDocument(document)
  return {
    workspace: cloneWorkspace(nextRecord),
    historyEntry
  }
}
