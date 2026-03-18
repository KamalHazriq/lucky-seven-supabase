import { memo, useCallback, useMemo } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import CardView from './CardView'
import type { Card, DrawnCardSource, PlayerDoc, PowerAssignments, PowerEffectType, PowerRankKey } from '../lib/types'
import { DEFAULT_POWER_ASSIGNMENTS, EFFECT_LABELS, getCardRankKey } from '../lib/types'
import type { SelectedTarget, SelectionModeState } from '../hooks/useSelectionMode'
import { BUTTON_HOVER, BUTTON_TAP, LAYOUT_SPRING, SURFACE_ENTRY_SPRING } from '../lib/motionTokens'

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
  onClose: () => void
  selection?: SelectionModeState | null
  onSelectionConfirm?: () => void
  onSelectionCancel?: () => void
  onSelectionGoBack?: () => void
  isDesktop?: boolean
  players?: Record<string, PlayerDoc>
  hasAnyLocks?: boolean
}

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
  const slotIndexes = useMemo(() => locks.map((_, i) => i), [locks])
  const rankKey = useMemo(() => card ? getCardRankKey(card) : null, [card])
  const effectType = useMemo(() => rankKey ? (powerAssignments ?? DEFAULT_POWER_ASSIGNMENTS)[rankKey] : null, [rankKey, powerAssignments])
  const effectInfo = useMemo(() => effectType ? EFFECT_LABELS[effectType] : null, [effectType])
  const rankLabel = rankKey === 'JOKER' ? 'Joker' : rankKey
  const isSpent = card ? !!spentPowerCardIds[card.id] : false
  const isUnlockWithNoTargets = effectType === 'unlock_one_locked_card' && !hasAnyLocks
  const canCancel = drawnCardSource === 'discard'
  const isSelecting = !!selection && selection.phase !== 'idle'

  const resolveTarget = useCallback((target: SelectedTarget | null): string => {
    if (!target || !players) return '?'
    const pd = players[target.playerId]
    return pd ? `${pd.displayName}'s #${target.slotIndex + 1}` : `#${target.slotIndex + 1}`
  }, [players])

  return (
    <AnimatePresence>
      {card && visible && (
        <motion.div
          layout
          initial={{ opacity: 0, y: 20, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.96 }}
          transition={SURFACE_ENTRY_SPRING}
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
              <motion.div
                key="selection"
                layout="position"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={LAYOUT_SPRING}
              >
                <div className="flex items-center justify-center gap-1.5 mb-1.5">
                  <motion.span
                    animate={{ opacity: [0.65, 1, 0.65], scale: [0.92, 1.08, 0.92] }}
                    transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
                    className="w-1.5 h-1.5 rounded-full bg-amber-400"
                  />
                  <span className="text-[9px] uppercase tracking-wider font-bold text-amber-400/70">
                    Power Active
                  </span>
                </div>

                <p className="text-xs font-semibold text-primary mb-2.5 text-center">
                  {selection?.phase === 'confirming' ? (
                    selection.constraint?.secondTargetType ? (
                      <span>
                        Swap {resolveTarget(selection.firstTarget)} {'\u2194'} {resolveTarget(selection.secondTarget)}?
                      </span>
                    ) : (
                      <span>
                        {selection.constraint?.prompt?.replace('Pick', 'Confirm')} {'\u2192'} {resolveTarget(selection.firstTarget)}
                      </span>
                    )
                  ) : (
                    <span>
                      {selection?.phase === 'choosingSecondTarget'
                        ? selection.constraint?.secondPrompt
                        : selection?.constraint?.prompt}
                    </span>
                  )}
                </p>

                <div className="flex gap-2">
                  {selection?.phase === 'confirming' && (
                    <motion.button
                      whileHover={BUTTON_HOVER}
                      whileTap={BUTTON_TAP}
                      transition={LAYOUT_SPRING}
                      onClick={onSelectionConfirm}
                      className="flex-1 min-h-[40px] bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-sm"
                    >
                      {isDesktop && <Kbd>↵</Kbd>} Confirm
                    </motion.button>
                  )}

                  {selection?.phase === 'choosingSecondTarget' && (
                    <motion.button
                      whileHover={BUTTON_HOVER}
                      whileTap={BUTTON_TAP}
                      transition={LAYOUT_SPRING}
                      onClick={onSelectionGoBack}
                      className="flex-1 min-h-[40px] bg-secondary hover:bg-secondary/80 text-foreground rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                    >
                      Back
                    </motion.button>
                  )}

                  <motion.button
                    whileHover={BUTTON_HOVER}
                    whileTap={BUTTON_TAP}
                    transition={LAYOUT_SPRING}
                    onClick={onSelectionCancel}
                    className="flex-1 min-h-[40px] bg-rose-900/40 hover:bg-rose-900/60 border border-rose-700/30 text-rose-300 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                  >
                    {isDesktop && <Kbd>Esc</Kbd>} Cancel
                  </motion.button>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="actions"
                layout="position"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={LAYOUT_SPRING}
              >
                <div className="flex items-start gap-3">
                  <motion.div
                    layout="position"
                    initial={{ opacity: 0, y: 8, scale: 0.94 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={SURFACE_ENTRY_SPRING}
                    className="shrink-0 flex flex-col items-center"
                  >
                    <p className="text-[9px] text-muted-foreground font-semibold uppercase tracking-wider mb-1">
                      Drew
                    </p>
                    <CardView card={card} faceUp size="sm" />
                  </motion.div>

                  <motion.div layout="position" className="flex-1 min-w-0 flex flex-col gap-2">
                    <div>
                      <p className="text-[9px] text-muted-foreground font-semibold uppercase tracking-wider mb-1">
                        Swap with slot
                      </p>
                      <motion.div layout="position" className="flex gap-1.5">
                        {slotIndexes.map((i) => (
                          <motion.button
                            key={i}
                            whileHover={!locks[i] ? BUTTON_HOVER : undefined}
                            whileTap={!locks[i] ? BUTTON_TAP : undefined}
                            transition={LAYOUT_SPRING}
                            onClick={() => onSwap(i)}
                            disabled={locks[i]}
                            className={`flex-1 min-h-[38px] rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                              locks[i]
                                ? 'bg-secondary/50 text-muted-foreground cursor-not-allowed opacity-50'
                                : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm'
                            }`}
                          >
                            {isDesktop && !locks[i] && <Kbd>{i + 1}</Kbd>}
                            {locks[i] ? '\u{1F512}' : '\u2194'} #{i + 1}
                          </motion.button>
                        ))}
                      </motion.div>
                    </div>

                    <motion.div layout="position" className="flex gap-1.5">
                      <motion.button
                        whileHover={BUTTON_HOVER}
                        whileTap={BUTTON_TAP}
                        transition={LAYOUT_SPRING}
                        onClick={onDiscard}
                        className="flex-1 min-h-[36px] bg-secondary hover:bg-secondary/80 text-foreground rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                      >
                        Discard
                      </motion.button>

                      {effectInfo && rankKey && effectType && (
                        <motion.button
                          whileHover={!isSpent && !isUnlockWithNoTargets ? BUTTON_HOVER : undefined}
                          whileTap={!isSpent && !isUnlockWithNoTargets ? BUTTON_TAP : undefined}
                          transition={LAYOUT_SPRING}
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
                        </motion.button>
                      )}
                    </motion.div>

                    {canCancel && (
                      <motion.button
                        whileHover={BUTTON_HOVER}
                        whileTap={BUTTON_TAP}
                        transition={LAYOUT_SPRING}
                        onClick={onClose}
                        className="w-full min-h-[32px] bg-rose-900/25 hover:bg-rose-900/40 border border-rose-700/30 text-rose-300 rounded-xl text-[10px] font-medium transition-colors cursor-pointer"
                      >
                        {isDesktop && <Kbd>Esc</Kbd>} Cancel Take
                      </motion.button>
                    )}
                  </motion.div>
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

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center justify-center min-w-[18px] h-[16px] px-1 mr-1 bg-background/60 border border-border-subtle rounded text-[9px] font-mono text-muted-foreground align-middle leading-none">
      {children}
    </span>
  )
}
