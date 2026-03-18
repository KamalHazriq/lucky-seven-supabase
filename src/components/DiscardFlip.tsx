import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { cardDisplay, suitColor } from '../lib/deck'
import type { Card } from '../lib/types'
import { CARD_FLIP_SPRING, LAYOUT_SPRING } from '../lib/motionTokens'

interface DiscardFlipProps {
  discardTop: Card | null
  reduced: boolean
}

export default function DiscardFlip({ discardTop, reduced }: DiscardFlipProps) {
  const prevIdRef = useRef<string | null>(null)
  const [flipCard, setFlipCard] = useState<Card | null>(null)
  const [showFlip, setShowFlip] = useState(false)

  useEffect(() => {
    const newId = discardTop?.id ?? null
    const oldId = prevIdRef.current

    if (newId && newId !== oldId && oldId !== null) {
      setFlipCard(discardTop)
      setShowFlip(true)
      const timer = setTimeout(() => {
        setShowFlip(false)
      }, reduced ? 350 : 1500)
      return () => clearTimeout(timer)
    }

    prevIdRef.current = newId
  }, [discardTop, reduced])

  useEffect(() => {
    prevIdRef.current = discardTop?.id ?? null
  }, [discardTop?.id])

  if (reduced) {
    return (
      <AnimatePresence>
        {showFlip && flipCard && (
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
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
          initial={{ opacity: 0, scale: 0.92, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: -6 }}
          transition={LAYOUT_SPRING}
          className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none"
          style={{ perspective: '1100px' }}
        >
          <motion.div
            initial={{ rotateY: 180, rotateX: -12 }}
            animate={{ rotateY: 0, rotateX: 0 }}
            exit={{ rotateY: -24, opacity: 0.6 }}
            transition={CARD_FLIP_SPRING}
            className="relative w-full h-full rounded-xl"
            style={{
              transformStyle: 'preserve-3d',
              boxShadow: '0 14px 34px rgba(0,0,0,0.35), 0 6px 14px rgba(0,0,0,0.2)',
            }}
          >
            <div
              className="absolute inset-0 rounded-xl bg-gradient-to-br from-blue-900 via-blue-800 to-blue-950 border border-blue-700/50"
              style={{
                backfaceVisibility: 'hidden',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
              }}
            >
              <div className="flex items-center justify-center h-full">
                <div className="w-7 h-7 rounded-full border border-blue-300/20 bg-blue-300/8 flex items-center justify-center">
                  <span className="font-bold text-base text-blue-300/40">7</span>
                </div>
              </div>
            </div>

            <div
              className="absolute inset-0 rounded-xl bg-white border border-slate-200 flex items-center justify-center"
              style={{
                transform: 'rotateY(180deg)',
                backfaceVisibility: 'hidden',
              }}
            >
              <motion.span
                initial={{ opacity: 0.3, scale: 0.94 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={LAYOUT_SPRING}
                className="font-black text-sm tracking-tight"
                style={{ color: suitColor(flipCard) }}
              >
                {cardDisplay(flipCard)}
              </motion.span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
