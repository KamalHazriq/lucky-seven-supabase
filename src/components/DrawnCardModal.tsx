import { useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import CardView from './CardView'
import type { Card, PowerEffectType, PowerRankKey, PowerAssignments, DrawnCardSource } from '../lib/types'
import { getCardRankKey, EFFECT_LABELS, DEFAULT_POWER_ASSIGNMENTS } from '../lib/types'

interface DrawnCardModalProps {
  card: Card | null
  open: boolean
  locks: boolean[]
  powerAssignments: PowerAssignments
  spentPowerCardIds: Record<string, boolean>
  /** Player's known cards map (slot index string → Card) */
  knownCards: Record<string, Card>
  /** Where the drawn card came from — hides close button for pile draws */
  drawnCardSource: DrawnCardSource
  onSwap: (slotIndex: number) => void
  onDiscard: () => void
  onUsePower: (rankKey: PowerRankKey, effectType: PowerEffectType) => void
  /** Cancel draw — only for discard source (returns card to discard pile) */
  onClose: () => void
  /** Dismiss modal — hides it without canceling; for pile draws user can view the board */
  onDismiss?: () => void
  /** Whether any card is locked anywhere — used to disable unlock power */
  hasAnyLocks?: boolean
}

export default function DrawnCardModal({
  card,
  open,
  locks,
  powerAssignments,
  spentPowerCardIds,
  knownCards,
  drawnCardSource,
  onSwap,
  onDiscard,
  onUsePower,
  onClose,
  onDismiss,
  hasAnyLocks = true,
}: DrawnCardModalProps) {
  const rankKey = card ? getCardRankKey(card) : null
  const effectType = rankKey ? (powerAssignments ?? DEFAULT_POWER_ASSIGNMENTS)[rankKey] : null
  const effectInfo = effectType ? EFFECT_LABELS[effectType] : null
  const rankLabel = rankKey === 'JOKER' ? 'Joker' : rankKey
  const isSpent = card ? !!spentPowerCardIds[card.id] : false
  const isUnlockWithNoTargets = effectType === 'unlock_one_locked_card' && !hasAnyLocks
  const canCancel = drawnCardSource === 'discard'
  // Treat null source as pile draw (card is committed; can dismiss but not cancel)
  const isPileDraw = drawnCardSource === 'pile' || drawnCardSource === null

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (canCancel) onClose()
      else if (isPileDraw && onDismiss) onDismiss()
    }
  }, [onClose, onDismiss, canCancel, isPileDraw])

  useEffect(() => {
    if (open && card) {
      document.addEventListener('keydown', handleKeyDown)
      return () => document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, card, handleKeyDown])

  const handleBackdropClick = () => {
    if (canCancel) onClose()
    else if (isPileDraw && onDismiss) onDismiss()
  }

  return (
    <AnimatePresence>
      {card && open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={handleBackdropClick}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="drawn-card-modal-title"
            aria-describedby="drawn-card-modal-desc"
            initial={{ scale: 0.85, y: 30, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.88, y: 20, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 24, mass: 0.7 }}
            className="rounded-2xl p-6 max-w-sm w-full shadow-2xl relative border"
            style={{ background: 'var(--surface-solid)', borderColor: 'var(--border-solid)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Screen-reader card description — hidden visually, always up-to-date */}
            {card && (
              <p id="drawn-card-modal-desc" className="sr-only">
                {`You drew the ${card.isJoker ? 'Joker' : `${card.rank} of ${card.suit}`}. Choose to swap it with one of your cards, discard it${effectInfo ? `, or use its ${effectInfo.label} power` : ''}.`}
              </p>
            )}
            {/* Close button — behavior differs by source */}
            {canCancel ? (
              <button
                onClick={onClose}
                className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full hover:opacity-80 transition-colors cursor-pointer text-sm"
                style={{ background: 'var(--panel)', color: 'var(--text-muted)' }}
                aria-label="Cancel draw (choose again)"
                title="Cancel draw (choose again)"
              >
                &times;
              </button>
            ) : (
              <button
                onClick={onDismiss}
                className="absolute top-3 right-3 flex items-center gap-1.5 px-2 py-1 hover:opacity-80 text-[9px] font-semibold rounded-md transition-colors cursor-pointer"
                style={{ background: 'var(--panel)', color: 'var(--text-muted)' }}
                title="Minimize — tap resume banner to return"
              >
                <span className="text-xs">&minus;</span>
                Pile draw
              </button>
            )}

            <h3 id="drawn-card-modal-title" className="text-center text-lg font-semibold mb-4" style={{ color: 'var(--text)' }}>
              You drew:
            </h3>

            <div className="flex justify-center mb-4">
              <CardView card={card} faceUp size="lg" />
            </div>

            {/* Your hand — compact row showing known/unknown cards */}
            <div className="mb-4">
              <p className="text-[11px] text-center mb-2 font-medium uppercase tracking-wide" style={{ color: 'var(--text-dim)' }}>
                Your cards
              </p>
              <div className="flex gap-2 justify-center">
                {[0, 1, 2].map((i) => {
                  const known = knownCards[String(i)]
                  return (
                    <div key={i} className="flex flex-col items-center gap-1">
                      <CardView
                        card={known ?? undefined}
                        faceUp={!!known}
                        locked={locks[i]}
                        size="sm"
                      />
                      <span className="text-[10px] font-medium" style={{ color: 'var(--text-dim)' }}>#{i + 1}</span>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs text-center mb-3" style={{ color: 'var(--text-muted)' }}>
                Swap with one of your cards, discard{effectInfo ? ', or use its power.' : '.'}
              </p>

              <div className="flex gap-2 justify-center mb-3">
                {[0, 1, 2].map((i) => (
                  <button
                    key={i}
                    onClick={() => onSwap(i)}
                    disabled={locks[i]}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                      locks[i]
                        ? 'bg-slate-700 text-slate-500 cursor-not-allowed opacity-50'
                        : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                    }`}
                  >
                    {locks[i] ? '\u{1F512}' : ''} Swap #{i + 1}
                  </button>
                ))}
              </div>

              <button
                onClick={onDiscard}
                className="w-full py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer border"
                style={{ background: 'var(--panel)', borderColor: 'var(--border)', color: 'var(--text)' }}
              >
                Discard
              </button>

              {effectInfo && rankKey && effectType && (
                <button
                  onClick={() => !isSpent && !isUnlockWithNoTargets && onUsePower(rankKey, effectType)}
                  disabled={isSpent || isUnlockWithNoTargets}
                  title={isSpent ? 'Power already used for this card' : isUnlockWithNoTargets ? 'No card is locked right now' : effectInfo.desc}
                  className={`w-full py-2.5 rounded-lg text-sm font-medium transition-colors mt-1 text-white ${
                    isSpent || isUnlockWithNoTargets
                      ? 'bg-slate-700 opacity-50 cursor-not-allowed'
                      : `${effectInfo.color} cursor-pointer`
                  }`}
                >
                  <span className="font-semibold">
                    {rankLabel}: {isUnlockWithNoTargets ? 'No cards locked' : effectInfo.label}
                  </span>
                  {isSpent && (
                    <span className="inline-block ml-1.5 px-1.5 py-0.5 bg-slate-600/80 text-slate-400 text-[9px] font-bold rounded align-middle">
                      SPENT
                    </span>
                  )}
                  <span className="block text-xs opacity-80 mt-0.5">
                    {isSpent ? 'Power already used for this card.' : isUnlockWithNoTargets ? 'No locked cards to unlock.' : effectInfo.desc}
                  </span>
                </button>
              )}

              {canCancel && (
                <button
                  onClick={onClose}
                  className="w-full py-2 bg-rose-900/30 hover:bg-rose-900/50 border border-rose-700/40 text-rose-300 rounded-lg text-xs font-medium transition-colors cursor-pointer mt-2"
                >
                  Cancel Take (return to discard)
                </button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
