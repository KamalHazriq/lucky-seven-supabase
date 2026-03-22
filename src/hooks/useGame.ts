import { useReducer, useEffect, useRef, useCallback } from 'react'
import type { GameDoc, PlayerDoc, PrivatePlayerDoc } from '../lib/types'
import { supabase, ensureAuth } from '../lib/supabase'
import { mapGameRow, mapPlayerRow, mapPrivateStateRow } from '../lib/supabaseMappers'
import type { TableRow } from '../lib/supabaseDatabase.generated'

type ConnectionState = 'connecting' | 'connected' | 'degraded' | 'error'

type GameState = {
  game: GameDoc | null
  players: Record<string, PlayerDoc>
  privateState: PrivatePlayerDoc | null
  loading: boolean
  error: string | null
  connectionState: ConnectionState
}

type GameAction =
  | { type: 'clearAll' }
  | { type: 'beginLoad' }
  | { type: 'setGame'; game: GameDoc }
  | { type: 'replacePlayers'; players: Record<string, PlayerDoc> }
  | { type: 'upsertPlayer'; playerId: string; player: PlayerDoc }
  | { type: 'removePlayer'; playerId: string }
  | { type: 'setPrivateState'; privateState: PrivatePlayerDoc | null }
  | { type: 'markConnected' }
  | { type: 'setRealtimeIssue'; connectionState: ConnectionState; error: string }
  | { type: 'markClosed' }
  | { type: 'loadFailed'; error: string }
  | { type: 'finishLoading' }

const initialState: GameState = {
  game: null,
  players: {},
  privateState: null,
  loading: true,
  error: null,
  connectionState: 'connecting',
}

function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'clearAll':
      return { ...initialState, loading: false }
    case 'beginLoad':
      return {
        ...initialState,
        loading: true,
      }
    case 'setGame':
      return { ...state, game: action.game }
    case 'replacePlayers':
      return { ...state, players: action.players }
    case 'upsertPlayer':
      return {
        ...state,
        players: { ...state.players, [action.playerId]: action.player },
      }
    case 'removePlayer': {
      if (!(action.playerId in state.players)) return state
      const nextPlayers = { ...state.players }
      delete nextPlayers[action.playerId]
      return { ...state, players: nextPlayers }
    }
    case 'setPrivateState':
      return { ...state, privateState: action.privateState }
    case 'markConnected':
      return {
        ...state,
        connectionState: 'connected',
        error: state.error?.startsWith('Realtime') ? null : state.error,
      }
    case 'setRealtimeIssue':
      return {
        ...state,
        connectionState: action.connectionState,
        error: action.error,
      }
    case 'markClosed':
      return {
        ...state,
        connectionState: state.connectionState === 'connected' ? 'degraded' : state.connectionState,
      }
    case 'loadFailed':
      return {
        ...state,
        loading: false,
        error: action.error,
        connectionState: 'error',
      }
    case 'finishLoading':
      return { ...state, loading: false }
  }
}

/** Shallow-compare two PlayerDoc objects. Returns true if they differ. */
function playerChanged(prev: PlayerDoc, next: PlayerDoc): boolean {
  const prevKeys = Object.keys(prev)
  const nextKeys = Object.keys(next)
  if (prevKeys.length !== nextKeys.length) return true
  for (const k of prevKeys) {
    const pv = (prev as unknown as Record<string, unknown>)[k]
    const nv = (next as unknown as Record<string, unknown>)[k]
    if (pv === nv) continue // primitive match — fast path
    if (JSON.stringify(pv) !== JSON.stringify(nv)) return true
  }
  return false
}

