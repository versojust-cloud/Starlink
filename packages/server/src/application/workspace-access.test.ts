/**
 * P11.18 · workspace-access permission audit tests.
 *
 * Verifies:
 *   - granted permission returns viewer's permission list
 *   - denied permission throws FORBIDDEN_WORKSPACE
 *   - permission-closure (manage > publish > write > read)
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { requireWorkspacePermission, getViewerPermissions, type WorkspaceMetadataRecord } from './workspace-access.js'

function buildMetadata(overrides: Partial<WorkspaceMetadataRecord> = {}): WorkspaceMetadataRecord {
  return {
    workspaceId: 'ws-test',
    name: 'Test',
    type: 'project',
    focus: 'test',
    ownerId: 'owner-1',
    ownerName: 'Owner',
    members: [
      { id: 'owner-1', name: 'Owner', role: 'owner', permissions: ['workspace.manage'] },
      { id: 'editor-1', name: 'Editor', role: 'editor', permissions: ['workspace.write'] },
      { id: 'reader-1', name: 'Reader', role: 'viewer', permissions: ['workspace.read'] }
    ],
    ...overrides
  }
}

test('requireWorkspacePermission: owner with manage permission can read', () => {
  const meta = buildMetadata()
  const perms = requireWorkspacePermission('owner-1', meta, 'workspace.read')
  assert.deepEqual(perms, ['workspace.manage'])
})

test('requireWorkspacePermission: owner with manage permission can publish (closure)', () => {
  const meta = buildMetadata()
  const perms = requireWorkspacePermission('owner-1', meta, 'workspace.publish')
  assert.deepEqual(perms, ['workspace.manage'])
})

test('requireWorkspacePermission: editor (write) can read but not publish', () => {
  const meta = buildMetadata()
  // write -> read OK
  assert.doesNotThrow(() => requireWorkspacePermission('editor-1', meta, 'workspace.read'))
  // write -> publish DENIED
  assert.throws(
    () => requireWorkspacePermission('editor-1', meta, 'workspace.publish'),
    /FORBIDDEN_WORKSPACE/
  )
})

test('requireWorkspacePermission: reader cannot write', () => {
  const meta = buildMetadata()
  assert.throws(
    () => requireWorkspacePermission('reader-1', meta, 'workspace.write'),
    /FORBIDDEN_WORKSPACE/
  )
})

test('requireWorkspacePermission: non-member is denied', () => {
  const meta = buildMetadata()
  assert.throws(
    () => requireWorkspacePermission('non-member', meta, 'workspace.read'),
    /FORBIDDEN_WORKSPACE/
  )
})

test('requireWorkspacePermission: requestId is accepted (for audit correlation)', () => {
  const meta = buildMetadata()
  // Smoke test — passing requestId should not change behaviour, only audit metadata.
  const perms = requireWorkspacePermission('owner-1', meta, 'workspace.manage', 'trace-123')
  assert.deepEqual(perms, ['workspace.manage'])
})

test('getViewerPermissions: returns empty array for non-member', () => {
  const meta = buildMetadata()
  assert.deepEqual(getViewerPermissions('ghost', meta.members), [])
})

test('getViewerPermissions: returns member permissions for member', () => {
  const meta = buildMetadata()
  assert.deepEqual(getViewerPermissions('editor-1', meta.members), ['workspace.write'])
})
