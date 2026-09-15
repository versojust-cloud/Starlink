'use client'

const VIEWER_ID_KEY = 'starlink-user-id'
const VIEWER_EVENT = 'starlink:viewer-id-changed'

export function getCurrentViewerId() {
  if (typeof window === 'undefined') {
    return process.env.NEXT_PUBLIC_DEFAULT_USER_ID ?? 'lead-alex'
  }

  return window.localStorage.getItem(VIEWER_ID_KEY) ?? process.env.NEXT_PUBLIC_DEFAULT_USER_ID ?? 'lead-alex'
}

export function setCurrentViewerId(userId: string) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(VIEWER_ID_KEY, userId)
  window.dispatchEvent(new CustomEvent(VIEWER_EVENT, { detail: { userId } }))
}

export function getViewerIdentityEventName() {
  return VIEWER_EVENT
}
