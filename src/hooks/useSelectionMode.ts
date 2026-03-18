import { useState, useCallback, useEffect } from 'react'
import type { PlayerDoc } from '../lib/types'

// ─── Target types ──────────────────────────────────────────
export type SelectionTargetType =
  | 'yourSlot'        // One of your own slots (peek, self-swap)
  | 'anyPlayerSlot'   // Any player's unlocked slot (queen swap)
  | 'anyLockedSlot'   // Any locked slot across all players (unlock)
  | 'anyUnlockedSlot' // Any unlocked slot across all players (lock)
  | 'anyPlayer'       // Pick a player (chaos/rearrange)

export type SelectionPhase = 'idle' | 'choosingTarget' | 'choosingSecondTarget' | 'confirming'

export interface SelectionConstraint {
  targetType: SelectionTargetType
  /** Label shown in ActionBar during selection e.g. "Pick a card to peek" */
  prompt: string
  /** For two-pick flows (queen swap), the second target type and prompt */
  secondTargetType?: SelectionTargetType
  secondPrompt?: string
}

export interface SelectedTarget {
  playerId: string
  slotIndex: number
}

export interface SelectionModeState {
  phase: SelectionPhase
  constraint: SelectionConstraint | null
  firstTarget: SelectedTarget | null
  secondTarget: SelectedTarget | null
}

const IDLE_STATE: SelectionModeState = {
  phase: 'idle',
  constraint: null,
  firstTarget: null,
  secondTarget: null,
}

/**
 * Returns whether a given slot is selectable under the current constraint.
 *
 * @param firstTarget - Optional first-pick target already chosen (used to block same-player swap).
 */
export function isSlotSelectable(
  targetType: SelectionTargetType,
  playerId: string,
  slotIndex: number,
  localPlayerId: string,
  players: Record<string, PlayerDoc>,
  firstTarget?: SelectedTarget | null,
): boolean {
  const pd = players[playerId]
  if (!pd) return false
  const locks = pd.locks ?? [false, false, false]

  switch (targetType) {
    case 'yourSlot':
      return playerId === localPlayerId && !locks[slotIndex]
    case 'anyPlayerSlot':
      // When picking the second card for a swap, block slots from the same player as the first pick
      if (firstTarget && firstTarget.playerId === playerId) return false
      return !locks[slotIndex]
    case 'anyLockedSlot':
      return locks[slotIndex]
    case 'anyUnlockedSlot':
      return !locks[slotIndex]
    case 'anyPlayer':
      // Any slot of any other player (handled at player level, not slot)
      return playerId !== localPlayerId
    default:
      return false
  }
}

/**
 * Returns whether a player has any selectable target under the current constraint.
 */
export function isPlayerSelectable(
  targetType: SelectionTargetType,
  playerId: string,
  localPlayerId: string,
  players: Record<string, PlayerDoc>,
): boolean {
  if (targetType === 'anyPlayer') {
    return playerId !== localPlayerId
  }
  // Check if at least one slot is selectable
  return [0, 1, 2].some((i) =>
    isSlotSelectable(targetType, playerId, i, localPlayerId, players),
  )
}

/**
 * useSelectionMode — a reusable hook for inline (actionbar) power target picking.
 *
 * Lifecycle:
 *   idle → startSelection(constraint) → choosingTarget → selectTarget(first)
 *     → (single-target) confirming → confirm() → idle
 *     → (two-target, e.g. queen swap) choosingSecondTarget → selectTarget(second) → confirming → confirm() → idle
 *   At any point: cancel() → idle
 *
 * The parent (Game.tsx) wires the confirm callback to the actual RPC action.
 */
export function useSelectionMode() {
  const [state, setState] = useState<SelectionModeState>(IDLE_STATE)

  /** Start a new selection flow */
  const startSelection = useCallback((constraint: SelectionConstraint) => {
    setState({
      phase: 'choosingTarget',
      constraint,
      firstTarget: null,
      secondTarget: null,
    })
  }, [])

  /** Select a target (first or second depending on phase) */
  const selectTarget = useCallback((target: SelectedTarget) => {
    setState((prev) => {
      if (prev.phase === 'choosingTarget') {
        // If two-pick flow, advance to second pick
        if (prev.constraint?.secondTargetType) {
          return {
            ...prev,
            phase: 'choosingSecondTarget',
            firstTarget: target,
          }
        }
        // Single-target: go straight to confirming
        return {
          ...prev,
          phase: 'confirming',
          firstTarget: target,
        }
      }
      if (prev.phase === 'choosingSecondTarget') {
        return {
          ...prev,
          phase: 'confirming',
          secondTarget: target,
        }
      }
      return prev
    })
  }, [])

  /** Confirm the selection (parent handles the actual action) */
  const confirm = useCallback(() => {
    setState(IDLE_STATE)
  }, [])

  /** Cancel the entire selection flow */
  const cancel = useCallback(() => {
    setState(IDLE_STATE)
  }, [])

  /** Go back one step (second target → first target) */
  const goBack = useCallback(() => {
    setState((prev) => {
      if (prev.phase === 'choosingSecondTarget') {
        return { ...prev, phase: 'choosingTarget', firstTarget: null }
      }
      if (prev.phase === 'confirming' && prev.constraint?.secondTargetType) {
        return { ...prev, phase: 'choosingSecondTarget', secondTarget: null }
      }
      if (prev.phase === 'confirming') {
        return { ...prev, phase: 'choosingTarget', firstTarget: null }
      }
      return prev
    })
  }, [])

  /** Current target type being picked */
  const currentTargetType: SelectionTargetType | null =
    state.phase === 'choosingTarget'
      ? state.constraint?.targetType ?? null
      : state.phase === 'choosingSecondTarget'
        ? state.constraint?.secondTargetType ?? null
        : null

  /** Current prompt text */
  const currentPrompt: string | null =
    state.phase === 'choosingTarget'
      ? state.constraint?.prompt ?? null
      : state.phase === 'choosingSecondTarget'
        ? state.constraint?.secondPrompt ?? null
        : state.phase === 'confirming'
          ? 'Confirm?'
          : null

  // Esc to cancel (handled at hook level for convenience)
  useEffect(() => {
    if (state.phase === 'idle') return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        cancel()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [state.phase, cancel])

  return {
    selection: state,
    isSelecting: state.phase !== 'idle',
    currentTargetType,
    currentPrompt,
    startSelection,
    selectTarget,
    confirm,
    cancel,
    goBack,
  }
}
