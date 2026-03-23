import { useState, useEffect } from 'react'
import { incrementVisits, getGlobalStats } from '../lib/supabaseGameService'
import { trackEvent } from '../lib/analytics'
import { getSessionStorageItem, setSessionStorageItem } from '../lib/browserStorage'

export interface GlobalStats {
  gamesPlayed: number
  totalVisits: number
  lastGameAt: number | null
  gamesFinished: number
  totalPlayers: number
  uniquePlayers: number
}

const INITIAL: GlobalStats = { gamesPlayed: 0, totalVisits: 0, lastGameAt: null, gamesFinished: 0, totalPlayers: 0, uniquePlayers: 0 }

/**
 * Fetch global game statistics from Supabase (single read, no live listener).
 * Stats are universal (cross-device) via a single shared row.
 *
 * Uses a one-time RPC call — stats rarely change mid-session.
 */
export function useGlobalStats() {
  const [stats, setStats] = useState<GlobalStats>(INITIAL)
  const [loading, setLoading] = useState(true)

  // Increment total visits + track page view once per session
  const [visitCounted] = useState(() => {
    // Use a session flag so we only count once per tab/session
    if (getSessionStorageItem('lucky7_visit_counted')) return false
    setSessionStorageItem('lucky7_visit_counted', '1')
    return true
  })

  useEffect(() => {
    if (!visitCounted) return
    incrementVisits()
    trackEvent('page_view')
  }, [visitCounted])

  // Single read instead of live listener — stats rarely change mid-session
  useEffect(() => {
    getGlobalStats()
      .then((data) => setStats(data))
      .catch(() => {
        // Failed — that's fine, keep defaults
      })
      .finally(() => setLoading(false))
  }, [])

  return { stats, loading }
}
