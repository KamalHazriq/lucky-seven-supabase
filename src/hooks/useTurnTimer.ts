import { useState, useEffect, useRef, useCallback } from 'react'
import { skipTurn } from '../lib/supabaseGameService'
import type { GameDoc } from '../lib/types'

/** Grace buffer (seconds) added to the timer before auto-skip fires.
 *  Accounts for client clock skew — `turnStartAt` is set by the acting
 *  client's `Date.now()`, so a receiver whose clock is ahead sees a
 *  shorter timer. 3s covers typical drift between mobile devices.       */
const SKIP_GRACE_SECONDS = 3

interface TurnTimerState {
  /** Seconds remaining (null if timer disabled or no active turn) */
  remaining: number | null
  /** Total seconds configured for the timer */
  total: number
  /** Whether this client is responsible for triggering auto-skip */
  isExpired: boolean
}

/**
 * Hook that tracks the turn timer countdown.
 * All clients run the timer independently; only the first client to call
 * skipTurn succeeds thanks to the actionVersion guard.
 */
export function useTurnTimer(
  game: GameDoc | null | undefined,
  gameId: string | undefined,
): TurnTimerState {
  const [remaining, setRemaining] = useState<number | null>(null)
  const skipFiredRef = useRef(false)

  const turnSeconds = game?.settings?.turnSeconds ?? 0
  const turnStartAt = game?.turnStartAt ?? 0
  const currentTurnPlayerId = game?.currentTurnPlayerId ?? null
  const actionVersion = game?.actionVersion ?? 0
  const isActive = game?.status === 'active' || game?.status === 'ending'
  const voteKickActive = game?.voteKick?.active ?? false
  const getRemainingNow = useCallback(() => {
    if (turnSeconds === 0 || !currentTurnPlayerId || !isActive || !turnStartAt) {
      return null
    }
    const elapsed = (Date.now() - turnStartAt) / 1000
    const left = Math.min(turnSeconds, Math.max(0, turnSeconds - elapsed))
    return Math.ceil(left)
  }, [turnSeconds, currentTurnPlayerId, isActive, turnStartAt])

  const resetRemainingForTurn = useCallback(() => {
    setRemaining(getRemainingNow())
  }, [getRemainingNow])

  // Reset skip-fired flag only on actual turn change (new player or new timer start)
  useEffect(() => {
    skipFiredRef.current = false
    resetRemainingForTurn()
  }, [currentTurnPlayerId, turnStartAt, resetRemainingForTurn])

  // Main countdown interval
  useEffect(() => {
    if (getRemainingNow() === null) {
      resetRemainingForTurn()
      return
    }

    // ─── Critical: immediately set remaining to a positive value ───
    // This prevents stale `remaining = 0` from a previous turn from
    // triggering the expiry effect before this interval has a chance to tick.
    resetRemainingForTurn()

    const tick = () => {
      // Freeze display during vote kick — timer resumes when vote resolves
      if (voteKickActive) return
      setRemaining(getRemainingNow())
    }

    // First tick after a short delay so React has time to process the
    // immediate `setRemaining(turnSeconds)` above — avoids a 0→full→actual flash
    const firstTickId = setTimeout(tick, 60)
    const id = setInterval(tick, 250) // update 4x/sec for smooth UI
    return () => {
      clearTimeout(firstTickId)
      clearInterval(id)
    }
  }, [getRemainingNow, resetRemainingForTurn, voteKickActive])

  // Auto-skip trigger when timer expires
  const handleExpiry = useCallback(async () => {
    if (!gameId || skipFiredRef.current) return
    // Don't auto-skip during an active vote kick
    if (voteKickActive) return
    // Elapsed guard with grace buffer:
    // Only skip if *real* elapsed time exceeds the full turn duration.
    // The grace buffer absorbs client clock-skew (turnStartAt is set by the
    // acting client's Date.now(), not a server timestamp).
    const elapsed = turnStartAt ? (Date.now() - turnStartAt) / 1000 : 0
    if (elapsed < turnSeconds + SKIP_GRACE_SECONDS) return
    skipFiredRef.current = true
    try {
      await skipTurn(gameId, actionVersion)
    } catch {
      // Expected: another client may have already skipped first.
    }
  }, [gameId, actionVersion, turnStartAt, turnSeconds, voteKickActive])

  useEffect(() => {
    if (remaining !== null && remaining <= 0 && turnSeconds > 0 && isActive && currentTurnPlayerId && !voteKickActive) {
      handleExpiry()
    }
  }, [remaining, turnSeconds, isActive, currentTurnPlayerId, voteKickActive, handleExpiry])

  return {
    remaining,
    total: turnSeconds,
    isExpired: remaining !== null && remaining <= 0,
  }
}
