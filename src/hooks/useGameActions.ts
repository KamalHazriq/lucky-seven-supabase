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
import { getTurnCardUiState, type TurnCardUiSource } from '../lib/turnCardState'
import type { SelectionModeState, SelectedTarget, SelectionConstraint } from './useSelectionMode'
import type { ModalState } from './gameActionTypes'
import {
  LOCK_CONSTRAINT,
  PEEK_ONE_CONSTRAINT,
  REARRANGE_CONSTRAINT,
  SWAP_CONSTRAINT,
  UNLOCK_CONSTRAINT,
} from './gameSelectionConstraints'
import { useGameActionShortcuts } from './useGameActionShortcuts'

// ─── Hook params ─────────────────────────────────────────────
interface UseGameActionsParams {
  gameId: string | undefined
  isMyTurn: boolean
  isDrawPhase: boolean
  isActionPhase: boolean
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

  // Player panel refs for swap fly animation
  otherPanelRefs?: React.MutableRefObject<Record<string, HTMLDivElement | null>>

  // Selection mode
  selection: SelectionModeState
  isSelecting: boolean
  startSelection: (constraint: SelectionConstraint) => void
  selectTarget: (target: SelectedTarget) => void
  confirmSelection: () => void

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
  activeCard: Card | null
  activeCardSource: TurnCardUiSource
  hasActiveCard: boolean
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
    gameId, isMyTurn, isDrawPhase, isActionPhase, drawnCard,
    reduced, isDesktop, isSpectator, privateState, myLocks,
    uiMode, drawnCardDismissed,
    drawPileRef, discardPileRef, stagingRef, localPanelRef,
    choreo, startDiscardTake, startSwapFromStaging, startDiscardAction,
    startPileDraw, reconstructStaging, resetChoreo,
    triggerFly,
    otherPanelRefs,
    selection, isSelecting, startSelection, selectTarget, confirmSelection,
    discardTop, peekAllowsOpponent, noMemoryMode, cardsPerPlayer,
  } = params

  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)

  // Helper: get the bounding rect of a specific card slot in a player's panel
  const getSlotRect = useCallback((playerId: string, slotIndex: number): DOMRect | null => {
    const panel = otherPanelRefs?.current[playerId] ?? localPanelRef.current
    if (!panel) return null
    return panel.querySelector(`[data-slot="${slotIndex}"]`)?.getBoundingClientRect() ?? null
  }, [otherPanelRefs, localPanelRef])

  // Helper: trigger a flying card animation between two player slots (fail gracefully)
  const triggerSwapFly = useCallback((
    pidA: string, slotA: number, pidB: string, slotB: number,
  ) => {
    if (reduced) return
    const rectA = getSlotRect(pidA, slotA)
    const rectB = getSlotRect(pidB, slotB)
    if (rectA && rectB) triggerFly(rectA, rectB, false, null)
  }, [reduced, getSlotRect, triggerFly])
  const [modal, setModal] = useState<ModalState>({ type: 'none' })
  const [peekReveal, setPeekReveal] = useState<{ slot: number; card: Card } | null>(null)
  const [localTurnCardOverride, setLocalTurnCardOverride] = useState<{ card: Card; source: TurnCardUiSource } | null>(null)
  const peekTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const {
    activeCard,
    activeCardSource,
    hasActiveCard,
    canDiscard: canDiscardActiveCard,
    canUsePower: canUsePowerWithActiveCard,
  } = getTurnCardUiState({
    drawnCard,
    drawnCardSource: privateState?.drawnCardSource ?? null,
    localOverride: localTurnCardOverride,
  })

  const canDraw = isDrawPhase && !busy && activeCardSource !== 'discard'
  const canTakeDiscard = canDraw && !!discardTop && activeCardSource !== 'discard-preview'

  // Clean up peek timer on unmount
  useEffect(() => {
    return () => {
      if (peekTimerRef.current) clearTimeout(peekTimerRef.current)
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
    const serverMatchesCommittedDiscardOverride = localTurnCardOverride?.source === 'discard'
      ? privateState.drawnCard?.id === localTurnCardOverride.card.id
        && privateState.drawnCardSource === 'discard'
      : false
    if (localTurnCardOverride && !serverMatchesCommittedDiscardOverride) {
      return
    }
    reconstructStaging(privateState.drawnCard, privateState.drawnCardSource)
  }, [isMyTurn, privateState, reconstructStaging, localTurnCardOverride])

  useEffect(() => {
    if (!localTurnCardOverride) return

    if (localTurnCardOverride.source === 'discard-preview') {
      if (!isMyTurn || !isDrawPhase) {
        setLocalTurnCardOverride(null)
        return
      }

      if (!discardTop || discardTop.id !== localTurnCardOverride.card.id) {
        setLocalTurnCardOverride(null)
        reconstructStaging(privateState?.drawnCard ?? null, privateState?.drawnCardSource ?? null)
      }
      return
    }

    if (
      privateState?.drawnCard
      && privateState.drawnCard.id === localTurnCardOverride.card.id
      && privateState.drawnCardSource === 'discard'
    ) {
      setLocalTurnCardOverride(null)
      return
    }

    if (!isMyTurn && !privateState?.drawnCard) {
      setLocalTurnCardOverride(null)
    }
  }, [
    localTurnCardOverride,
    isMyTurn,
    isDrawPhase,
    discardTop,
    privateState?.drawnCard,
    privateState?.drawnCardSource,
    reconstructStaging,
  ])

  // ─── Card action handlers ──────────────────────
  const handleDrawPile = () => {
    if (!canDraw) return
    setModal({ type: 'none' })
    setLocalTurnCardOverride(null)
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
    setModal({ type: 'none' })
    const fromEl = discardPileRef.current
    const stagingEl = stagingRef.current
    const discardCard = discardTop
    if (!discardCard) return
    playSfx('take')
    vibrate()
    if (!reduced && fromEl && stagingEl && discardCard) {
      startDiscardTake(discardCard, fromEl.getBoundingClientRect(), stagingEl.getBoundingClientRect())
    } else {
      reconstructStaging(discardCard, 'discard')
    }
    setLocalTurnCardOverride({ card: discardCard, source: 'discard-preview' })
  }

  const handleCancelDraw = useCallback(() => {
    const source = activeCardSource
    const stagingEl = stagingRef.current
    const discardEl = discardPileRef.current
    const stagedCard = choreo.staging.card ?? activeCard

    if (source === 'discard-preview') {
      setModal({ type: 'none' })
      setLocalTurnCardOverride(null)
      if (!reduced && stagingEl && discardEl) {
        startDiscardAction(
          stagingEl.getBoundingClientRect(),
          discardEl.getBoundingClientRect(),
          stagedCard,
          !!stagedCard,
        )
      } else {
        reconstructStaging(null, null)
      }
      return
    }

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
      setLocalTurnCardOverride(null)
    }, () => {
      reconstructStaging(stagedCard, source === 'discard' ? 'discard' : null)
    })
  }, [gameId, activeCardSource, reduced, choreo.staging, activeCard, startDiscardAction, resetChoreo, withBusy, stagingRef, discardPileRef, reconstructStaging])

  const handleSwap = useCallback((slotIndex: number, fromRect?: DOMRect | null) => {
    if (!activeCard) return
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

    let committedDiscardTake = false
    void withBusy(async () => {
      if (activeCardSource === 'discard-preview') {
        await takeFromDiscard(gameId!)
        committedDiscardTake = true
        setLocalTurnCardOverride({ card: activeCard, source: 'discard' })
      }
      await swapWithSlot(gameId!, slotIndex)
      setLocalTurnCardOverride(null)
    }, () => {
      const fallbackSource = committedDiscardTake ? 'discard' : activeCardSource
      reconstructStaging(activeCard, fallbackSource === 'pile' ? 'pile' : 'discard')
    })
  }, [gameId, reduced, getLocalSlotRect, startSwapFromStaging, resetChoreo, withBusy, stagingRef, discardPileRef, activeCard, activeCardSource, privateState?.hand, reconstructStaging])

  const handleDiscard = (fromRect?: DOMRect | null) => {
    if (!activeCard || !canDiscardActiveCard) return
    setModal({ type: 'none' })
    const stagingEl = stagingRef.current
    const localEl = localPanelRef.current
    const discardEl = discardPileRef.current
    const originRect = fromRect
      ?? stagingEl?.getBoundingClientRect()
      ?? localEl?.getBoundingClientRect()
      ?? null
    const flightCard = choreo.staging.card ?? activeCard
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
      reconstructStaging(flightCard, activeCardSource === 'pile' ? 'pile' : choreo.staging.source ?? null)
    })
  }

  // ─── Choreography flight completion ────────────

  // ─── Power handlers ────────────────────────────
  const handleUsePower = async (rankKey: PowerRankKey, effectType: PowerEffectType) => {
    if (!canUsePowerWithActiveCard) return

    // If taken from discard (preview), commit the pick before opening power UI
    if (activeCardSource === 'discard-preview' && activeCard) {
      const cardToKeep = activeCard
      let committed = false
      await withBusy(async () => {
        await takeFromDiscard(gameId!)
        committed = true
      })
      if (!committed) return
      setLocalTurnCardOverride({ card: cardToKeep, source: 'discard' })
    }

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
          triggerSwapFly(first.playerId, first.slotIndex, second.playerId, second.slotIndex)
        })
        break
      case 'anyUnlockedSlot':
        withBusy(async () => {
          await lockCard(gameId!, first.playerId, first.slotIndex)
          playSfx('lock'); vibrate(50)
        })
        break
      case 'anyLockedSlot':
        withBusy(async () => {
          await unlockCard(gameId!, first.playerId, first.slotIndex)
          playSfx('unlock'); vibrate()
        })
        break
      case 'anyPlayer':
        withBusy(async () => {
          await rearrangeCards(gameId!, first.playerId)
          playSfx('shuffle'); vibrate(80)
        })
        break
    }
  }, [selection, confirmSelection, withBusy, gameId, reduced, noMemoryMode])

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
    withBusy(async () => {
      await swapCards(gameId!, targetA, targetB)
      playSfx('swap'); vibrate()
      triggerSwapFly(targetA.playerId, targetA.slotIndex, targetB.playerId, targetB.slotIndex)
    })
  }

  const handleLockSelect = (targetPlayerId: string, slotIndex: number) => {
    setModal({ type: 'none' })
    withBusy(async () => {
      await lockCard(gameId!, targetPlayerId, slotIndex)
      playSfx('lock')
      vibrate(50)
    })
  }

  const handleUnlockSelect = (targetPlayerId: string, slotIndex: number) => {
    setModal({ type: 'none' })
    withBusy(async () => {
      await unlockCard(gameId!, targetPlayerId, slotIndex)
      playSfx('unlock')
      vibrate()
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

  useGameActionShortcuts({
    isDesktop,
    isMyTurn,
    isSpectator,
    isSelecting,
    selectionPhase: selection.phase,
    uiMode,
    hasActiveCard,
    isActionPhase,
    modalType: modal.type,
    drawnCardDismissed,
    myLocks,
    activeCardSource,
    cardsPerPlayer,
    onSelectionConfirm: handleSelectionConfirm,
    onSwap: handleSwap,
    onCancelDraw: handleCancelDraw,
  })

  return {
    busy,
    modal,
    setModal,
    activeCard,
    activeCardSource,
    hasActiveCard,
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
