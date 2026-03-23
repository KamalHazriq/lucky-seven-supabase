import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'
import { useAuth } from '../hooks/useAuth'
import { useGame } from '../hooks/useGame'
import { revealHand, leaveGame } from '../lib/supabaseGameService'
import { initiateVoteKick, castVoteKick, cancelVoteKick, devReorderDrawPile } from '../lib/supabaseGameService'
import CardView from '../components/CardView'
import PlayerPanel from '../components/PlayerPanel'
import GameLog from '../components/GameLog'
import GameModals from '../components/GameModals'
import VersionLabel from '../components/VersionLabel'
import TurnQueue from '../components/TurnQueue'
import GameTopBar from '../components/GameTopBar'
import { GameErrorScreen, GameKickedScreen, GameLoadingScreen } from '../components/GameStatusScreen'
import { useActionHighlight } from '../hooks/useActionHighlight'
import { useFlyingCard } from '../hooks/useFlyingCard'
import FlyingCard from '../components/FlyingCard'
import StagingSlot, { type StagingDragPoint } from '../components/StagingSlot'
import DiscardFlip from '../components/DiscardFlip'
import DiscardReorderModal from '../components/DiscardReorderModal'
import FeedbackModal from '../components/FeedbackModal'
import ChatPanel from '../components/ChatPanel'
import { useReducedMotion } from '../hooks/useReducedMotion'
import { useChat } from '../hooks/useChat'
import { useChatBubbles } from '../hooks/useChatBubbles'
import { getPlayerColor } from '../lib/playerColors'
import { useLayout } from '../hooks/useLayout'
import { useUiMode } from '../hooks/useUiMode'
import { useLogPosition } from '../hooks/useLogPosition'
import { useTurnTimer } from '../hooks/useTurnTimer'
import TurnTimer from '../components/TurnTimer'
import VoteKickModal from '../components/VoteKickModal'
import { getSeatPositions } from '../lib/seatPositions'
import ActionBar from '../components/ActionBar'
import { useSelectionMode } from '../hooks/useSelectionMode'
import { useDevMode } from '../hooks/useDevMode'
import { useChoreography } from '../hooks/useChoreography'
import { useRemoteSfx } from '../hooks/useRemoteSfx'
import { useRemotePowerToast } from '../hooks/useRemotePowerToast'
import { useChaosAnimation } from '../hooks/useChaosAnimation'
import { useRemoteAnimations } from '../hooks/useRemoteAnimations'
import { useGameActions } from '../hooks/useGameActions'
import { useStagedCardDrop } from '../hooks/useStagedCardDrop'
import { copyToClipboard } from '../lib/share'
import { DEFAULT_GAME_SETTINGS } from '../lib/types'
import { normalizeLocks } from '../lib/slotState'

