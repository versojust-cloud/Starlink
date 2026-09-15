/**
 * Per-workspace conversation persistence — localStorage-backed.
 *
 * Bucket key:  starlink_conversations_<workspaceId>
 * Value shape: { conversations: ConversationSnapshot[], activeId: string }
 *
 * Each snapshot owns its own chat history; switching conversation swaps
 * the comfy-store's chatMessages, the active conversation receives all
 * subsequent appendChatMessage writes.
 *
 * When backend GraphQL `startConversation` succeeds, the server-issued
 * conversationId can replace the local one via `replaceConversationId`.
 * Until backend is up, the local UUIDs are authoritative.
 */

export type StoredChatMessage = {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

export type ConversationSnapshot = {
  id: string
  title: string
  messages: StoredChatMessage[]
  createdAt: string  // ISO
  updatedAt: string  // ISO
}

export type ConversationBucket = {
  conversations: ConversationSnapshot[]
  activeId: string
}

const bucketKey = (workspaceId: string) => `starlink_conversations_${workspaceId}`

const isStorageAvailable = (): boolean => {
  if (typeof window === 'undefined') return false
  try {
    const probe = '__starlink_probe__'
    window.localStorage.setItem(probe, probe)
    window.localStorage.removeItem(probe)
    return true
  } catch {
    return false
  }
}

const newId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `conv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

const nowIso = (): string => new Date().toISOString()

const defaultGreeting = (): StoredChatMessage => ({
  role: 'assistant',
  content: '你好！我是你的 AI 商业顾问。描述你的想法，让我们一起将它可视化。',
  timestamp: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
})

export function createConversation(title = '未命名会话'): ConversationSnapshot {
  const stamp = nowIso()
  return {
    id: newId(),
    title,
    messages: [defaultGreeting()],
    createdAt: stamp,
    updatedAt: stamp,
  }
}

export function loadBucket(workspaceId: string): ConversationBucket {
  if (!isStorageAvailable()) {
    const seed = createConversation('当前会话')
    return { conversations: [seed], activeId: seed.id }
  }
  try {
    const raw = window.localStorage.getItem(bucketKey(workspaceId))
    if (!raw) {
      const seed = createConversation('当前会话')
      const bucket: ConversationBucket = { conversations: [seed], activeId: seed.id }
      saveBucket(workspaceId, bucket)
      return bucket
    }
    const parsed = JSON.parse(raw) as Partial<ConversationBucket>
    const list = Array.isArray(parsed.conversations) ? parsed.conversations : []
    if (list.length === 0) {
      const seed = createConversation('当前会话')
      const bucket: ConversationBucket = { conversations: [seed], activeId: seed.id }
      saveBucket(workspaceId, bucket)
      return bucket
    }
    const activeId = typeof parsed.activeId === 'string' && list.some((c) => c.id === parsed.activeId)
      ? parsed.activeId
      : list[0].id
    return { conversations: list, activeId }
  } catch {
    const seed = createConversation('当前会话')
    return { conversations: [seed], activeId: seed.id }
  }
}

export function saveBucket(workspaceId: string, bucket: ConversationBucket): void {
  if (!isStorageAvailable()) return
  try {
    window.localStorage.setItem(bucketKey(workspaceId), JSON.stringify(bucket))
  } catch {
    // quota / serialize error — silent, in-memory state still consistent
  }
}

export function deriveTitleFromMessages(messages: StoredChatMessage[]): string {
  const firstUser = messages.find((m) => m.role === 'user')
  if (!firstUser) return '未命名会话'
  const text = firstUser.content.trim().replace(/\s+/g, ' ')
  return text.length > 24 ? `${text.slice(0, 22)}…` : text
}
