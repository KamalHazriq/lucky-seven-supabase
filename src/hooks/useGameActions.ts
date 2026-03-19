import { useCallback, useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
// Core turn-loop actions + powers from Supabase (Phase 3b + 3c)
import {
  drawFromPile,
  takeFromDiscard,
  cancelDraw,
  swapWithSlot,
  discardDrawn,
  usePeekOne as peekOne,
  usePeekAll as peekAll,
  useSwap as swapCards,
  useLock as lockCard,
  useUnlock as unlockCard,
  useRearrange as rearrangeCards,
  usePeekOpponent as peekOpponent,
  usePeekAllOpponent as peekAllOpponent,
} from '../lib/supabaseGameService'
import { playSfx, vibrate } from '../lib/sfx'
import type { Card, PowerEffectType, PowerRankKey, PrivatePlayerDoc } from '../lib/types'
import type { SelectionModeState, SelectedTarget, SelectionConstraint } from './useSelectionMode'

// ─── Selection constraint definitions ────────────────────────
export const PEEK_ONE_CONSTRAINT: SelectionConstraint = {
  targetType: 'yourSlot',
  prompt: 'Pick one of your cards to peek',
}

export const SWAP_CONSTRAINT: SelectionConstraint = {
  targetType: 'anyPlayerSlot',
  prompt: 'Pick the first card to swap',
  secondTargetType: 'anyPlayerSlot',
  secondPrompt: 'Pick the second card to swap',
}

export const LOCK_CONSTRAINT: SelectionConstraint = {
  targetType: 'anyUnlockedSlot',
  prompt: 'Pick an unlocked card to lock',
}

export const UNLOCK_CONSTRAINT: SelectionConstraint = {
  targetType: 'anyLockedSlot',
  prompt: 'Pick a locked card to unlock',
}

export const REARRANGE_CONSTRAINT: SelectionConstraint = {
  targetType: 'anyPlayer',
  prompt: 'Pick a player to shuffle their cards',
}

// ─── Modal state type ────────────────────────────────────────
export type ModalState =
  | { type: 'peekOne' }
  | { type: 'peekResult'; card: Card; slot: number }
  | { type: 'peekAll'; cards: Record<string, Card> }
  | { type: 'swap' }
  | { type: 'lock' }
  | { type: 'unlock' }
  | { type: 'rearrange' }
  | { type: 'peekChoice'; effectType: PowerEffectType; rankKey: PowerRankKey }
  | { type: 'peekOpponent' }
  | { type: 'peekOpponentResult'; card: Card; playerName: string; slot: number }
  | { type: 'peekAllOpponent' }
  | { type: 'peekAllOpponentResult'; cards: Record<number, Card>; playerName: string; locks: boolean[] }
  | { type: 'none' }

// ─── Hook params ─────────────────────────────────────────────
interface UseGameActionsParams {
  gameId: string | undefined
  isMyTurn: boolean
  isDrawPhase: boolean
  isActionPhase: boolean
  hasDrawnCard: boolean
  drawnCard: Card | null
  reduced: boolean
  isDesktop: boolean
  isSpectator: boolean

  // Private state
  privateState: PrivatePlayerDoc | null
  myLocks: boolean[]

  // UI mode
  uiMode: 'modal' | 'actionbar'
  drawnCardDismissed: boolean

  // DOM refs
  drawPileRef: React.RefObject<HTMLDivElement | null>
  discardPileRef: React.RefObject<HTMLDivElement | null>
  stagingRef: React.RefObject<HTMLDivElement | null>
  localPanelRef: React.RefObject<HTMLDivElement | null>

  // Choreography
  choreo: {
    phase: string
    staging: { card: Card | null; faceUp: boolean; source?: 'pile' | 'discard' | null }
  }
  startDiscardTake: (card: Card, from: DOMRect, to: DOMRect, ownerColor?: string) => void
  startSwapFromStaging: (staging: DOMRect, player: DOMRect, discard: DOMRect, card: Card | null, ownerColor?: string) => void
  startDiscardAction: (from: DOMRect, to: DOMRect, card: Card | null, faceUp: boolean, ownerColor?: string) => void
  startPileDraw: (from: DOMRect, to: DOMRect, ownerColor?: string) => void
  reconstructStaging: (card: Card | null, source: 'pile' | 'discard' | null, ownerColor?: string) => void
  resetChoreo: () => void

  // Flying card
  triggerFly: (from: DOMRect, to: DOMRect, faceUp: boolean, card?: Card | null, ownerColor?: string) => void

  // Selection mode
  selection: SelectionModeState
  isSelecting: boolean
  startSelection: (constraint: SelectionConstraint) => void
  selectTarget: (target: SelectedTarget) => void
  confirmSelection: () => void

  // Stamp overlays
  setStampOverlays: React.Dispatch<React.SetStateAction<Record<string, 'lock' | 'unlock' | null>>>

  // Discard top (for choreography)
  discardTop: Card | null

  // Settings
  peekAllowsOpponent: boolean
  noMemoryMode: boolean
  cardsPerPlayer: number
}

interface UseGameActionsReturn {
  busy: boolean
  modal: ModalState
  setModal: React.Dispatch<React.SetStateAction<ModalState>>
  canDraw: boolean
  canTakeDiscard: boolean
  peekReveal: { slot: number; card: Card } | null
  handleDrawPile: () => void
  handleTakeDiscard: () => void
  handleCancelDraw: () => void
  handleSwap: (slotIndex: number, fromRect?: DOMRect | null) => void
  handleDiscard: (fromRect?: DOMRect | null) => void
  handleUsePower: (rankKey: PowerRankKey, effectType: PowerEffectType) => void
  handleSelectionConfirm: () => void
  handleSelectionClick: (target: SelectedTarget) => void
  handlePlayerSelect: (playerId: string) => void
  handlePeekSelect: (slotIndex: number) => void
  handleSwapConfirm: (targetA: { playerId: string; slotIndex: number }, targetB: { playerId: string; slotIndex: number }) => void
  handleLockSelect: (targetPlayerId: string, slotIndex: number) => void
  handleUnlockSelect: (targetPlayerId: string, slotIndex: number) => void
  handleRearrangeSelect: (targetPlayerId: string) => void
  handlePeekOpponentSelect: (targetPlayerId: string, slotIndex: number) => void
  handlePeekAllOpponentSelect: (targetPlayerId: string) => void
  handlePeekChoiceSelf: () => void
  handlePeekChoiceOpponent: () => void
  handleCancelPower: () => void
}

export function useGameActions(params: UseGameActionsParams): UseGameActionsReturn {
  const {
    gameId, isMyTurn, isDrawPhase, isActionPhase, hasDrawnCard, drawnCard,
    reduced, isDesktop, isSpectator, privateState, myLocks,
    uiMode, drawnCardDismissed,
    drawPileRef, discardPileRef, stagingRef, localPanelRef,
    choreo, startDiscardTake, startSwapFromStaging, startDiscardAction,
    startPileDraw, reconstructStaging, resetChoreo,
    triggerFly,
    selection, isSelecting, startSelection, selectTarget, confirmSelection,
    setStampOverlays, discardTop, peekAllowsOpponent, noMemoryMode, cardsPerPlayer,
  } = params

  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [modal, setModal] = useState<ModalState>({ type: 'none' })
  const [peekReveal, setPeekReveal] = useState<{ slot: number; card: Card } | null>(null)
  const peekTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stampTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const canDraw = isDrawPhase && !busy
  const canTakeDiscard = canDraw && !!discardTop

  const showStampOverlay = useCallback((playerId: string, type: 'lock' | 'unlock') => {
    if (reduced) return
    const existing = stampTimersRef.current[playerId]
    if (existing) clearTimeout(existing)
    setStampOverlays((prev) => ({ ...prev, [playerId]: type }))
    stampTimersRef.current[playerId] = setTimeout(() => {
      setStampOverlays((prev) => ({ ...prev, [playerId]: null }))
      delete stampTimersRef.current[playerId]
    }, 800)
  }, [reduced, setStampOverlays])

  // Clean up peek timer on unmount
  useEffect(() => {
    return () => {
      if (peekTimerRef.current) clearTimeout(peekTimerRef.current)
      Object.values(stampTimersRef.current).forEach(clearTimeout)
      stampTimersRef.current = {}
    }
  }, [])

  const withBusy = useCallback(async (fn: () => Promise<void>, onError?: () => void) => {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    try {
      await fn()
    } catch (e) {
      onError?.()
      toast.error((e as Error).message)
      playSfx('error'); vibrate(100)
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }, [])

  const getLocalSlotRect = useCallback((slotIndex: number): DOMRect | null => {
    const panelEl = localPanelRef.current
    if (!panelEl) return null

    const slotEl = panelEl.querySelector<HTMLElement>(`[data-slot="${slotIndex}"]`)
    if (slotEl) return slotEl.getBoundingClientRect()

    const rect = panelEl.getBoundingClientRect()
    const segmentWidth = rect.width / Math.max(cardsPerPlayer, 1)
    return new DOMRect(
      rect.left + segmentWidth * slotIndex + segmentWidth * 0.1,
      rect.top + rect.height * 0.35,
      segmentWidth * 0.8,
      rect.height * 0.6,
    )
  }, [cardsPerPlayer, localPanelRef])

  // ─── Reconstruct staging on resume/refresh ──────
  useEffect(() => {
    if (!isMyTurn || !privateState) return
    reconstructStaging(privateState.drawnCard, privateState.drawnCardSource)
  }, [isMyTurn, privateState, reconstructStaging])

  // ─── Card action handlers ──────────────────────
  const handleDrawPile = () => {
    if (!canDraw) return
    const fromEl = drawPileRef.current
    const stagingEl = stagingRef.current
    playSfx('draw')
    vibrate()
    if (!reduced && fromEl && stagingEl) {
      startPileDraw(fromEl.getBoundingClientRect(), stagingEl.getBoundingClientRect())
    } else {
      reconstructStaging(null, 'pile')
    }
    void withBusy(async () => {
      await drawFromPile(gameId!)
    }, () => {
      resetChoreo()
    })
  }

  const handleTakeDiscard = () => {
    if (!canTakeDiscard) return
    const fromEl = discardPileRef.current
    const stagingEl = stagingRef.current
    const discardCard = discardTop
    playSfx('take')
    vibrate()
    if (!reduced && fromEl && stagingEl && discardCard) {
      startDiscardTake(discardCard, fromEl.getBoundingClientRect(), stagingEl.getBoundingClientRect())
    } else {
      reconstructStaging(discardCard, 'discard')
    }
    void withBusy(async () => {
      await takeFromDiscard(gameId!)
    }, () => {
      resetChoreo()
    })
  }

  const handleCancelDraw = useCallback(() => {
    const source = privateState?.drawnCardSource
    const stagingEl = stagingRef.current
    const discardEl = discardPileRef.current
    const stagedCard = choreo.staging.card ?? drawnCard

    if (source === 'discard' && !reduced && stagingEl && discardEl) {
      startDiscardAction(
        stagingEl.getBoundingClientRect(),
        discardEl.getBoundingClientRect(),
        stagedCard,
        choreo.staging.faceUp || !!stagedCard,
      )
    } else {
      resetChoreo()
    }

    void withBusy(async () => {
      await cancelDraw(gameId!)
    }, () => {
      reconstructStaging(stagedCard, source ?? null)
    })
  }, [gameId, privateState?.drawnCardSource, reduced, choreo.staging, drawnCard, startDiscardAction, resetChoreo, withBusy, stagingRef, discardPileRef, reconstructStaging])

  const handleSwap = useCallback((slotIndex: number, fromRect?: DOMRect | null) => {
    setModal({ type: 'none' })
    const stagingEl = stagingRef.current
    const discardEl = discardPileRef.current
    const slotRect = getLocalSlotRect(slotIndex)
    const originRect = fromRect ?? stagingEl?.getBoundingClientRect() ?? null
    const swappedOutCard = privateState?.hand?.[slotIndex] ?? null

    playSfx('swap')
    vibrate()

    if (!reduced && originRect && slotRect && discardEl) {
      startSwapFromStaging(
        originRect,
        slotRect,
        discardEl.getBoundingClientRect(),
        swappedOutCard,
      )
    } else {
      resetChoreo()
    }

    void withBusy(async () => {
      await swapWithSlot(gameId!, slotIndex)
    }, () => {
      reconstructStaging(drawnCard ?? choreo.staging.card, privateState?.drawnCardSource ?? choreo.staging.source ?? null)
    })
  }, [gameId, reduced, getLocalSlotRect, startSwapFromStaging, resetChoreo, withBusy, stagingRef, discardPileRef, drawnCard, choreo.staging, privateState?.drawnCardSource, privateState?.hand, reconstructStaging])

  const handleDiscard = (fromRect?: DOMRect | null) => {
    setModal({ type: 'none' })
    const stagingEl = stagingRef.current
    const localEl = localPanelRef.current
    const discardEl = discardPileRef.current
    const originRect = fromRect
      ?? stagingEl?.getBoundingClientRect()
      ?? localEl?.getBoundingClientRect()
      ?? null
    const flightCard = choreo.staging.card ?? drawnCard
    const flightFaceUp = choreo.staging.faceUp || !!flightCard

    playSfx('discard')

    if (!reduced && originRect && discardEl) {
      startDiscardAction(
        originRect,
        discardEl.getBoundingClientRect(),
        flightCard,
        flightFaceUp,
      )
    } else if (!reduced && localEl && discardEl) {
      triggerFly(localEl.getBoundingClientRect(), discardEl.getBoundingClientRect(), flightFaceUp, flightCard)
      resetChoreo()
    } else {
      resetChoreo()
    }

    void withBusy(async () => {
      await discardDrawn(gameId!)
    }, () => {
      reconstructStaging(flightCard, privateState?.drawnCardSource ?? choreo.staging.source ?? null)
    })
  }

  // ─── Choreography flight completion ────────────

  // ─── Power handlers ────────────────────────────
  const handleUsePower = (rankKey: PowerRankKey, effectType: PowerEffectType) => {
    // If peek power with opponent peek enabled, show choice first
    const isPeek = effectType === 'peek_one_of_your_cards' || effectType === 'peek_all_three_of_your_cards'
    if (isPeek && peekAllowsOpponent) {
      setModal({ type: 'peekChoice', effectType, rankKey })
      return
    }

    if (uiMode === 'actionbar') {
      switch (effectType) {
        case 'peek_all_three_of_your_cards':
          withBusy(async () => {
            const cards = await peekAll(gameId!, noMemoryMode)
            playSfx('peekAll')
            setModal({ type: 'peekAll', cards })
          })
          break
        case 'peek_one_of_your_cards':
          startSelection(PEEK_ONE_CONSTRAINT)
          break
        case 'swap_one_to_one':
          startSelection(SWAP_CONSTRAINT)
          break
        case 'lock_one_card':
          startSelection(LOCK_CONSTRAINT)
          break
        case 'unlock_one_locked_card':
          startSelection(UNLOCK_CONSTRAINT)
          break
        case 'rearrange_cards':
          startSelection(REARRANGE_CONSTRAINT)
          break
      }
      return
    }

    // Modal mode
    switch (effectType) {
      case 'peek_all_three_of_your_cards':
        setModal({ type: 'none' })
        withBusy(async () => {
          const cards = await peekAll(gameId!, noMemoryMode)
          playSfx('peekAll')
          setModal({ type: 'peekAll', cards })
        })
        break
      case 'peek_one_of_your_cards':
        playSfx('peek')
        setModal({ type: 'peekOne' })
        break
      case 'swap_one_to_one':
        setModal({ type: 'swap' })
        break
      case 'lock_one_card':
        setModal({ type: 'lock' })
        break
      case 'unlock_one_locked_card':
        setModal({ type: 'unlock' })
        break
      case 'rearrange_cards':
        setModal({ type: 'rearrange' })
        break
    }
  }

  // Handle peek choice: user chose "Peek Your Cards" from the choice modal
  const handlePeekChoiceSelf = () => {
    if (modal.type !== 'peekChoice') return
    const { effectType } = modal

    if (uiMode === 'actionbar') {
      if (effectType === 'peek_all_three_of_your_cards') {
        setModal({ type: 'none' })
        withBusy(async () => {
          const cards = await peekAll(gameId!, noMemoryMode)
          playSfx('peekAll')
          setModal({ type: 'peekAll', cards })
        })
      } else {
        setModal({ type: 'none' })
        startSelection(PEEK_ONE_CONSTRAINT)
      }
    } else {
      if (effectType === 'peek_all_three_of_your_cards') {
        setModal({ type: 'none' })
        withBusy(async () => {
          const cards = await peekAll(gameId!, noMemoryMode)
          playSfx('peekAll')
          setModal({ type: 'peekAll', cards })
        })
      } else {
        playSfx('peek')
        setModal({ type: 'peekOne' })
      }
    }
  }

  // Handle peek choice: user chose "Peek Opponent's Card"
  const handlePeekChoiceOpponent = () => {
    if (modal.type === 'peekChoice' && modal.effectType === 'peek_all_three_of_your_cards') {
      // Jack (peek_all) → select a player, then reveal all 3 of their cards
      playSfx('peek')
      setModal({ type: 'peekAllOpponent' })
    } else {
      // peek_one → select one opponent slot
      playSfx('peek')
      setModal({ type: 'peekOpponent' })
    }
  }

  // ─── Selection mode confirm ────────────────────
  const handleSelectionConfirm = useCallback(() => {
    if (!selection.constraint || selection.phase !== 'confirming') return
    const { targetType } = selection.constraint
    const first = selection.firstTarget
    const second = selection.secondTarget
    if (!first) return

    confirmSelection()

    switch (targetType) {
      case 'yourSlot':
        withBusy(async () => {
          const card = await peekOne(gameId!, first.slotIndex, noMemoryMode)
          playSfx('peek')
          if (reduced) {
            setModal({ type: 'peekResult', card, slot: first.slotIndex })
          } else {
            setPeekReveal({ slot: first.slotIndex, card })
            if (peekTimerRef.current) clearTimeout(peekTimerRef.current)
            peekTimerRef.current = setTimeout(() => setPeekReveal(null), noMemoryMode ? 5000 : 2000)
          }
        })
        break
      case 'anyPlayerSlot':
        if (!second) return
        withBusy(async () => {
          await swapCards(gameId!,
            { playerId: first.playerId, slotIndex: first.slotIndex },
            { playerId: second.playerId, slotIndex: second.slotIndex },
          )
          playSfx('swap'); vibrate()
        })
        break
      case 'anyUnlockedSlot':
        withBusy(async () => {
          await lockCard(gameId!, first.playerId, first.slotIndex)
          playSfx('lock'); vibrate(50)
          showStampOverlay(first.playerId, 'lock')
        })
        break
      case 'anyLockedSlot':
        withBusy(async () => {
          await unlockCard(gameId!, first.playerId, first.slotIndex)
          playSfx('unlock'); vibrate()
          showStampOverlay(first.playerId, 'unlock')
        })
        break
      case 'anyPlayer':
        withBusy(async () => {
          await rearrangeCards(gameId!, first.playerId)
          playSfx('shuffle'); vibrate(80)
        })
        break
    }
  }, [selection, confirmSelection, withBusy, gameId, reduced, showStampOverlay, noMemoryMode])

  const handleSelectionClick = useCallback((target: SelectedTarget) => {
    // For swap (anyPlayerSlot two-pick), prevent selecting a second card from the same player
    if (
      selection.phase === 'choosingSecondTarget' &&
      selection.constraint?.secondTargetType === 'anyPlayerSlot' &&
      selection.firstTarget?.playerId === target.playerId
    ) {
      toast.error("Can't swap two cards from the same player")
      return
    }
    selectTarget(target)
  }, [selectTarget, selection])

  const handlePlayerSelect = useCallback((playerId: string) => {
    selectTarget({ playerId, slotIndex: 0 })
  }, [selectTarget])

  // ─── Modal-mode power handlers ─────────────────
  const handlePeekSelect = (slotIndex: number) => {
    setModal({ type: 'none' })
    withBusy(async () => {
      const card = await peekOne(gameId!, slotIndex, noMemoryMode)
      setModal({ type: 'peekResult', card, slot: slotIndex })
      playSfx('peek')
    })
  }

  const handleSwapConfirm = (
    targetA: { playerId: string; slotIndex: number },
    targetB: { playerId: string; slotIndex: number },
  ) => {
    setModal({ type: 'none' })
    withBusy(async () => { await swapCards(gameId!, targetA, targetB); playSfx('swap'); vibrate() })
  }

  const handleLockSelect = (targetPlayerId: string, slotIndex: number) => {
    setModal({ type: 'none' })
    withBusy(async () => {
      await lockCard(gameId!, targetPlayerId, slotIndex)
      playSfx('lock')
      vibrate(50)
      showStampOverlay(targetPlayerId, 'lock')
    })
  }

  const handleUnlockSelect = (targetPlayerId: string, slotIndex: number) => {
    setModal({ type: 'none' })
    withBusy(async () => {
      await unlockCard(gameId!, targetPlayerId, slotIndex)
      playSfx('unlock')
      vibrate()
      showStampOverlay(targetPlayerId, 'unlock')
    })
  }

  const handleRearrangeSelect = (targetPlayerId: string) => {
    setModal({ type: 'none' })
    withBusy(async () => { await rearrangeCards(gameId!, targetPlayerId); playSfx('shuffle'); vibrate(80) })
  }

  const handlePeekOpponentSelect = (targetPlayerId: string, slotIndex: number) => {
    setModal({ type: 'none' })
    withBusy(async () => {
      const { card, playerName } = await peekOpponent(gameId!, targetPlayerId, slotIndex, noMemoryMode)
      playSfx('peek')
      setModal({ type: 'peekOpponentResult', card, playerName, slot: slotIndex })
    })
  }

  const handlePeekAllOpponentSelect = (targetPlayerId: string) => {
    setModal({ type: 'none' })
    withBusy(async () => {
      const { cards, playerName, locks } = await peekAllOpponent(gameId!, targetPlayerId, noMemoryMode)
      playSfx('peekAll')
      setModal({ type: 'peekAllOpponentResult', cards, playerName, locks })
    })
  }

  const handleCancelPower = () => {
    setModal({ type: 'none' })
  }

  // ─── Keyboard shortcuts ────────────────────────
  useEffect(() => {
    if (!isDesktop || !isMyTurn || isSpectator) return

    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

      if (isSelecting) {
        if (e.key === 'Enter' && selection.phase === 'confirming') {
          e.preventDefault()
          handleSelectionConfirm()
        }
        return
      }

      if (uiMode === 'actionbar' && hasDrawnCard && isActionPhase && modal.type === 'none' && !drawnCardDismissed) {
        const num = parseInt(e.key)
        if (num >= 1 && num <= cardsPerPlayer) {
          const slotIdx = num - 1
          if (!myLocks[slotIdx]) {
            e.preventDefault()
            handleSwap(slotIdx)
          }
        }
        if (e.key === 'Escape') {
          if (privateState?.drawnCardSource === 'discard') {
            e.preventDefault()
            handleCancelDraw()
          }
        }
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [
    isDesktop, isMyTurn, isSpectator, isSelecting, selection.phase, uiMode,
    hasDrawnCard, isActionPhase, modal.type, drawnCardDismissed,
    myLocks, handleSelectionConfirm, handleSwap, handleCancelDraw, privateState?.drawnCardSource,
    cardsPerPlayer,
  ])

  return {
    busy,
    modal,
    setModal,
    canDraw,
    canTakeDiscard,
    peekReveal,
    handleDrawPile,
    handleTakeDiscard,
    handleCancelDraw,
    handleSwap,
    handleDiscard,
    handleUsePower,
    handleSelectionConfirm,
    handleSelectionClick,
    handlePlayerSelect,
    handlePeekSelect,
    handleSwapConfirm,
    handleLockSelect,
    handleUnlockSelect,
    handleRearrangeSelect,
    handlePeekOpponentSelect,
    handlePeekAllOpponentSelect,
    handlePeekChoiceSelf,
    handlePeekChoiceOpponent,
    handleCancelPower,
  }
}
