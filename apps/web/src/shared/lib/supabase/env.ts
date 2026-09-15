const SUPABASE_URL_KEY = 'NEXT_PUBLIC_SUPABASE_URL'
const SUPABASE_PUBLISHABLE_KEY = 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'

export function getSupabaseBrowserEnv() {
  const url = process.env[SUPABASE_URL_KEY]
  const publishableKey = process.env[SUPABASE_PUBLISHABLE_KEY]

  if (!url || !publishableKey) {
    throw new Error(`Missing Supabase env vars: ${SUPABASE_URL_KEY} and ${SUPABASE_PUBLISHABLE_KEY}`)
  }

  return { url, publishableKey }
}
