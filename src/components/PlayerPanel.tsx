import { memo, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import CardView from './CardView'
import type { Card, PrivatePlayerDoc, LockInfo } from '../lib/types'
import { getPlayerColor } from '../lib/playerColors'
import type { SelectionTargetType, SelectedTarget } from '../hooks/useSelectionMode'
import { isSlotSelectable } from '../hooks/useSelectionMode'
import { usePerformanceMode } from '../hooks/usePerformanceMode'

export interface ActionHighlight {
  color: string
  label: string
}

interface PlayerPanelProps {
  displayName: string
  playerId: string
  isCurrentTurn: boolean
  isLocalPlayer: boolean
  privateState?: PrivatePlayerDoc | null
  seatIndex: number
  connected: boolean
  locks: [boolean, boolean, boolean]
  lockedBy?: [LockInfo, LockInfo, LockInfo]
  onSlotClick?: (slotIndex: number) => void
  slotClickable?: boolean
  /** Temporary action highlight — pulsing colored ring with label */
  actionHighlight?: ActionHighlight | null
  /** Floating chat bubble text — UI only, auto-cleared by parent */
  chatBubble?: string | null
  /** Queue number (1 = current turn, 2 = next, etc.) */
  queueNumber?: number | null
  /** Per-slot effect overlays: slotIndex → color (actor's color) */
  slotOverlays?: Record<number, string> | null
  /** Per-slot swap labels: slotIndex → label string (e.g. "↔ Kamal #2") */
  swapLabels?: Record<number, string> | null

  // ─── Selection mode props ──────────────────────────
  /** When non-null, we're in selection mode. Provides the current target type. */
  selectionTargetType?: SelectionTargetType | null
  /** Local player ID — used for selectability checks */
  localPlayerId?: string
  /** Players map — used for selectability checks */
  players?: Record<string, import('../lib/types').PlayerDoc>
  /** Called when a slot is clicked during selection mode */
  onSelectionClick?: (target: SelectedTarget) => void
  /** Called when a player is clicked during 'anyPlayer' selection (rearrange) */
  onPlayerSelect?: (playerId: string) => void
  /** The currently selected first target (highlighted with a badge) */
  selectedTarget?: SelectedTarget | null
  /** The currently selected second target (highlighted with a badge) */
  selectedSecondTarget?: SelectedTarget | null
  /** Stamp overlay for lock/unlock choreography */
  stampOverlay?: 'lock' | 'unlock' | null
  /** Lobby-chosen color key (index into LOBBY_COLORS) — overrides seat color */
  colorKey?: number | null
  /** Dev mode: all players' private data — when present, remote cards shown face-up */
  devAllHands?: Record<string, PrivatePlayerDoc> | null
  /** Dev mode: show local player's own cards face-up (canSeeAllCards permission) */
  devShowAllCards?: boolean
  /** Local player's private state — used to check opponent_known for this panel's player */
  localPrivateState?: PrivatePlayerDoc | null
  /** Chaos shuffle animation — when true, cards do a lift-rotate-shuffle-settle animation */
  chaosAnimation?: boolean
}

const EMPTY_LOCKED_BY: [LockInfo, LockInfo, LockInfo] = [
  { lockerId: null, lockerName: null },
  { lockerId: null, lockerName: null },
  { lockerId: null, lockerName: null },
]

function PlayerPanel({
  displayName,
  playerId,
  isCurrentTurn,
  isLocalPlayer,
  privateState,
  seatIndex,
  connected,
  locks,
  lockedBy,
  onSlotClick,
  slotClickable = false,
  actionHighlight,
  chatBubble,
  queueNumber,
  slotOverlays,
  swapLabels,
  selectionTargetType,
  localPlayerId,
  players,
  onSelectionClick,
  onPlayerSelect,
  selectedTarget,
  selectedSecondTarget,
  stampOverlay,
  colorKey,
  devAllHands,
  devShowAllCards = false,
  localPrivateState,
  chaosAnimation = false,
}: PlayerPanelProps) {
  const hand = privateState?.hand ?? []
  const known = privateState?.known ?? {}
  // Dev mode: use actual hand data for remote players if available
  const devHand = !isLocalPlayer ? devAllHands?.[playerId]?.hand : undefined
  // Opponent knowledge: cards this local player has peeked from this opponent
  const opponentKnown = !isLocalPlayer ? (localPrivateState?.opponent_known?.[playerId] ?? {}) : {}
  const lockInfos = lockedBy ?? EMPTY_LOCKED_BY
  const color = useMemo(() => getPlayerColor(seatIndex, colorKey), [seatIndex, colorKey])
  const perfMode = usePerformanceMode()

  const inSelectionMode = selectionTargetType != null

  // For 'anyPlayer' selection: is this whole panel clickable?
  const isPlayerTarget = selectionTargetType === 'anyPlayer' && playerId !== localPlayerId

  // For 'anyPlayer': is this panel the currently selected target? (solid highlight, not just clickable pulse)
  const isSelectedPlayer = selectionTargetType === 'anyPlayer' && selectedTarget?.playerId === playerId

  // Dim the entire panel if in selection mode and no slots are selectable here
  const panelDimmed = inSelectionMode && !isPlayerTarget && !isSelectedPlayer && localPlayerId && players
    ? ![0, 1, 2].some((i) =>
        isSlotSelectable(selectionTargetType!, playerId, i, localPlayerId, players),
      )
    : false

  const panelStyle = useMemo(() => ({
    borderLeftWidth: '4px',
    borderLeftColor: color.solid,
    ...(isCurrentTurn && !perfMode ? { '--turn-glow-color': color.solid + '60' } as React.CSSProperties : {}),
  }), [color.solid, isCurrentTurn, perfMode])

  const panelClassName = useMemo(() => `
    relative rounded-2xl ${isLocalPlayer ? 'p-4' : 'px-2.5 py-2.5 pb-3'} backdrop-blur-sm transition-opacity
    ${panelDimmed ? 'opacity-40' : ''}
    ${isLocalPlayer && isCurrentTurn
      ? `bg-emerald-900/30 border border-amber-500/40 ring-1 ring-emerald-500/20${perfMode ? '' : ' turn-glow'}`
      : isCurrentTurn
        ? `bg-emerald-900/30 border border-emerald-500/40${perfMode ? '' : ' turn-glow'}`
        : isLocalPlayer
          ? 'bg-amber-900/10 border border-amber-500/25'
          : 'bg-slate-800/30 border border-slate-700/40'
    }
    ${isSelectedPlayer ? 'ring-2 ring-amber-400 bg-amber-900/30 shadow-lg shadow-amber-500/20' : isPlayerTarget ? 'cursor-pointer ring-2 ring-amber-400/60 hover:ring-amber-300 bg-amber-900/20 shadow-lg shadow-amber-500/10 selection-pulse-panel' : ''}
  `, [isLocalPlayer, isCurrentTurn, panelDimmed, isPlayerTarget, isSelectedPlayer, perfMode])

  return (
    <div
      className={panelClassName}
      style={panelStyle}
      onClick={isPlayerTarget ? () => onPlayerSelect?.(playerId) : undefined}
    >
      {/* Chat bubble — floating well above panel to avoid overlap */}
      <AnimatePresence>
        {chatBubble && (
          <motion.div
            key={chatBubble}
            initial={{ opacity: 0, y: 8, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.9 }}
            transition={{ type: 'spring', damping: 20, stiffness: 300 }}
            className="absolute left-0 right-0 pointer-events-none"
            style={{ bottom: 'calc(100% + 10px)', zIndex: 50 }}
          >
            <div
              className="inline-block max-w-full px-2.5 py-1 rounded-xl text-[11px] font-medium text-white break-words whitespace-normal"
              style={{ backgroundColor: color.solid, boxShadow: '0 4px 14px rgba(0,0,0,0.35)', maxHeight: '4.5em', overflowY: 'auto' }}
            >
              {chatBubble}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Action highlight overlay — expanding pulse ring */}
      {actionHighlight && (
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 rounded-2xl pointer-events-none z-10 action-pulse-ring"
          style={{
            boxShadow: `inset 0 0 0 2.5px ${actionHighlight.color}, 0 0 16px ${actionHighlight.color}, 0 0 32px ${actionHighlight.color}20`,
          }}
        >
          <span
            className="absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] font-bold px-2.5 py-0.5 rounded-full whitespace-nowrap shadow-lg"
            style={{ backgroundColor: actionHighlight.color, color: '#fff' }}
          >
            {actionHighlight.label}
          </span>
        </motion.div>
      )}

      {/* Stamp overlay for lock/unlock choreography */}
      <AnimatePresence>
        {stampOverlay && (
          <motion.div
            initial={{ opacity: 0, scale: 2, rotate: -15 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ type: 'spring', damping: 12, stiffness: 300 }}
            className="absolute inset-0 z-30 pointer-events-none flex items-center justify-center"
          >
            <div className={`text-4xl ${stampOverlay === 'lock' ? 'text-red-400' : 'text-cyan-400'} drop-shadow-lg`}>
              {stampOverlay === 'lock' ? '🔒' : '🔓'}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex items-center gap-1.5 mb-2.5">
        <div
          className="w-2 h-2 rounded-full shrink-0"
          style={{ backgroundColor: connected ? color.solid : '#64748b' }}
        />
        <span
          className="font-semibold text-sm truncate"
          style={{ color: isLocalPlayer ? '#fcd34d' : color.text }}
        >
          {displayName}
        </span>
        {queueNumber != null && (
          <span
            className="px-1 py-0.5 rounded text-[9px] font-bold shrink-0"
            style={{ backgroundColor: color.bg, color: color.text }}
          >
            #{queueNumber}
          </span>
        )}
        {isLocalPlayer && (
          <span className="px-1.5 py-0.5 bg-amber-500/15 text-amber-300 text-[9px] font-bold rounded shrink-0">
            YOU
          </span>
        )}
        {isCurrentTurn && (
          <span className="ml-auto text-[10px] font-semibold text-emerald-400 animate-pulse motion-reduce:animate-none shrink-0">
            {isLocalPlayer ? 'Your turn' : 'Playing...'}
          </span>
        )}
        {isPlayerTarget && (
          <span className="ml-auto px-2 py-0.5 bg-amber-500/30 border border-amber-400/60 text-amber-200 text-[10px] font-bold rounded-md animate-pulse shrink-0 shadow-sm shadow-amber-500/20">
            TAP TO SELECT
          </span>
        )}
      </div>

      <div className={`flex ${isLocalPlayer ? 'gap-3' : 'gap-1.5 sm:gap-2'} justify-center overflow-visible`}>
        {[0, 1, 2].map((i) => {
          const card = hand[i] as Card | undefined
          // Own known: from game_private_state.known (self peek, swap)
          // Dev visibility: show all own cards when dev canSeeAllCards is active
          // Opponent known: from localPrivateState.opponent_known (peek opponent)
          const ownKnownCard = known[String(i)]
          const devKnownCard = isLocalPlayer && devShowAllCards ? privateState?.hand?.[i] : undefined
          const oppKnownCard = !isLocalPlayer ? opponentKnown[String(i)] : undefined
          const knownCard = ownKnownCard ?? devKnownCard ?? oppKnownCard
          const isKnown = !!knownCard
          const isLocked = locks[i]
          const lockInfo = lockInfos[i]
          const slotColor = slotOverlays?.[i]
          const swapLabel = swapLabels?.[i]

          // Selection mode: is this slot selectable?
          // Pass selectedTarget (first pick) so same-player swap is blocked for second pick.
          const slotSelectable = inSelectionMode && selectionTargetType !== 'anyPlayer'
            && localPlayerId && players
            ? isSlotSelectable(selectionTargetType!, playerId, i, localPlayerId, players, selectedTarget)
            : false

          // Is this slot the currently selected first or second target?
          // For 'anyPlayer' (chaos), selection is panel-level — don't highlight individual slots
          const isSelected = selectionTargetType !== 'anyPlayer' && selectedTarget?.playerId === playerId && selectedTarget?.slotIndex === i
          const isSecondSelected = selectionTargetType !== 'anyPlayer' && selectedSecondTarget?.playerId === playerId && selectedSecondTarget?.slotIndex === i

          const handleSlotClick = () => {
            if (inSelectionMode && slotSelectable && onSelectionClick) {
              onSelectionClick({ playerId, slotIndex: i })
            } else if (!inSelectionMode && slotClickable && onSlotClick) {
              onSlotClick(i)
            }
          }

          const slotWrapper = (child: React.ReactNode) => (
            <div key={i} className={`relative${chaosAnimation ? ' chaos-shuffle' : ''}`} data-slot={i} style={chaosAnimation ? { animationDelay: `${i * 80}ms` } as React.CSSProperties : undefined}>
              {child}

              {/* Effect overlay (action highlights) */}
              {slotColor && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 rounded-xl pointer-events-none z-10 slot-pulse-ring"
                  style={{
                    boxShadow: `inset 0 0 0 2px ${slotColor}, 0 0 12px ${slotColor}80, 0 0 24px ${slotColor}30`,
                  }}
                />
              )}

              {/* Swap label — shows swap partner (e.g. "↔ Kamal #2") */}
              {swapLabel && (
                <motion.div
                  initial={{ opacity: 0, y: 4, scale: 0.85 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4 }}
                  className="absolute -top-6 left-1/2 -translate-x-1/2 z-20 pointer-events-none whitespace-nowrap"
                >
                  <span
                    className="px-2 py-0.5 rounded-md text-[9px] font-bold shadow-lg"
                    style={{
                      backgroundColor: slotColor ? slotColor : color.solid,
                      color: '#fff',
                    }}
                  >
                    {swapLabel}
                  </span>
                </motion.div>
              )}

              {/* Selection mode: selectable pulse ring — CSS animation, no JS frame scheduling */}
              {inSelectionMode && slotSelectable && !isSelected && !isSecondSelected && (
                <div
                  className="absolute inset-0 rounded-xl pointer-events-none z-10 selection-pulse"
                />
              )}

              {/* Selection mode: selected badge + label (first or second target) */}
              {(isSelected || isSecondSelected) && (
                <>
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className={`absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center z-20 shadow-lg ${isSecondSelected && !isSelected ? 'bg-emerald-500' : 'bg-amber-500'}`}
                  >
                    <span className="text-[10px] text-white font-bold">{isSecondSelected && !isSelected ? '2' : '1'}</span>
                  </motion.div>
                  <motion.div
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="absolute -bottom-5 left-1/2 -translate-x-1/2 z-20 whitespace-nowrap"
                  >
                    <span className={`px-1.5 py-0.5 text-white text-[8px] font-bold rounded-md shadow-sm ${isSecondSelected && !isSelected ? 'bg-emerald-500/90' : 'bg-amber-500/90'}`}>
                      {displayName} #{i + 1}
                    </span>
                  </motion.div>
                </>
              )}

              {/* Selection mode: dim non-selectable slots (don't dim selected targets) */}
              {inSelectionMode && !slotSelectable && selectionTargetType !== 'anyPlayer' && !isSelected && !isSecondSelected && (
                <div className="absolute inset-0 rounded-xl bg-black/40 pointer-events-none z-10" />
              )}

              {/* Lock badge — always at z-30 so it's visible above every overlay */}
              {isLocked && (
                <div className="absolute top-0.5 right-0.5 z-30 pointer-events-none w-5 h-5 bg-red-900/95 rounded-full flex items-center justify-center shadow-md border border-red-500/50">
                  <span className="text-[10px] leading-none select-none">🔒</span>
                </div>
              )}

              {/* Known card badge for face-down cards (visible to all in selection) */}
              {isKnown && !isLocalPlayer && inSelectionMode && (
                <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-emerald-600 text-white text-[8px] font-semibold px-1 py-0.5 rounded-full z-20">
                  Known
                </span>
              )}
            </div>
          )

          // Show face-up if: local player knows own card, dev mode shows all, or local player peeked this opponent slot
          if (isKnown && (isLocalPlayer || !!oppKnownCard)) {
            return slotWrapper(
              <CardView
                card={knownCard}
                faceUp
                known
                locked={isLocked}
                lockInfo={isLocked ? lockInfo : null}
                size={isLocalPlayer ? 'md' : 'sm'}
                onClick={(slotClickable || (inSelectionMode && slotSelectable)) ? handleSlotClick : undefined}
                highlight={(slotClickable && !isLocked && !inSelectionMode) || (inSelectionMode && slotSelectable) || isSelected || isSecondSelected}
                disabled={(slotClickable && isLocked && !inSelectionMode) || (inSelectionMode && !slotSelectable && !isSelected && !isSecondSelected)}
                label={isLocalPlayer ? `#${i + 1}` : undefined}
                ownerColor={!isLocalPlayer ? color.solid : undefined}
              />,
            )
          }

          // Dev mode: show remote cards face-up using actual private data
          const devCard = devHand?.[i]
          return slotWrapper(
            <CardView
              card={devCard ?? card}
              faceUp={!!devCard}
              locked={isLocked}
              lockInfo={isLocked ? lockInfo : null}
              size={isLocalPlayer ? 'md' : 'sm'}
              onClick={(slotClickable && isLocalPlayer && !inSelectionMode) || (inSelectionMode && slotSelectable)
                ? handleSlotClick : undefined}
              highlight={(slotClickable && isLocalPlayer && !isLocked && !inSelectionMode) || (inSelectionMode && slotSelectable) || isSelected || isSecondSelected}
              disabled={(slotClickable && isLocked && !inSelectionMode) || (inSelectionMode && !slotSelectable && !isSelected && !isSecondSelected)}
              label={isLocalPlayer ? `#${i + 1}` : undefined}
              ownerColor={color.solid}
            />,
          )
        })}
      </div>
    </div>
  )
}

export default memo(PlayerPanel)
