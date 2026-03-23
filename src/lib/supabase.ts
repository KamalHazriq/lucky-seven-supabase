import { createClient } from '@supabase/supabase-js'
import type { Database } from './supabaseDatabase.generated'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. ' +
    'Copy .env.example to .env and fill in your Supabase project values.'
  )
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey)

let pendingEnsureAuth: Promise<string> | null = null

/**
 * Ensure the current browser session has an authenticated user.
 * If a session already exists (localStorage), it is reused.
 * Otherwise, an anonymous sign-in is created.
 *
 * Returns the user's UUID (same as auth.uid() in Postgres RLS).
 */
export async function ensureAuth(): Promise<string> {
  // Check for existing session first (no network round-trip)
  const { data: { session } } = await supabase.auth.getSession()
  if (session?.user) return session.user.id

  if (pendingEnsureAuth) return pendingEnsureAuth

  // No session — create anonymous user
  pendingEnsureAuth = supabase.auth
    .signInAnonymously()
    .then(({ data, error }) => {
      if (error || !data.user) throw error ?? new Error('Anonymous sign-in returned no user')
      return data.user.id
    })
    .finally(() => {
      pendingEnsureAuth = null
    })

  return pendingEnsureAuth
}
