import { useState, useCallback, useRef } from 'react'
import { fetchHistoryPage } from '../lib/supabaseGameService'
import type { LogEntry } from '../lib/types'

export interface GameHistoryState {
  entries: LogEntry[]
  loading: boolean
  error: string | null
  hasMore: boolean
  load: (reset?: boolean) => Promise<void>
  reset: () => void
  retry: () => Promise<void>
}

export function useGameHistory(gameId: string | undefined): GameHistoryState {
  const [entries, setEntries] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(true)

  const offsetRef = useRef(0)
  const loadingRef = useRef(false)

  const load = useCallback(async (resetFlag = false) => {
    if (!gameId || loadingRef.current) return
    loadingRef.current = true
    setLoading(true)
    setError(null)
    try {
      const offset = resetFlag ? 0 : offsetRef.current
      const { entries: newEntries, hasMore: more } = await fetchHistoryPage(gameId, offset)
      offsetRef.current = offset + newEntries.length
      setEntries((prev) => (resetFlag ? newEntries : [...prev, ...newEntries]))
      setHasMore(more)
    } catch (e) {
      setError((e as Error).message || 'Failed to load game history.')
    } finally {
      loadingRef.current = false
      setLoading(false)
    }
  }, [gameId])

  const reset = useCallback(() => {
    setEntries([])
    offsetRef.current = 0
    setHasMore(true)
    setError(null)
  }, [])

  const retry = useCallback(async () => {
    await load(entries.length === 0)
  }, [entries.length, load])

  return { entries, loading, error, hasMore, load, reset, retry }
}
