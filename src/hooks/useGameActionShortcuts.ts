import { useEffect } from 'react'
import type { DrawnCardSource } from '../lib/types'
import type { ModalState } from './gameActionTypes'

interface UseGameActionShortcutsParams {
  isDesktop: boolean
  isMyTurn: boolean
  isSpectator: boolean
  isSelecting: boolean
  selectionPhase: 'idle' | 'choosingTarget' | 'choosingSecondTarget' | 'confirming'
  uiMode: 'modal' | 'actionbar'
  hasDrawnCard: boolean
  isActionPhase: boolean
  modalType: ModalState['type']
  drawnCardDismissed: boolean
  myLocks: boolean[]
  drawnCardSource: DrawnCardSource
  cardsPerPlayer: number
  onSelectionConfirm: () => void
  onSwap: (slotIndex: number) => void
  onCancelDraw: () => void
}

export function useGameActionShortcuts({
  isDesktop,
  isMyTurn,
  isSpectator,
  isSelecting,
  selectionPhase,
  uiMode,
  hasDrawnCard,
  isActionPhase,
  modalType,
  drawnCardDismissed,
  myLocks,
  drawnCardSource,
  cardsPerPlayer,
  onSelectionConfirm,
  onSwap,
  onCancelDraw,
}: UseGameActionShortcutsParams): void {
  useEffect(() => {
    if (!isDesktop || !isMyTurn || isSpectator) return

    const handler = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

      if (isSelecting) {
        if (event.key === 'Enter' && selectionPhase === 'confirming') {
          event.preventDefault()
          onSelectionConfirm()
        }
        return
      }

      if (uiMode !== 'actionbar' || !hasDrawnCard || !isActionPhase || modalType !== 'none' || drawnCardDismissed) {
        return
      }

      const numberKey = parseInt(event.key, 10)
      if (numberKey >= 1 && numberKey <= cardsPerPlayer) {
        const slotIndex = numberKey - 1
        if (!myLocks[slotIndex]) {
          event.preventDefault()
          onSwap(slotIndex)
        }
        return
      }

      if (event.key === 'Escape' && drawnCardSource === 'discard') {
        event.preventDefault()
        onCancelDraw()
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [
    isDesktop,
    isMyTurn,
    isSpectator,
    isSelecting,
    selectionPhase,
    uiMode,
    hasDrawnCard,
    isActionPhase,
    modalType,
    drawnCardDismissed,
    myLocks,
    drawnCardSource,
    cardsPerPlayer,
    onSelectionConfirm,
    onSwap,
    onCancelDraw,
  ])
}
