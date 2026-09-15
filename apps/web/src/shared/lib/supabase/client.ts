'use client'

import { createBrowserClient } from '@supabase/ssr/dist/module/createBrowserClient'
import { getSupabaseBrowserEnv } from './env'

export function createSupabaseBrowserClient() {
  const { url, publishableKey } = getSupabaseBrowserEnv()
  return createBrowserClient(url, publishableKey)
}