export function useGame(gameId: string | undefined, playerId: string | undefined) {
  const [state, dispatch] = useReducer(gameReducer, initialState)
  const [retryToken, setRetryToken] = useReducer((current: number) => current + 1, 0)
  const playersCacheRef = useRef<Record<string, PlayerDoc>>({})
  const retry = useCallback(() => {
    setRetryToken()
  }, [])

  // ─── Game + Players subscription ─────────────────────────────
  useEffect(() => {
    if (!gameId) {
      playersCacheRef.current = {}
      dispatch({ type: 'clearAll' })
      return
    }
    playersCacheRef.current = {}
    dispatch({ type: 'beginLoad' })
    let cancelled = false

    // Create channel and register handlers synchronously
    const channel = supabase
      .channel(`game:${gameId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'games', filter: `id=eq.${gameId}` },
        (payload) => {
          if (cancelled) return
          if (payload.eventType === 'UPDATE' || payload.eventType === 'INSERT') {
            dispatch({ type: 'setGame', game: mapGameRow(payload.new as TableRow<'games'>) })
          }
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'game_players', filter: `game_id=eq.${gameId}` },
        (payload) => {
          if (cancelled) return
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const row = payload.new as TableRow<'game_players'>
            const pid = row.player_id
            const mapped = mapPlayerRow(row)
            const cache = playersCacheRef.current
            if (cache[pid] && !playerChanged(cache[pid], mapped)) return
            playersCacheRef.current = { ...cache, [pid]: mapped }
            dispatch({ type: 'upsertPlayer', playerId: pid, player: mapped })
          } else if (payload.eventType === 'DELETE') {
            const pid = payload.old?.player_id as string | undefined
            if (!pid) return
            const next = { ...playersCacheRef.current }
            delete next[pid]
            playersCacheRef.current = next
            dispatch({ type: 'removePlayer', playerId: pid })
          }
        },
      )

    const handleRealtimeStatus = (status: string) => {
      if (cancelled) return

      switch (status) {
        case 'SUBSCRIBED':
          dispatch({ type: 'markConnected' })
          break
        case 'TIMED_OUT':
          dispatch({
            type: 'setRealtimeIssue',
            connectionState: 'degraded',
            error: 'Realtime connection timed out. Live updates may be delayed.',
          })
          break
        case 'CHANNEL_ERROR':
          dispatch({
            type: 'setRealtimeIssue',
            connectionState: 'error',
            error: 'Realtime connection failed. Try reconnecting to the lobby.',
          })
          break
        case 'CLOSED':
          dispatch({ type: 'markClosed' })
          break
      }
    }

    // Auth → subscribe → fetch (ensures JWT is ready for RLS)
    ensureAuth()
      .then(async () => {
        if (cancelled) return

        channel.subscribe(handleRealtimeStatus)

        const gameRes = await supabase.from('games').select('*').eq('id', gameId).single()
        const playersRes = await supabase.from('game_players').select('*').eq('game_id', gameId)

        if (cancelled) return

        if (gameRes.error) throw gameRes.error
        if (playersRes.error) throw playersRes.error

        const gameRow = gameRes.data as TableRow<'games'> | null
        const playerRows = (playersRes.data ?? []) as TableRow<'game_players'>[]

        if (gameRow) dispatch({ type: 'setGame', game: mapGameRow(gameRow) })
        const mapped: Record<string, PlayerDoc> = {}
        for (const row of playerRows) {
          mapped[row.player_id] = mapPlayerRow(row)
        }
        playersCacheRef.current = mapped
        dispatch({ type: 'replacePlayers', players: mapped })
      })
      .catch((err) => {
        if (cancelled) return
        dispatch({
          type: 'loadFailed',
          error: (err as Error).message || 'Failed to load game state.',
        })
      })
      .finally(() => {
        if (!cancelled) dispatch({ type: 'finishLoading' })
      })

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [gameId, retryToken])

  // ─── Private state subscription ──────────────────────────────
  useEffect(() => {
    if (!gameId || !playerId) {
      dispatch({ type: 'setPrivateState', privateState: null })
      return
    }
    let cancelled = false

    dispatch({ type: 'setPrivateState', privateState: null })

    const channel = supabase
      .channel(`game-private:${gameId}:${playerId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'game_private_state', filter: `game_id=eq.${gameId}` },
        (payload) => {
          if (cancelled) return
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const row = payload.new as TableRow<'game_private_state'>
            // RLS already filters to own row, but double-check
            if (row.player_id === playerId) {
              dispatch({ type: 'setPrivateState', privateState: mapPrivateStateRow(row) })
            }
          } else if (payload.eventType === 'DELETE') {
            const oldRow = payload.old as TableRow<'game_private_state'> | null
            if (oldRow?.player_id === playerId) {
              dispatch({ type: 'setPrivateState', privateState: null })
            }
          }
        },
      )

    ensureAuth()
      .then(async () => {
        if (cancelled) return

        channel.subscribe((status) => {
          if (cancelled) return
          if (status === 'CHANNEL_ERROR') {
            dispatch({
              type: 'setRealtimeIssue',
              connectionState: 'error',
              error: 'Realtime private-state sync failed. Try reconnecting to continue safely.',
            })
          }
        })

        const { data, error: privateError } = await supabase
          .from('game_private_state')
          .select('*')
          .eq('game_id', gameId)
          .eq('player_id', playerId)
          .maybeSingle()

        if (cancelled) return
        if (privateError) throw privateError
        const privateRow = data as TableRow<'game_private_state'> | null
        if (privateRow) {
          dispatch({ type: 'setPrivateState', privateState: mapPrivateStateRow(privateRow) })
        }
      })
      .catch((err) => {
        if (cancelled) return
        dispatch({
          type: 'loadFailed',
          error: (err as Error).message || 'Failed to load your private game state.',
        })
      })

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [gameId, playerId, retryToken])

  return {
    game: state.game,
    players: state.players,
    privateState: state.privateState,
    loading: state.loading,
    error: state.error,
    connectionState: state.connectionState,
    retry,
  }
}
