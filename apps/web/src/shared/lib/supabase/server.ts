import { createServerClient } from '@supabase/ssr/dist/module/createServerClient'
import type { SetAllCookies } from '@supabase/ssr/dist/module/types'
import { cookies } from 'next/headers'
import { getSupabaseBrowserEnv } from './env'

export function createSupabaseServerClient() {
  const { url, publishableKey } = getSupabaseBrowserEnv()
  const cookieStore = cookies()
  const setAllCookies: SetAllCookies = (cookiesToSet) => {
    try {
      cookiesToSet.forEach(({ name, value, options }) => {
        cookieStore.set(name, value, options)
      })
    } catch {
      // Server Components cannot write cookies. Middleware refreshes sessions.
    }
  }

  return createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll: setAllCookies
    }
  })
}
