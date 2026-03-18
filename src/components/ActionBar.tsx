import { memo, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import CardView from './CardView'
import type { Card, PowerEffectType, PowerRankKey, PowerAssignments, DrawnCardSource, PlayerDoc } from '../lib/types'
import { getCardRankKey, EFFECT_LABELS, DEFAULT_POWER_ASSIGNMENTS } from '../lib/types'
import type { SelectionModeState, SelectedTarget } from '../hooks/useSelectionMode'

interface ActionBarProps {
  card: Card | null
  visible: boolean
  locks: boolean[]
  powerAssignments: PowerAssignments
  spentPowerCardIds: Record<string, boolean>
  drawnCardSource: DrawnCardSource
  onSwap: (slotIndex: number) => void
  onDiscard: () => void
  onUsePower: (rankKey: PowerRankKey, effectType: PowerEffectType) => void
  /** Cancel draw — only for discard source */
  onClose: () => void
  /** Selection mode state from useSelectionMode */
  selection?: SelectionModeState | null
  /** Callbacks for selection mode */
  onSelectionConfirm?: () => void
  onSelectionCancel?: () => void
  onSelectionGoBack?: () => void
  /** Whether desktop (shows keyboard hints) */
  isDesktop?: boolean
  /** Players map — for resolving display names in selection confirm */
  players?: Record<string, PlayerDoc>
  /** Whether any card is locked anywhere — used to disable unlock power */
  hasAnyLocks?: boolean
}

/**
 * Inline "Action Bar" — a horizontal strip shown below the local player hand
 * when they have a drawn card. Replaces the modal for a smoother feel.
 *
 * v1.5: Polished hierarchy — swap buttons are primary, discard is secondary,
 *       power button stands out with color, selection mode has amber accent.
 *       All buttons are 44px min-height for mobile touch targets.
 */
function ActionBar({
  card,
  visible,
  locks,
  powerAssignments,
  spentPowerCardIds,
  drawnCardSource,
  onSwap,
  onDiscard,
  onUsePower,
  onClose,
  selection,
  onSelectionConfirm,
  onSelectionCancel,
  onSelectionGoBack,
  isDesktop = false,
  players,
  hasAnyLocks = true,
}: ActionBarProps) {
  const rankKey = useMemo(() => card ? getCardRankKey(card) : null, [card])
  const effectType = useMemo(() => rankKey ? (powerAssignments ?? DEFAULT_POWER_ASSIGNMENTS)[rankKey] : null, [rankKey, powerAssignments])
  const effectInfo = useMemo(() => effectType ? EFFECT_LABELS[effectType] : null, [effectType])
  const rankLabel = rankKey === 'JOKER' ? 'Joker' : rankKey
  const isSpent = card ? !!spentPowerCardIds[card.id] : false
  const isUnlockWithNoTargets = effectType === 'unlock_one_locked_card' && !hasAnyLocks
  const canCancel = drawnCardSource === 'discard'

  const isSelecting = selection && selection.phase !== 'idle'

  // Resolve target names for confirmation view
  const resolveTarget = useCallback((target: SelectedTarget | null): string => {
    if (!target || !players) return '?'
    const pd = players[target.playerId]
    return pd ? `${pd.displayName}'s #${target.slotIndex + 1}` : `#${target.slotIndex + 1}`
  }, [players])

  return (
    <AnimatePresence>
      {card && visible && (
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.96 }}
          transition={{ type: 'spring', stiffness: 300, damping: 26, mass: 0.7 }}
          className={`mt-3 rounded-2xl border backdrop-blur-md p-3 shadow-xl ${
            isSelecting ? 'ring-1 ring-amber-500/40' : ''
          }`}
          style={{
            background: 'color-mix(in srgb, var(--surface-solid) 90%, transparent)',
            borderColor: isSelecting ? 'rgba(251,191,36,0.3)' : 'var(--border-solid)',
          }}
        >
          <AnimatePresence mode="wait">
            {isSelecting ? (
              /* ─── Selection Mode Overlay ─────────────────────── */
              <motion.div
                key="selection"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ type: 'spring', stiffness: 350, damping: 28, mass: 0.6 }}
              >
                {/* Mode label */}
                <div className="flex items-center justify-center gap-1.5 mb-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                  <span className="text-[9px] uppercase tracking-wider font-bold text-amber-400/70">
                    Power Active
                  </span>
                </div>

                {/* Prompt */}
                <p className="text-xs font-semibold text-primary mb-2.5 text-center">
                  {selection?.phase === 'confirming' ? (
                    <>
                      {selection.constraint?.secondTargetType ? (
                        <span>
                          Swap {resolveTarget(selection.firstTarget)} {'\u2194'} {resolveTarget(selection.secondTarget)}?
                        </span>
                      ) : (
                        <span>
                          {selection.constraint?.prompt?.replace('Pick', 'Confirm')} {'\u2192'} {resolveTarget(selection.firstTarget)}
                        </span>
                      )}
                    </>
                  ) : (
                    <span>
                      {selection?.phase === 'choosingSecondTarget'
                        ? selection.constraint?.secondPrompt
                        : selection?.constraint?.prompt}
                    </span>
                  )}
                </p>

                {/* Action buttons */}
                <div className="flex gap-2">
                  {selection?.phase === 'confirming' && (
                    <button
                      onClick={onSelectionConfirm}
                      className="flex-1 min-h-[40px] bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-sm"
                    >
                      {isDesktop && <Kbd>↵</Kbd>} Confirm
                    </button>
                  )}

                  {selection?.phase === 'choosingSecondTarget' && (
                    <button
                      onClick={onSelectionGoBack}
                      className="flex-1 min-h-[40px] bg-secondary hover:bg-secondary/80 text-foreground rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                    >
                      Back
                    </button>
                  )}

                  <button
                    onClick={onSelectionCancel}
                    className="flex-1 min-h-[40px] bg-rose-900/40 hover:bg-rose-900/60 border border-rose-700/30 text-rose-300 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                  >
                    {isDesktop && <Kbd>Esc</Kbd>} Cancel
                  </button>
                </div>
              </motion.div>
            ) : (
              /* ─── Normal Action Buttons ──────────────────────── */
              <motion.div
                key="actions"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ type: 'spring', stiffness: 350, damping: 28, mass: 0.6 }}
              >
                <div className="flex items-start gap-3">
                  {/* Drawn card preview */}
                  <div className="shrink-0 flex flex-col items-center">
                    <p className="text-[9px] text-muted-foreground font-semibold uppercase tracking-wider mb-1">
                      Drew
                    </p>
                    <CardView card={card} faceUp size="sm" />
                  </div>

                  {/* Action buttons */}
                  <div className="flex-1 min-w-0 flex flex-col gap-2">
                    {/* Swap row — primary action */}
                    <div>
                      <p className="text-[9px] text-muted-foreground font-semibold uppercase tracking-wider mb-1">
                        Swap with slot
                      </p>
                      <div className="flex gap-1.5">
                        {[0, 1, 2].map((i) => (
                          <button
                            key={i}
                            onClick={() => onSwap(i)}
                            disabled={locks[i]}
                            className={`flex-1 min-h-[38px] rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                              locks[i]
                                ? 'bg-secondary/50 text-muted-foreground cursor-not-allowed opacity-50'
                                : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm'
                            }`}
                          >
                            {isDesktop && !locks[i] && <Kbd>{i + 1}</Kbd>}
                            {locks[i] ? '\u{1F512}' : '\u{2194}'} #{i + 1}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Discard + Power row — secondary actions */}
                    <div className="flex gap-1.5">
                      <button
                        onClick={onDiscard}
                        className="flex-1 min-h-[36px] bg-secondary hover:bg-secondary/80 text-foreground rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                      >
                        Discard
                      </button>

                      {effectInfo && rankKey && effectType && (
                        <button
                          onClick={() => !isSpent && !isUnlockWithNoTargets && onUsePower(rankKey, effectType)}
                          disabled={isSpent || isUnlockWithNoTargets}
                          title={isSpent ? 'Power already used for this card' : isUnlockWithNoTargets ? 'No card is locked right now' : effectInfo.desc}
                          className={`flex-1 min-h-[36px] rounded-xl text-xs font-bold transition-colors text-white ${
                            isSpent || isUnlockWithNoTargets
                              ? 'bg-secondary/50 opacity-50 cursor-not-allowed text-muted-foreground'
                              : `${effectInfo.color} cursor-pointer shadow-sm`
                          }`}
                        >
                          {isSpent ? `${rankLabel} (spent)` : isUnlockWithNoTargets ? `${rankLabel}: No locks` : `${rankLabel}: ${effectInfo.label}`}
                        </button>
                      )}
                    </div>

                    {/* Cancel row (discard source only) */}
                    {canCancel && (
                      <button
                        onClick={onClose}
                        className="w-full min-h-[32px] bg-rose-900/25 hover:bg-rose-900/40 border border-rose-700/30 text-rose-300 rounded-xl text-[10px] font-medium transition-colors cursor-pointer"
                      >
                        {isDesktop && <Kbd>Esc</Kbd>} Cancel Take
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export default memo(ActionBar)

/** Tiny keyboard hint badge */
function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center justify-center min-w-[18px] h-[16px] px-1 mr-1 bg-background/60 border border-border-subtle rounded text-[9px] font-mono text-muted-foreground align-middle leading-none">
      {children}
    </span>
  )
}
