import { createAuditLogger, type WorkspaceMember } from '@starlink/shared'

const auditLogger = createAuditLogger('packages/server:workspace-access')

export type WorkspaceMetadataRecord = {
  workspaceId: string
  name: string
  type: string
  focus: string
  ownerId: string
  ownerName: string
  members: WorkspaceMember[]
}

export function getViewerPermissions(userId: string, members: WorkspaceMember[]) {
  const member = members.find((item) => item.id === userId)
  return member?.permissions ?? []
}

export type PermissionAction = 'workspace.read' | 'workspace.write' | 'workspace.publish' | 'workspace.manage'

/**
 * P11.18 · centralized permission check with audit log.
 *
 * Every call emits an audit event tagged either `granted` or `denied`,
 * with userId / workspaceId / requested permission / actual permissions.
 * The denied path also throws FORBIDDEN_WORKSPACE so existing callers
 * keep working without changes.
 *
 * Why we audit grants too (not just denials): a permission breach
 * investigation needs to reconstruct WHO did WHAT when. Just logging
 * denials misses the case where a compromised account uses LEGITIMATE
 * credentials to read 1000 workspaces it technically had access to.
 *
 * `requestId` is an optional correlation token (trace_id / GraphQL
 * request id). When omitted we use a static placeholder so the audit
 * pipeline still has a non-null requestId.
 */
export function requireWorkspacePermission(
  userId: string,
  metadata: WorkspaceMetadataRecord,
  requiredPermission: PermissionAction,
  requestId?: string
) {
  const viewerPermissions = getViewerPermissions(userId, metadata.members)
  const granted = hasPermission(viewerPermissions, requiredPermission)
  // Throttle audit volume in disabled-auth dev mode where every request
  // is anonymous — only audit the denial case in dev.
  const isAnonymous = userId === 'anonymous'
  if (granted) {
    if (!isAnonymous) {
      auditLogger.info({
        action: 'workspace-access.granted',
        userId,
        workflowId: metadata.workspaceId,
        requestId: requestId ?? 'permission-check',
        metadata: { requiredPermission, actualPermissions: viewerPermissions }
      })
    }
    return viewerPermissions
  }
  // Denied — always audit, regardless of mode. This is the canary.
  auditLogger.warn({
    action: 'workspace-access.denied',
    userId,
    workflowId: metadata.workspaceId,
    requestId: requestId ?? 'permission-check',
    metadata: {
      requiredPermission,
      actualPermissions: viewerPermissions,
      ownerId: metadata.ownerId,
      memberCount: metadata.members.length
    }
  })
  throw new Error('FORBIDDEN_WORKSPACE')
}

const permissionClosure: Record<string, string[]> = {
  'workspace.read': ['workspace.read', 'workspace.write', 'workspace.publish', 'workspace.manage'],
  'workspace.write': ['workspace.write', 'workspace.publish', 'workspace.manage'],
  'workspace.publish': ['workspace.publish', 'workspace.manage'],
  'workspace.manage': ['workspace.manage']
}

function hasPermission(permissions: readonly string[], requiredPermission: string) {
  const allowed = permissionClosure[requiredPermission] ?? [requiredPermission]
  return permissions.some((permission) => allowed.includes(permission))
}