export default function Game() {
  const { gameId } = useParams<{ gameId: string }>()
  const { user } = useAuth()
  const { game, players, privateState, loading, error, retry } = useGame(gameId, user?.uid)
  const navigate = useNavigate()

  const [drawnCardDismissed, setDrawnCardDismissed] = useState(false)
  const [showPowerGuide, setShowPowerGuide] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showDiscardReorder, setShowDiscardReorder] = useState(false)
  const [showFeedback, setShowFeedback] = useState(false)
  const [showMonitor, setShowMonitor] = useState(false)
  const devMode = useDevMode(gameId, user?.uid)
  const revealedRef = useRef(false)
  // Track whether user was ever in playerOrder (to distinguish kicked vs spectator)
  const [wasPlayer, setWasPlayer] = useState(false)
  const { reduced } = useReducedMotion()
  const { layout, toggle: toggleLayout, isMobile } = useLayout()
  const { uiMode, toggleMode: toggleUiMode, isDesktop } = useUiMode()
  const { position: logPosition, toggle: toggleLogPosition, canSidebar: canLogSidebar } = useLogPosition()
  const turnTimer = useTurnTimer(game, gameId)
  const { flyingCard, triggerFly, queueFly, clearFly } = useFlyingCard()
  const {
    choreo,
    startDiscardTake,
    startSwapFromStaging,
    startDiscardAction,
    startPileDraw,
    reconstructStaging,
    completeFlight,
    reset: resetChoreo,
  } = useChoreography()
  const drawPileRef = useRef<HTMLDivElement>(null)
  const discardPileRef = useRef<HTMLDivElement>(null)
  const stagingRef = useRef<HTMLDivElement>(null)
  const localPanelRef = useRef<HTMLDivElement>(null)
  const otherPanelRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const headerRef = useRef<HTMLDivElement>(null)
  const bannerRef = useRef<HTMLDivElement>(null)
  const [, setHeaderH] = useState(0)

  // Selection mode for actionbar power flows
  const {
    selection,
    isSelecting,
    currentTargetType,
    startSelection,
    selectTarget,
    confirm: confirmSelection,
    cancel: cancelSelection,
    goBack: goBackSelection,
  } = useSelectionMode()

  // Measure sticky header + banner stack height for layout offsets.
  // Sets CSS custom properties so the left sidebar and table zone adapt dynamically.
  useEffect(() => {
    const headerEl = headerRef.current
    const bannerEl = bannerRef.current
    if (!headerEl) return
    const update = () => {
      const hH = headerEl.getBoundingClientRect().height
      const bH = bannerEl?.getBoundingClientRect().height ?? 0
      const total = hH + bH
      setHeaderH(total + 8)
      document.documentElement.style.setProperty('--header-h', `${hH}px`)
      document.documentElement.style.setProperty('--top-offset', `${total}px`)
    }
    const ro = new ResizeObserver(update)
    ro.observe(headerEl)
    if (bannerEl) ro.observe(bannerEl)
    return () => { ro.disconnect(); document.documentElement.style.removeProperty('--header-h'); document.documentElement.style.removeProperty('--top-offset') }
  }, [])

  // Dev mode is now activated via Patch Notes > Send Feedback modal

  // Chat (lazy subscribe — only on first open)
  const chat = useChat(gameId)

  // Chat bubbles above player panels (UI-only, auto-clear after 4s)
  const chatBubbles = useChatBubbles(chat.messages, user?.uid ?? '')

  // Queue number map: playerId → queue position (1 = current turn)
  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const queueNumbers = useMemo(() => {
    const map: Record<string, number> = {}
    if (!game?.currentTurnPlayerId || !game?.playerOrder) return map
    const order = game.playerOrder
    const curIdx = order.indexOf(game.currentTurnPlayerId)
    if (curIdx === -1) return map
    for (let i = 0; i < order.length; i++) {
      const idx = (curIdx + i) % order.length
      map[order[idx]] = i + 1
    }
    return map
  }, [game?.currentTurnPlayerId, game?.playerOrder])

  // Derived state
  const drawnCard = privateState?.drawnCard ?? null
  const hasDrawnCard = !!drawnCard
  const stagingActive = choreo.phase === 'staging'
  const stagingCard = stagingActive ? choreo.staging.card : null
  const stagingFaceUp = stagingActive ? choreo.staging.faceUp : false
  const stagingOwnerColor = stagingActive ? choreo.staging.ownerColor : undefined
  const stagingPending = stagingActive ? !!choreo.staging.pending : false

  // Reset dismissed state when drawn card is consumed/cleared
  useEffect(() => {
    if (!hasDrawnCard) setDrawnCardDismissed(false) // eslint-disable-line react-hooks/set-state-in-effect
  }, [hasDrawnCard])

  // When game becomes finished, reveal own hand then redirect
  useEffect(() => {
    if (game?.status === 'finished' && gameId && user && !revealedRef.current) {
      revealedRef.current = true
      revealHand(gameId)
        .then(() => {
          setTimeout(() => {
            navigate(`/results/${gameId}`, { replace: true })
          }, 1500)
        })
        .catch((e) => {
          console.error('Failed to reveal hand:', e)
          navigate(`/results/${gameId}`, { replace: true })
        })
    }
  }, [game?.status, gameId, user, navigate])

  const isMyTurn = game?.currentTurnPlayerId === user?.uid
  const turnPhase = game?.turnPhase
  const isDrawPhase = isMyTurn && turnPhase === 'draw'
  const isActionPhase = isMyTurn && turnPhase === 'action'
  const myPlayer = user ? players[user.uid] : null
  const cardsPerPlayer = game?.settings?.cardsPerPlayer ?? DEFAULT_GAME_SETTINGS.cardsPerPlayer
  const myLocks = normalizeLocks(myPlayer?.locks, cardsPerPlayer)
  const powerAssignments = game?.settings?.powerAssignments ?? DEFAULT_GAME_SETTINGS.powerAssignments
  const noMemoryMode = game?.settings?.noMemoryMode ?? DEFAULT_GAME_SETTINGS.noMemoryMode
  const spentPowerCardIds = game?.spentPowerCardIds ?? {}
  const myKnown = privateState?.known ?? {}
  // Check if any card is locked anywhere (for disabling unlock power when no targets)
  const hasAnyLocks = useMemo(() => Object.values(players).some((p) => p.locks?.some(Boolean)), [players])

  // Action highlights (temporary colored ring on actor's panel + per-slot overlays + swap labels)
  const { highlights: actionHighlights, slotOverlays, swapLabels } = useActionHighlight(
    game?.actionVersion ?? 0,
    game?.log ?? [],
    players,
  )

  // Remote SFX — plays sounds for other players' actions; local actions use playSfx() directly
  useRemoteSfx(game?.actionVersion ?? 0, game?.log ?? [], players, user?.uid)

  // Remote power toast — subtle notification when another player uses a power card
  useRemotePowerToast(game?.actionVersion ?? 0, game?.log ?? [], players, user?.uid)

  // Chaos shuffle animation — detects rearrange power and returns animated player IDs
  const chaosAnimations = useChaosAnimation(game?.actionVersion ?? 0, game?.log ?? [], players)


  // Track if user was ever in playerOrder (distinguishes kicked from spectator)
  useEffect(() => {
    if (user && game?.playerOrder?.includes(user.uid)) {
      setWasPlayer(true) // eslint-disable-line react-hooks/set-state-in-effect
    }
  }, [user, game?.playerOrder])
  const isSpectator = !!(user && game && !game.playerOrder.includes(user.uid) && !wasPlayer
    && (game.status === 'active' || game.status === 'ending'))

  // Remote player flying card animations
  useRemoteAnimations(
    {
      game, players, localUserId: user?.uid, reduced,
      drawPileRef, discardPileRef, stagingRef, localPanelRef, otherPanelRefs,
      triggerFly, queueFly,
      startPileDraw, startDiscardTake, startSwapFromStaging, startDiscardAction,
    },
  )

  // All game action handlers, busy/modal state, keyboard shortcuts
  const {
    busy, modal, setModal, activeCard, activeCardSource, hasActiveCard, canDraw, canTakeDiscard, peekReveal,
    handleDrawPile, handleTakeDiscard, handleCancelDraw, handleSwap, handleDiscard,
    handleUsePower, handleSelectionConfirm, handleSelectionClick,
    handlePlayerSelect, handlePeekSelect, handleSwapConfirm, handleLockSelect,
    handleUnlockSelect, handleRearrangeSelect, handlePeekOpponentSelect, handlePeekAllOpponentSelect,
    handlePeekChoiceSelf, handlePeekChoiceOpponent, handleCancelPower,
  } = useGameActions({
    gameId, isMyTurn, isDrawPhase, isActionPhase, drawnCard,
    reduced, isDesktop, isSpectator, privateState: privateState ?? null,
    myLocks, uiMode, drawnCardDismissed,
    drawPileRef, discardPileRef, stagingRef, localPanelRef,
    choreo, startDiscardTake, startSwapFromStaging, startDiscardAction,
    startPileDraw, reconstructStaging, resetChoreo,
    triggerFly,
    selection, isSelecting, startSelection, selectTarget,
    confirmSelection,
    discardTop: game?.discardTop ?? null,
    peekAllowsOpponent: game?.settings?.peekAllowsOpponent ?? false,
    noMemoryMode,
    cardsPerPlayer,
  })

  const isDiscardFlow = activeCardSource === 'discard' || activeCardSource === 'discard-preview'
  const canResolveActiveCard = isMyTurn && (isActionPhase || isDiscardFlow)
  const canDropToDiscard = activeCardSource === 'pile'
  const hideLocalDiscardTop = isDiscardFlow || privateState?.drawnCardSource === 'discard'
  const stagingInteractive = stagingActive && isMyTurn && hasActiveCard && modal.type === 'none' && !isSelecting
  const { dropTarget, resolveDropTarget, updateDropTarget, clearDropTarget } = useStagedCardDrop({
    enabled: stagingInteractive,
    allowDiscardTarget: canDropToDiscard,
    lockedSlots: myLocks,
    localPanelRef,
    discardPileRef,
  })

  useEffect(() => {
    if (!stagingInteractive) clearDropTarget()
  }, [clearDropTarget, stagingInteractive])

  const handleStagingDragMove = useCallback(({ x, y }: StagingDragPoint) => {
    updateDropTarget(x, y)
  }, [updateDropTarget])

  const handleStagingDragEnd = useCallback(({ x, y, sourceRect }: StagingDragPoint) => {
    const target = resolveDropTarget(x, y)
    clearDropTarget()
    if (!stagingInteractive || !target) return

    if (target.kind === 'discard' && canDropToDiscard) {
      handleDiscard(sourceRect)
      return
    }

    if (target.kind === 'slot') {
      handleSwap(target.slotIndex, sourceRect)
    }
  }, [canDropToDiscard, clearDropTarget, handleDiscard, handleSwap, resolveDropTarget, stagingInteractive])

  const stagingDropHint = dropTarget?.kind === 'discard'
    ? 'Release to discard'
    : dropTarget?.kind === 'slot'
      ? `Release on slot #${dropTarget.slotIndex + 1}`
      : activeCardSource === 'discard-preview'
        ? 'Release on a slot to take it'
        : activeCardSource === 'discard'
          ? 'Release on a slot to finish the discard take'
      : null

  const localSlotOverlays = useMemo(() => {
    const base: Record<number, string> = user ? { ...(slotOverlays[user.uid] ?? {}) } : {}
    if (dropTarget?.kind === 'slot') {
      base[dropTarget.slotIndex] = '#6366f1'
    }
    return Object.keys(base).length > 0 ? base : null
  }, [dropTarget, slotOverlays, user])

  // Player order with local player first (for modals)
  const modalPlayerOrder = game ? [
    ...(user ? [user.uid] : []),
    ...game.playerOrder.filter((pid) => pid !== user?.uid),
  ] : []

  // Must be before any conditional early returns to satisfy Rules of Hooks
  // Spectators see ALL players as "other" (they have no local panel)
  const otherPlayers = useMemo(
    () => {
      const order = game?.playerOrder ?? []
      // If user is not in the game (spectator), show all players
      if (user && !order.includes(user.uid)) return order
      return order.filter((pid) => pid !== user?.uid)
    },
    [game?.playerOrder, user],
  )
  const currentTurnName = useMemo(
    // eslint-disable-next-line react-hooks/preserve-manual-memoization
    () => game?.currentTurnPlayerId ? (players[game.currentTurnPlayerId]?.displayName ?? 'Unknown') : null,
    [game?.currentTurnPlayerId, players],
  )


  if (loading || !user) {
    return <GameLoadingScreen />
  }

  if (!game) {
    return (
      <GameErrorScreen
        message={error ?? 'The game is unavailable right now.'}
        onRetry={() => void retry()}
        onGoHome={() => navigate('/')}
      />
    )
  }

  if (game.status === 'finished') {
    return <GameLoadingScreen message="Revealing all cards..." />
  }

  // Kicked player screen — shown when player is removed from playerOrder mid-game (not spectators)
  if (!game.playerOrder.includes(user.uid) && wasPlayer && (game.status === 'active' || game.status === 'ending')) {
    return <GameKickedScreen onGoHome={() => navigate('/')} />
  }

  // Selection mode props — passed to all PlayerPanels
  const selectionProps = isSelecting ? {
    selectionTargetType: currentTargetType,
    localPlayerId: user.uid,
    players,
    onSelectionClick: handleSelectionClick,
    onPlayerSelect: handlePlayerSelect,
    selectedTarget: selection.firstTarget,
    selectedSecondTarget: selection.secondTarget,
  } : {}

  const stagingSlot = (
    <StagingSlot
      ref={stagingRef}
      card={stagingCard}
      faceUp={stagingFaceUp}
      active={stagingActive}
      ownerColor={stagingOwnerColor}
      interactive={stagingInteractive}
      pending={stagingPending}
      dropHint={stagingDropHint}
      onDragMove={stagingInteractive ? handleStagingDragMove : undefined}
      onDragEnd={stagingInteractive ? handleStagingDragEnd : undefined}
      onDragCancel={clearDropTarget}
      onResolve={hasActiveCard && isMyTurn && (((drawnCardDismissed && activeCardSource === 'pile') || modal.type !== 'none')) && !isSelecting
        ? () => { setModal({ type: 'none' }); setDrawnCardDismissed(false) }
        : undefined}
    />
  )

  return (
    <div className={`min-h-dvh flex flex-col ${logPosition === 'left' ? '' : 'max-w-5xl mx-auto'}`}>
      {/* ─── Sticky Top Bar (v1.5 — 3-zone layout) ──────────── */}
      <div
        ref={headerRef}
      >
        <GameTopBar
          gameJoinCode={game.joinCode}
          drawPileCount={game.drawPileCount}
          isSpectator={isSpectator}
          isDevMode={devMode.isDevMode}
          unreadCount={chat.unreadCount}
          playerOrder={game.playerOrder}
          players={players}
          currentTurnPlayerId={game.currentTurnPlayerId}
          localPlayerId={user.uid}
          onCopyCode={() => {
            copyToClipboard(game.joinCode)
            toast.success('Room code copied!')
          }}
          onOpenMonitor={() => setShowMonitor(true)}
          onOpenSettings={() => setShowSettings(true)}
          onOpenPowerGuide={() => setShowPowerGuide(true)}
          onToggleChat={chat.toggleChat}
        />
      </div>

      {/* ─── Safe Layout Stack: banners push content down ────── */}
      <div ref={bannerRef} className="safe-layout-stack flex flex-col">
        {/* Last round banner — shows when someone called end */}
        {game.status === 'ending' && (
          <div className="px-3 md:px-5 pt-2">
            <div className="py-1.5 px-4 bg-red-900/25 border border-red-600/30 rounded-xl text-red-300 text-[11px] font-semibold text-center tracking-wide">
              FINAL ROUND — {game.endCalledBy && players[game.endCalledBy]
                ? `${players[game.endCalledBy].displayName} called end`
                : 'End called'
              }
            </div>
          </div>
        )}

        {/* Selection mode prompt banner */}
        {isSelecting && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ type: 'spring', stiffness: 350, damping: 30, mass: 0.5 }}
            className="px-3 md:px-5 pt-2"
          >
            <div
              role="status"
              aria-live="assertive"
              className="py-2 px-4 bg-amber-900/30 border border-amber-600/40 rounded-xl text-amber-300 text-xs font-semibold text-center"
            >
              {selection.phase === 'choosingTarget' && selection.constraint?.prompt}
              {selection.phase === 'choosingSecondTarget' && selection.constraint?.secondPrompt}
              {selection.phase === 'confirming' && (
                selection.constraint?.targetType === 'anyPlayerSlot' && selection.firstTarget && selection.secondTarget
                  ? `Confirm swap: ${players[selection.firstTarget.playerId]?.displayName ?? '?'}'s #${selection.firstTarget.slotIndex + 1} ↔ ${players[selection.secondTarget.playerId]?.displayName ?? '?'}'s #${selection.secondTarget.slotIndex + 1}`
                  : 'Ready — confirm your selection below'
              )}
            </div>
          </motion.div>
        )}
      </div>

      {/* ─── Main Content ─────────────────────────────────────── */}
      <div className={`flex-1 ${logPosition === 'left' ? 'flex' : 'flex flex-col p-3 md:p-4'}`}>

        {/* Left sidebar log — matches table zone height, scrolls internally */}
        {logPosition === 'left' && (
          <aside
            className="shrink-0 w-56 min-h-0 sticky self-start overflow-y-auto border-r pt-1 px-2"
            style={{
              top: 'var(--top-offset, 56px)',
              height: 'calc(100dvh - var(--top-offset, 56px) - 2rem)',
              maxHeight: 'min(800px, calc(100dvh - var(--top-offset, 56px) - 2rem))',
              borderColor: 'var(--border)',
            }}
          >
            <GameLog log={game.log} players={players} position="left" />
          </aside>
        )}

        <div className={`${logPosition === 'left' ? 'flex-1 min-w-0 flex flex-col max-w-5xl mx-auto p-3 md:p-4 w-full' : 'contents'}`}>

        {/* Turn queue — mobile only (desktop shows in top bar) */}
        <div className="md:hidden">
          <TurnQueue
            playerOrder={game.playerOrder}
            players={players}
            currentTurnPlayerId={game.currentTurnPlayerId}
            localPlayerId={user.uid}
          />
        </div>

        {/* Turn indicator */}
        {(() => {
          const curPid = game.currentTurnPlayerId
          const curColor = curPid
            ? getPlayerColor(players[curPid]?.seatIndex ?? 0, players[curPid]?.colorKey)
            : null
          return (
            <motion.div
              key={curPid}
              initial={{ opacity: 0, y: -8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 24, mass: 0.6 }}
              aria-live="polite"
              aria-atomic="true"
              className={`flex items-center justify-center gap-2 py-2.5 px-5 rounded-xl mb-3 font-semibold tracking-wide ${
                isMyTurn
                  ? 'bg-emerald-900/30 border border-emerald-500/40 text-emerald-300 shadow-md shadow-emerald-500/10 text-sm'
                  : 'bg-surface-panel border border-border-subtle text-muted-foreground text-xs'
              }`}
            >
              {isMyTurn ? (
                <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0 bg-emerald-400 animate-pulse" />
              ) : curColor ? (
                <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: curColor.solid }} />
              ) : null}
              {isMyTurn ? (
                isDiscardFlow
                  ? activeCardSource === 'discard-preview'
                    ? 'Discard selected \u2014 swap it into a slot or cancel to draw from the pile'
                    : 'Discard taken \u2014 swap it into a slot or cancel the take'
                  : isDrawPhase
                    ? 'Your turn \u2014 draw from the pile or discard'
                    : hasActiveCard ? 'Choose: swap a card, discard, or use a power' : 'Swap, discard, or use a power'
              ) : (
                `Waiting for ${currentTurnName}...`
              )}
            </motion.div>
          )
        })()}

        {layout === 'table' ? (
          /* ─── TABLE LAYOUT ─── Poker-table circular arrangement ─── */
          (() => {
            const seatPositions = getSeatPositions(otherPlayers.length)
            const panelW = otherPlayers.length <= 3 ? '220px' : otherPlayers.length <= 5 ? '205px' : '190px'
            return (
              <>
              <div
                className="table-zone relative w-full mb-4 pt-2"
                style={{
                  /* Fill remaining viewport below header+banners, clamped for sanity */
                  minHeight: 'max(400px, calc(100dvh - var(--top-offset, 56px) - 7rem))',
                  maxHeight: 'min(780px, calc(100dvh - var(--top-offset, 56px) - 3rem))',
                }}
              >
                {/* Table surface — oval felt gradient (themed via CSS vars) */}
                <div
                  className="absolute rounded-[50%] pointer-events-none table-felt"
                  style={{
                    left: '5%', right: '5%', top: '3%', bottom: '6%',
                  }}
                />

                {/* Center: Draw + Staging + Discard piles */}
                <div className="pile-zone absolute left-1/2 top-[46%] -translate-x-1/2 -translate-y-1/2 flex items-center gap-5 z-10">
                  <div className={`text-center${canDraw ? ' pile-interactive' : ''}`} ref={drawPileRef}>
                    <p className="text-[10px] text-muted-foreground mb-1">Draw</p>
                    <div className="pile-stack">
                    <span className="l7-stack-sheen" aria-hidden="true" />
                    <CardView
                      faceUp={false}
                      size="md"
                      onClick={canDraw ? handleDrawPile : undefined}
                      disabled={!canDraw}
                      highlight={canDraw}
                      label={`${game.drawPileCount}`}
                    />
                    </div>
                  </div>
                  {/* Staging slot — shows local choreo or remote staging */}
                  {stagingSlot}
                  <div
                    className={`text-center relative${canTakeDiscard ? ' pile-interactive' : ''}${dropTarget?.kind === 'discard' ? ' pile-interactive' : ''}`}
                    ref={discardPileRef}
                    style={dropTarget?.kind === 'discard'
                      ? { filter: 'drop-shadow(0 0 18px rgba(251,191,36,0.28))' }
                      : undefined}
                  >
                    <p className="text-[10px] text-muted-foreground mb-1">Discard</p>
                    {game.discardTop && !hideLocalDiscardTop ? (
                      <div className="relative">
                        <CardView
                          card={game.discardTop}
                          faceUp
                          size="md"
                          onClick={canTakeDiscard ? handleTakeDiscard : undefined}
                          disabled={!canTakeDiscard}
                          highlight={canTakeDiscard}
                        />
                        {/* Section 5: Discard flip overlay */}
                        <DiscardFlip discardTop={game.discardTop} reduced={reduced} />
                      </div>
                    ) : (
                      <div className="w-20 h-28 rounded-xl border-2 border-dashed border-border-subtle flex items-center justify-center" title="Discard is empty">
                        <span className="text-muted-foreground text-[10px]">Empty</span>
                      </div>
                    )}
                  </div>
                </div>{/* end pile-zone */}

                {/* Other players arranged around the table */}
                {otherPlayers.map((pid, idx) => {
                  const pos = seatPositions[idx]
                  const isTheirTurn = game.currentTurnPlayerId === pid
                  return (
                    <div
                      key={pid}
                      ref={(el) => { otherPanelRefs.current[pid] = el }}
                      className={`absolute z-10 seat-ground${!isTheirTurn && game.currentTurnPlayerId ? ' player-waiting' : ''}`}
                      style={{
                        left: `${pos.left}%`,
                        top: `${pos.top}%`,
                        transform: 'translate(-50%, -50%)',
                        maxWidth: panelW,
                        width: otherPlayers.length <= 4 ? '42%' : otherPlayers.length <= 6 ? '38%' : '35%',
                        minWidth: otherPlayers.length <= 5 ? '190px' : '175px',
                        overflow: 'visible',
                      }}
                    >
                      <PlayerPanel
                        playerId={pid}
                        displayName={players[pid]?.displayName ?? 'Unknown'}
                        isCurrentTurn={game.currentTurnPlayerId === pid}
                        isLocalPlayer={false}
                        seatIndex={players[pid]?.seatIndex ?? 0}
                        colorKey={players[pid]?.colorKey}
                        connected={players[pid]?.connected ?? false}
                        locks={normalizeLocks(players[pid]?.locks, cardsPerPlayer)}
                        lockedBy={players[pid]?.lockedBy}
                        actionHighlight={actionHighlights[pid] ?? null}
                        chatBubble={chatBubbles[pid] ?? null}
                        queueNumber={queueNumbers[pid] ?? null}
                        slotOverlays={slotOverlays[pid] ?? null}
                        swapLabels={swapLabels[pid] ?? null}
                        chaosAnimation={!!chaosAnimations[pid]}
                        devAllHands={devMode.isDevMode && devMode.privileges?.canSeeAllCards ? devMode.allPlayerHands : null}
                        localPrivateState={privateState ?? null}
                        cardsPerPlayer={cardsPerPlayer}
                        {...selectionProps}
                      />
                      {game.currentTurnPlayerId === pid && turnTimer.remaining !== null && (
                        <div className="mt-1 px-1">
                          <TurnTimer remaining={turnTimer.remaining} total={turnTimer.total} isMyTurn={false} />
                        </div>
                      )}
                    </div>
                  )
                })}

                {/* Local player at bottom center (hidden for spectators) */}
                {!isSpectator && (
                <div
                  className="absolute left-1/2 z-10"
                  ref={localPanelRef}
                  style={{ bottom: 'max(8px, env(safe-area-inset-bottom, 8px))', transform: 'translateX(-50%)', maxWidth: cardsPerPlayer >= 4 ? '420px' : '340px', width: cardsPerPlayer >= 4 ? '96%' : '82%' }}
                >
                  <PlayerPanel
                    playerId={user.uid}
                    displayName={players[user.uid]?.displayName ?? 'You'}
                    isCurrentTurn={isMyTurn}
                    isLocalPlayer
                    privateState={peekReveal ? {
                      ...privateState!,
                      known: { ...myKnown, [String(peekReveal.slot)]: peekReveal.card },
                    } : privateState}
                    seatIndex={players[user.uid]?.seatIndex ?? 0}
                    colorKey={players[user.uid]?.colorKey}
                    connected
                    locks={myLocks}
                    lockedBy={myPlayer?.lockedBy}
                    onSlotClick={canResolveActiveCard ? handleSwap : undefined}
                    slotClickable={canResolveActiveCard && hasActiveCard && modal.type === 'none' && !isSelecting}
                    actionHighlight={actionHighlights[user.uid] ?? null}
                    queueNumber={queueNumbers[user.uid] ?? null}
                    slotOverlays={localSlotOverlays}
                    swapLabels={swapLabels[user.uid] ?? null}
                    chaosAnimation={!!chaosAnimations[user.uid]}
                    devShowAllCards={devMode.isDevMode && (devMode.privileges?.canSeeAllCards ?? false)}
                    cardsPerPlayer={cardsPerPlayer}
                    {...selectionProps}
                  />
                  {isMyTurn && turnTimer.remaining !== null && (
                    <div className="mt-1 px-1">
                      <TurnTimer remaining={turnTimer.remaining} total={turnTimer.total} isMyTurn={true} />
                    </div>
                  )}
                </div>
                )}
              </div>
              {/* Action Bar for table layout — below table zone, clear gap */}
              {!isSpectator && uiMode === 'actionbar' && (
                <div className="mx-auto mb-4 mt-2" style={{ maxWidth: cardsPerPlayer >= 4 ? '460px' : '380px', width: '90%' }}>
                  <ActionBar
                    card={isMyTurn && hasActiveCard ? activeCard : null}
                    visible={modal.type === 'none' && (!drawnCardDismissed || activeCardSource !== 'pile')}
                    locks={myLocks}
                    powerAssignments={powerAssignments}
                    spentPowerCardIds={spentPowerCardIds}
                    drawnCardSource={activeCardSource}
                    onSwap={handleSwap}
                    onDiscard={handleDiscard}
                    onUsePower={handleUsePower}
                    onClose={handleCancelDraw}
                    selection={selection}
                    onSelectionConfirm={handleSelectionConfirm}
                    onSelectionCancel={cancelSelection}
                    onSelectionGoBack={goBackSelection}
                    isDesktop={isDesktop}
                    players={players}
                    hasAnyLocks={hasAnyLocks}
                  />
                </div>
              )}
              </>
            )
          })()
        ) : (
          /* ─── CLASSIC LAYOUT ─── Original grid layout ─── */
          <>
            {/* Other players */}
            {otherPlayers.length > 0 && (
              <div className={`grid gap-3 mb-4 ${
                otherPlayers.length <= 2 ? 'grid-cols-1 sm:grid-cols-2' :
                otherPlayers.length <= 4 ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' :
                'grid-cols-2 sm:grid-cols-3 lg:grid-cols-3'
              }`}>
                {otherPlayers.map((pid) => {
                  const isTheirTurn = game.currentTurnPlayerId === pid
                  return (
                  <div
                    key={pid}
                    ref={(el) => { otherPanelRefs.current[pid] = el }}
                    className={!isTheirTurn && game.currentTurnPlayerId ? 'player-waiting' : ''}
                  >
                    <PlayerPanel
                      playerId={pid}
                      displayName={players[pid]?.displayName ?? 'Unknown'}
                      isCurrentTurn={isTheirTurn}
                      isLocalPlayer={false}
                      seatIndex={players[pid]?.seatIndex ?? 0}
                      colorKey={players[pid]?.colorKey}
                      connected={players[pid]?.connected ?? false}
                      locks={normalizeLocks(players[pid]?.locks, cardsPerPlayer)}
                      lockedBy={players[pid]?.lockedBy}
                      actionHighlight={actionHighlights[pid] ?? null}
                      chatBubble={chatBubbles[pid] ?? null}
                      queueNumber={queueNumbers[pid] ?? null}
                      slotOverlays={slotOverlays[pid] ?? null}
                      swapLabels={swapLabels[pid] ?? null}
                      chaosAnimation={!!chaosAnimations[pid]}
                      devAllHands={devMode.isDevMode && devMode.privileges?.canSeeAllCards ? devMode.allPlayerHands : null}
                      localPrivateState={privateState ?? null}
                      cardsPerPlayer={cardsPerPlayer}
                      {...selectionProps}
                    />
                    {isTheirTurn && turnTimer.remaining !== null && (
                      <div className="mt-1 px-1">
                        <TurnTimer remaining={turnTimer.remaining} total={turnTimer.total} isMyTurn={false} />
                      </div>
                    )}
                  </div>
                  )
                })}
              </div>
            )}

            {/* Table area: Draw + Staging + Discard */}
            <div className="classic-pile-zone flex items-center justify-center gap-5 sm:gap-6 mb-4" aria-busy={busy} aria-label="Card piles">
              <div className={`text-center${canDraw ? ' pile-interactive' : ''}`} ref={drawPileRef}>
                <p className="text-xs text-muted-foreground mb-2">Draw Pile</p>
                <div className="pile-stack">
                <span className="l7-stack-sheen" aria-hidden="true" />
                <CardView
                  faceUp={false}
                  size="lg"
                  onClick={canDraw ? handleDrawPile : undefined}
                  disabled={!canDraw}
                  highlight={canDraw}
                  label={`${game.drawPileCount} left`}
                />
                </div>
              </div>

              {/* Staging slot — shows local choreo or remote staging */}
              {stagingSlot}

              <div
                className={`text-center relative${canTakeDiscard ? ' pile-interactive' : ''}${dropTarget?.kind === 'discard' ? ' pile-interactive' : ''}`}
                ref={discardPileRef}
                style={dropTarget?.kind === 'discard'
                  ? { filter: 'drop-shadow(0 0 18px rgba(251,191,36,0.28))' }
                  : undefined}
              >
                <p className="text-xs text-muted-foreground mb-2">Discard</p>
                {game.discardTop && !hideLocalDiscardTop ? (
                  <div className="relative">
                    <CardView
                      card={game.discardTop}
                      faceUp
                      size="lg"
                      onClick={canTakeDiscard ? handleTakeDiscard : undefined}
                      disabled={!canTakeDiscard}
                      highlight={canTakeDiscard}
                    />
                    {/* Section 5: Discard flip overlay */}
                    <DiscardFlip discardTop={game.discardTop} reduced={reduced} />
                  </div>
                ) : (
                  <div className="w-24 h-34 rounded-xl border-2 border-dashed border-border-subtle flex items-center justify-center" title="Discard is empty">
                    <span className="text-muted-foreground text-xs">Empty</span>
                  </div>
                )}
              </div>
            </div>

            {/* Local player (hidden for spectators) */}
            {!isSpectator && (
            <div className="mb-4" ref={localPanelRef}>
              <PlayerPanel
                playerId={user.uid}
                displayName={players[user.uid]?.displayName ?? 'You'}
                isCurrentTurn={isMyTurn}
                isLocalPlayer
                privateState={peekReveal ? {
                  ...privateState!,
                  known: { ...myKnown, [String(peekReveal.slot)]: peekReveal.card },
                } : privateState}
                seatIndex={players[user.uid]?.seatIndex ?? 0}
                colorKey={players[user.uid]?.colorKey}
                connected
                locks={myLocks}
                lockedBy={myPlayer?.lockedBy}
                onSlotClick={canResolveActiveCard ? handleSwap : undefined}
                slotClickable={canResolveActiveCard && hasActiveCard && modal.type === 'none' && !isSelecting}
                actionHighlight={actionHighlights[user.uid] ?? null}
                queueNumber={queueNumbers[user.uid] ?? null}
                slotOverlays={localSlotOverlays}
                swapLabels={swapLabels[user.uid] ?? null}
                chaosAnimation={!!chaosAnimations[user.uid]}
                devShowAllCards={devMode.isDevMode && (devMode.privileges?.canSeeAllCards ?? false)}
                cardsPerPlayer={cardsPerPlayer}
                {...selectionProps}
              />
              {isMyTurn && turnTimer.remaining !== null && (
                <div className="mt-1 px-1">
                  <TurnTimer remaining={turnTimer.remaining} total={turnTimer.total} isMyTurn={true} />
                </div>
              )}
              {/* Action Bar — inline alternative to drawn card modal */}
              {!isSpectator && uiMode === 'actionbar' && (
                <ActionBar
                  card={isMyTurn && hasActiveCard ? activeCard : null}
                  visible={modal.type === 'none' && (!drawnCardDismissed || activeCardSource !== 'pile')}
                  locks={myLocks}
                  powerAssignments={powerAssignments}
                  spentPowerCardIds={spentPowerCardIds}
                  drawnCardSource={activeCardSource}
                  onSwap={handleSwap}
                  onDiscard={handleDiscard}
                  onUsePower={handleUsePower}
                  onClose={handleCancelDraw}
                  selection={selection}
                  onSelectionConfirm={handleSelectionConfirm}
                  onSelectionCancel={cancelSelection}
                  onSelectionGoBack={goBackSelection}
                  isDesktop={isDesktop}
                  players={players}
                  hasAnyLocks={hasAnyLocks}
                />
              )}
            </div>
            )}
          </>
        )}

        {/* Spectator info bar — shown in classic layout when spectating */}
        {isSpectator && layout !== 'table' && (
          <div className="mb-4 py-3 px-4 rounded-xl border text-center" style={{ background: 'var(--panel)', borderColor: 'var(--border)' }}>
            <span className="text-violet-300 text-sm font-semibold">You are spectating this game</span>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Watch the action unfold in real-time</p>
          </div>
        )}

        {/* Game Log — bottom position (default) */}
        {logPosition === 'bottom' && (
          <GameLog log={game.log} players={players} position="bottom" />
        )}

        {/* Safe area padding for iOS home indicator */}
        <div style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }} />

        </div>{/* end of content wrapper for left-log layout */}
      </div>


      {/* ─── Modals ─────────────────────────────────────────── */}
      <GameModals
        modal={modal}
        setModal={setModal}
        game={game}
        players={players}
        localPlayerId={user.uid}
        modalPlayerOrder={modalPlayerOrder}
        isMyTurn={isMyTurn}
        hasDrawnCard={hasActiveCard}
        drawnCard={activeCard}
        myLocks={myLocks}
        myKnown={myKnown}
        powerAssignments={powerAssignments}
        spentPowerCardIds={spentPowerCardIds}
        drawnCardSource={activeCardSource}
        hasAnyLocks={hasAnyLocks}
        uiMode={uiMode}
        drawnCardDismissed={drawnCardDismissed}
        onSwap={handleSwap}
        onDiscard={handleDiscard}
        onUsePower={handleUsePower}
        onCancelDraw={handleCancelDraw}
        onDismissDrawn={() => setDrawnCardDismissed(true)}
        onPeekSelect={handlePeekSelect}
        onSwapConfirm={handleSwapConfirm}
        onLockSelect={handleLockSelect}
        onUnlockSelect={handleUnlockSelect}
        onRearrangeSelect={handleRearrangeSelect}
        onPeekOpponentSelect={handlePeekOpponentSelect}
        onPeekAllOpponentSelect={handlePeekAllOpponentSelect}
        onPeekChoiceSelf={handlePeekChoiceSelf}
        onPeekChoiceOpponent={handlePeekChoiceOpponent}
        onCancelPower={handleCancelPower}
        showPowerGuide={showPowerGuide}
        onClosePowerGuide={() => setShowPowerGuide(false)}
        showSettings={showSettings}
        onCloseSettings={() => setShowSettings(false)}
        layout={layout}
        onToggleLayout={toggleLayout}
        uiModeValue={uiMode}
        onToggleUiMode={toggleUiMode}
        logPosition={logPosition}
        onToggleLogPosition={toggleLogPosition}
        isMobile={isMobile}
        canLogSidebar={canLogSidebar}
        otherPlayers={otherPlayers}
        voteKickActive={!!game.voteKick?.active}
        onVoteKick={(targetId) => {
          setShowSettings(false)
          initiateVoteKick(gameId!, targetId).catch((e) => toast.error((e as Error).message))
        }}
        onLeaveGame={async () => {
          if (!confirm('Are you sure you want to leave? You cannot rejoin this game.')) return
          setShowSettings(false)
          if (isSelecting) cancelSelection()
          resetChoreo()
          try {
            await leaveGame(gameId!)
          } catch (e) {
            console.error('Failed to leave game:', e)
          }
          navigate('/')
        }}
        showDevModal={false}
        onCloseDevModal={() => {}}
        devMode={devMode}
        onOpenDiscardReorder={() => setShowDiscardReorder(true)}
        showMonitor={showMonitor}
        onCloseMonitor={() => setShowMonitor(false)}
        cardsPerPlayer={cardsPerPlayer}
      />

      {/* Legacy flying card (remote player animations) */}
      {flyingCard.active && flyingCard.from && flyingCard.to && (
        <FlyingCard
          from={flyingCard.from}
          to={flyingCard.to}
          faceUp={flyingCard.faceUp}
          card={flyingCard.card}
          ownerColor={flyingCard.ownerColor}
          onComplete={clearFly}
          reduced={reduced}
        />
      )}

      {/* Choreography flying card (local player multi-step animations) */}
      {choreo.phase !== 'idle' && choreo.phase !== 'staging' && choreo.flyFrom && choreo.flyTo && (
        <FlyingCard
          from={choreo.flyFrom}
          to={choreo.flyTo}
          faceUp={choreo.flyFaceUp}
          card={choreo.flyCard}
          ownerColor={choreo.flyOwnerColor}
          onComplete={completeFlight}
          reduced={reduced}
          duration={choreo.flyDuration}
        />
      )}

      {/* Vote-Kick Modal — shows for players only, not spectators */}
      {!isSpectator && <VoteKickModal
        voteKick={game.voteKick ?? null}
        localPlayerId={user.uid}
        onVoteYes={() => {
          castVoteKick(gameId!, true).catch((e) => toast.error((e as Error).message))
        }}
        onVoteNo={() => {
          castVoteKick(gameId!, false).catch((e) => toast.error((e as Error).message))
        }}
        onCancel={() => {
          cancelVoteKick(gameId!).catch((e) => toast.error((e as Error).message))
        }}
        isInitiatorOrHost={
          user.uid === game.voteKick?.startedBy || user.uid === game.hostId
        }
      />}

      <ChatPanel
        open={chat.isOpen}
        messages={chat.messages}
        localUserId={user.uid}
        onSend={isSpectator ? () => {} : chat.send}
        onClose={chat.closeChat}
        isDesktop={isDesktop}
      />

      {/* Dev-only: Draw Pile Reorder Modal */}
      {devMode.isDevMode && devMode.privileges?.canReorderDiscardPile && (
        <DiscardReorderModal
          open={showDiscardReorder}
          drawPileCards={devMode.drawPileCards}
          onApply={async (reordered) => { await devReorderDrawPile(gameId!, reordered) }}
          onClose={() => setShowDiscardReorder(false)}
        />
      )}

      <FeedbackModal
        open={showFeedback}
        onClose={() => setShowFeedback(false)}
        onDevActivate={devMode.activate}
      />

      <VersionLabel onOpenFeedback={() => setShowFeedback(true)} />

      <div className="fixed bottom-2 right-3 text-xs md:text-sm font-medium select-none z-10" style={{ color: 'var(--watermark)' }}>
        Built by Kamal Hazriq
      </div>
    </div>
  )
}
