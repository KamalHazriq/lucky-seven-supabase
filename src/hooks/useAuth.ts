import { useState, useEffect } from 'react'
import { supabase, ensureAuth } from '../lib/supabase'
import { logClientError } from '../lib/errorLogger'

/** Lightweight user shape compatible with existing components (user.uid). */
interface AuthUser {
  uid: string
}

/**
 * Auth hook — backed by Supabase anonymous auth (Phase 4).
 * Returns the same { user: { uid }, loading } shape that all
 * existing pages and hooks expect, so zero import changes needed.
 */
export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ? { uid: session.user.id } : null)
        setLoading(false)
      },
    )

    // Trigger anonymous sign-in if no session exists
    ensureAuth().catch((error) => {
      logClientError(error, 'useAuth.ensureAuth')
    })

    return () => subscription.unsubscribe()
  }, [])

  return { user, loading }
}
