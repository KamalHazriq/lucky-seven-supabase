import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cardDisplay, suitColor } from '../lib/deck'
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

  useEffect(() => {
    const newId = discardTop?.id ?? null
    const oldId = prevIdRef.current

    if (newId && newId !== oldId && oldId !== null) {
      // New discard top appeared — trigger flip reveal
      setFlipCard(discardTop)
      setShowFlip(true)
      const timer = setTimeout(() => {
        setShowFlip(false)
      }, reduced ? 350 : 1500)
      return () => clearTimeout(timer)
    }

    prevIdRef.current = newId
  }, [discardTop, reduced])

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
            <div className="w-full h-full rounded-xl bg-white border border-slate-200 flex items-center justify-center shadow-lg">
              <span className="font-bold text-sm" style={{ color: suitColor(flipCard) }}>
                {cardDisplay(flipCard)}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    )
  }

  return (
    <AnimatePresence>
      {showFlip && flipCard && (
        <motion.div
          initial={{ rotateY: 180, scale: 0.78, opacity: 0.7 }}
          animate={{ rotateY: 0, scale: 1, opacity: 1 }}
          exit={{ opacity: 0, scale: 0.92 }}
          transition={{
            rotateY: { type: 'spring', stiffness: 140, damping: 18, mass: 1.0 },
            scale: { type: 'spring', stiffness: 200, damping: 16, mass: 0.8 },
            opacity: { duration: 0.2 },
          }}
          className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none"
          style={{ perspective: '800px', backfaceVisibility: 'hidden' }}
        >
          <div
            className="w-full h-full rounded-xl bg-white border border-slate-200 flex items-center justify-center"
            style={{
              boxShadow: '0 12px 36px rgba(0,0,0,0.4), 0 6px 16px rgba(0,0,0,0.2)',
            }}
          >
            <span className="font-bold text-sm" style={{ color: suitColor(flipCard) }}>
              {cardDisplay(flipCard)}
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
