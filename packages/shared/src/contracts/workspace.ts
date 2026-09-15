import { z } from 'zod'

const isoDateTimeString = z.string().datetime()

export const workspacePermissionSchema = z.enum([
  'workspace.read',
  'workspace.write',
  'workspace.publish',
  'workspace.manage',
  'workspace.share'
])

export const workspaceMemberSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  role: z.string().min(1).optional(),
  permissions: z.array(workspacePermissionSchema.or(z.string().min(1)))
})

export const workspaceDirectoryItemSchema = z.object({
  workspaceId: z.string().min(1),
  name: z.string().min(1),
  type: z.string().min(1),
  focus: z.string().min(1),
  ownerId: z.string().min(1),
  ownerName: z.string().min(1),
  members: z.array(workspaceMemberSchema),
  viewerPermissions: z.array(workspacePermissionSchema.or(z.string().min(1))).default([]),
  canManage: z.boolean().default(false),
  status: z.enum(['draft', 'active', 'archived', 'provisioning', 'error']),
  updatedAt: isoDateTimeString
})

export const workspaceDirectoryResponseSchema = z.object({
  workspaces: z.array(workspaceDirectoryItemSchema)
})

export const workspaceMetadataUpdateInputSchema = z.object({
  workspaceId: z.string().min(1),
  name: z.string().min(1),
  type: z.string().min(1),
  focus: z.string().min(1),
  ownerId: z.string().min(1),
  ownerName: z.string().min(1),
  members: z.array(workspaceMemberSchema).min(1)
})

export const workspaceMetadataHistoryEntrySchema = z.object({
  historyId: z.string().min(1),
  workspaceId: z.string().min(1),
  changedBy: z.string().min(1),
  changedAt: isoDateTimeString,
  summary: z.string().min(1),
  version: z.number().int().nonnegative()
})

const permissionClosure: Record<string, string[]> = {
  'workspace.read': ['workspace.read', 'workspace.write', 'workspace.publish', 'workspace.manage'],
  'workspace.write': ['workspace.write', 'workspace.publish', 'workspace.manage'],
  'workspace.publish': ['workspace.publish', 'workspace.manage'],
  'workspace.manage': ['workspace.manage'],
  'workspace.share': ['workspace.share', 'workspace.manage']
}

export function hasWorkspacePermission(
  permissions: readonly string[],
  requiredPermission: z.infer<typeof workspacePermissionSchema>
) {
  const allowed = permissionClosure[requiredPermission] ?? [requiredPermission]
  return permissions.some((permission) => allowed.includes(permission))
}

export type WorkspaceDirectoryItem = z.infer<typeof workspaceDirectoryItemSchema>
export type WorkspaceMember = z.infer<typeof workspaceMemberSchema>
export type WorkspaceMetadataUpdateInput = z.infer<typeof workspaceMetadataUpdateInputSchema>
export type WorkspaceMetadataHistoryEntry = z.infer<typeof workspaceMetadataHistoryEntrySchema>
