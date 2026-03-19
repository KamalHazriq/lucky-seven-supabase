import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cardDisplay, suitColor } from '../lib/deck'
import LuckySevenCardBack from './LuckySevenCardBack'
import type { Card } from '../lib/types'

interface DiscardFlipProps {
  /** Current discard top card */
  discardTop: Card | null
  /** Whether reduced motion is active */
  reduced: boolean
}

/**
 * DiscardFlip — 3D flip-reveal when a new card becomes the discard top.
 * Detects discardTop id change and plays a satisfying flip-in animation.
 *
 * v1.5: Slightly longer reveal (600ms flip), stronger shadow during flip,
 * gentle overshoot scale on landing for a "satisfying drop" feel.
 */
export default function DiscardFlip({ discardTop, reduced }: DiscardFlipProps) {
  const prevIdRef = useRef<string | null>(null)
  const [flipCard, setFlipCard] = useState<Card | null>(null)
  const [showFlip, setShowFlip] = useState(false)
  const startFlipReveal = useCallback((nextCard: Card) => {
    setFlipCard(nextCard)
    setShowFlip(true)
  }, [])

  useEffect(() => {
    const newId = discardTop?.id ?? null
    const oldId = prevIdRef.current

    if (discardTop && newId && newId !== oldId && oldId !== null) {
      // New discard top appeared — trigger flip reveal
      startFlipReveal(discardTop)
      prevIdRef.current = newId
      const timer = setTimeout(() => {
        setShowFlip(false)
      }, reduced ? 350 : 1500)
      return () => clearTimeout(timer)
    }

    prevIdRef.current = newId
  }, [discardTop, reduced, startFlipReveal])

  // Update prevId when discardTop changes even without animation
  useEffect(() => {
    prevIdRef.current = discardTop?.id ?? null
  }, [discardTop?.id])

  if (reduced) {
    return (
      <AnimatePresence>
        {showFlip && flipCard && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none"
          >
            <DiscardFace card={flipCard} />
          </motion.div>
        )}
      </AnimatePresence>
    )
  }

  return (
    <AnimatePresence>
      {showFlip && flipCard && (
        <motion.div
          initial={{ rotateY: 180, scale: 0.8, opacity: 0.72 }}
          animate={{ rotateY: 0, scale: 1, opacity: 1 }}
          exit={{ opacity: 0, scale: 0.92 }}
          transition={{
            rotateY: { type: 'spring', stiffness: 150, damping: 18, mass: 0.95 },
            scale: { type: 'spring', stiffness: 220, damping: 18, mass: 0.8 },
            opacity: { duration: 0.2 },
          }}
          className="absolute inset-0 z-20 pointer-events-none"
          style={{ perspective: '1200px', transformStyle: 'preserve-3d' }}
        >
          <motion.div
            className="absolute inset-0 rounded-xl"
            initial={{ opacity: 0, scale: 0.74 }}
            animate={{ opacity: [0, 0.92, 0], scale: [0.74, 1.03, 1.26] }}
            transition={{ duration: 0.68, times: [0, 0.42, 1], ease: 'easeOut' }}
            style={{
              background: 'radial-gradient(circle at 50% 50%, rgba(255,255,255,0.88) 0%, rgba(125,211,252,0.3) 18%, rgba(250,204,21,0.18) 36%, transparent 72%)',
              mixBlendMode: 'screen',
            }}
          >
            <motion.div
              initial={{ opacity: 0, x: '-120%' }}
              animate={{ opacity: [0, 0.68, 0], x: ['-120%', '130%'] }}
              transition={{ duration: 0.58, times: [0, 0.3, 1], ease: [0.22, 0.9, 0.36, 1] }}
              className="absolute inset-y-[-20%] left-[-36%] w-[48%] rotate-[14deg]"
              style={{
                background: 'linear-gradient(120deg, transparent 0%, rgba(255,255,255,0.06) 24%, rgba(255,255,255,0.46) 48%, rgba(250,204,21,0.24) 58%, transparent 82%)',
              }}
            />
          </motion.div>

          <div className="absolute inset-0 rounded-xl overflow-hidden" style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}>
            <LuckySevenCardBack className="h-full w-full" />
          </div>

          <div className="absolute inset-0 rounded-xl overflow-hidden" style={{ backfaceVisibility: 'hidden' }}>
            <DiscardFace card={flipCard} />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function DiscardFace({ card }: { card: Card }) {
  return (
    <div
      className="relative w-full h-full rounded-xl bg-white border border-slate-200 flex items-center justify-center overflow-hidden"
      style={{
        boxShadow: '0 12px 36px rgba(0,0,0,0.4), 0 6px 16px rgba(0,0,0,0.2)',
      }}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: 'radial-gradient(circle at 50% 30%, rgba(255,255,255,0.8) 0%, transparent 48%), linear-gradient(180deg, rgba(255,255,255,0.18) 0%, transparent 28%, transparent 72%, rgba(226,232,240,0.2) 100%)',
        }}
      />
      <div className="pointer-events-none absolute inset-x-3 top-1.5 h-px bg-gradient-to-r from-transparent via-slate-300/80 to-transparent" />
      <span className="relative font-bold text-sm" style={{ color: suitColor(card) }}>
        {cardDisplay(card)}
      </span>
    </div>
  )
}
