'use client'

import type { AssetEntity } from './types'

const PRACTICE_ACTIVE_WORKSPACE_KEY = 'practice-active-workspace'
const COMMUNITY_POSTS_KEY = 'community-posts-v1'
const ASSET_FEED_EVENT = 'starlink:asset-feed-changed'

type StoredPracticeSession = {
  messages: Array<{ id: string; role: string; content: string; timestamp: number; feedback?: string }>
  insights: Array<{ title: string; detail: string }>
  resources: Array<{ title: string; url?: string }>
  quickReplies: string[]
  lastUpdated: number
}

export type CommunityPostRecord = {
  id: string
  workspaceId: string
  title: string
  body: string
  tags: string[]
  authorName: string
  authorRole?: string
  createdAt: string
}

function emitAssetFeedChanged() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(ASSET_FEED_EVENT))
}

export function getAssetFeedEventName() {
  return ASSET_FEED_EVENT
}

export function notifyAssetFeedChanged() {
  emitAssetFeedChanged()
}

export function getPracticeActiveWorkspaceId() {
  if (typeof window === 'undefined') return 'proj-001'
  return window.localStorage.getItem(PRACTICE_ACTIVE_WORKSPACE_KEY) ?? 'proj-001'
}

export function setPracticeActiveWorkspaceId(workspaceId: string) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(PRACTICE_ACTIVE_WORKSPACE_KEY, workspaceId)
  emitAssetFeedChanged()
}

export function readCommunityPosts() {
  if (typeof window === 'undefined') return [] as CommunityPostRecord[]

  try {
    const payload = window.localStorage.getItem(COMMUNITY_POSTS_KEY)
    if (!payload) return []
    return JSON.parse(payload) as CommunityPostRecord[]
  } catch {
    return []
  }
}

export function saveCommunityPost(post: CommunityPostRecord) {
  if (typeof window === 'undefined') return
  const next = [post, ...readCommunityPosts()].slice(0, 50)
  window.localStorage.setItem(COMMUNITY_POSTS_KEY, JSON.stringify(next))
  emitAssetFeedChanged()
}

export function readCommunityAssets(workspaceId: string): AssetEntity[] {
  return readCommunityPosts()
    .filter((post) => post.workspaceId === workspaceId)
    .map((post, index) => ({
      assetId: `community:${post.id}`,
      workspaceId,
      assetType: 'community-post',
      title: post.title,
      sourceModule: 'community',
      sourceTaskId: null,
      metadata: {
        tags: post.tags,
        authorName: post.authorName,
        authorRole: post.authorRole
      },
      content: post,
      version: index + 1,
      status: 'published',
      createdBy: post.authorName,
      createdAt: post.createdAt,
      updatedAt: post.createdAt
    }))
}

export function readPracticeAssets(workspaceId: string): AssetEntity[] {
  if (typeof window === 'undefined') return []

  const assets: AssetEntity[] = []

  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index)
    if (!key?.startsWith('practice-session-')) continue

    const payload = window.localStorage.getItem(key)
    if (!payload) continue

    try {
      const session = JSON.parse(payload) as StoredPracticeSession
      const parts = key.split('-')
      const sessionWorkspaceId = parts.length >= 4 ? parts[2] : getPracticeActiveWorkspaceId()
      const scenarioId = parts.length >= 4 ? parts.slice(3).join('-') : key.replace('practice-session-', '')
      if (sessionWorkspaceId !== workspaceId) continue

      assets.push({
        assetId: `practice:${workspaceId}:${scenarioId}`,
        workspaceId,
        assetType: 'practice-output',
        title: `Practice Session · ${scenarioId}`,
        sourceModule: 'practice',
        sourceTaskId: null,
        metadata: {
          messageCount: session.messages.length,
          insightCount: session.insights.length,
          resourceCount: session.resources.length
        },
        content: {
          scenarioId,
          ...session
        },
        version: session.messages.length,
        status: session.messages.length > 1 ? 'ready' : 'draft',
        createdBy: 'practice-user',
        createdAt: new Date(session.lastUpdated).toISOString(),
        updatedAt: new Date(session.lastUpdated).toISOString()
      })
    } catch {
      continue
    }
  }

  return assets.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}
