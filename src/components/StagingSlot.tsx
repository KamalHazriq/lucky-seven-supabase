import { forwardRef, memo, useRef, useEffect } from 'react'
import { motion, AnimatePresence, useAnimate } from 'motion/react'
import CardView from './CardView'
import type { Card } from '../lib/types'
import { usePerformanceMode } from '../hooks/usePerformanceMode'

/** Spring-based motion configs for premium feel */
const SPRING_ENTRY = { type: 'spring' as const, stiffness: 220, damping: 20, mass: 0.9 }
const SPRING_EXIT  = { type: 'spring' as const, stiffness: 260, damping: 26, mass: 0.7 }
const FLOAT_CONFIG = { duration: 3.5, ease: 'easeInOut' as const, repeat: Infinity }
const CROSSFADE_SPRING = { type: 'spring' as const, stiffness: 300, damping: 22, mass: 0.6 }

interface StagingSlotProps {
  /** Card currently in staging (null = empty) */
  card: Card | null
  /** Whether the card is face-up (discard takes) or face-down (pile draws) */
  faceUp: boolean
  /** Whether a card is currently staged */
  active: boolean
  /** If provided, show a small "Resolve" chip that calls this handler */
  onResolve?: () => void
  /** Owner color tint for face-down cards (remote pile draws) */
  ownerColor?: string
}

/**
 * StagingSlot — the "In play" card between Draw and Discard piles.
 * Shows a card with a gentle floating animation when active.
 * Purely visual — no game state changes, no database writes.
 *
 * v1.6: Uses motion/react (Motion One) for smoother crossfade.
 * Respects reduced motion via shorter durations.
 */
const StagingSlot = memo(forwardRef<HTMLDivElement, StagingSlotProps>(
  function StagingSlot({ card, faceUp, active, onResolve, ownerColor }, ref) {
    const [scope, animate] = useAnimate()
    const prevActive = useRef(active)
    const perfMode = usePerformanceMode()

    // Subtle pulse when card state changes (crossfade effect)
    useEffect(() => {
      if (active && prevActive.current && scope.current) {
        // Card state changed while active — spring crossfade pulse
        animate(scope.current, { opacity: [0.7, 1], scale: [0.96, 1] }, CROSSFADE_SPRING)
      }
      prevActive.current = active
    }, [card, faceUp, active, animate, scope])

    return (
      <div ref={ref} className={`text-center relative ${active && !perfMode ? 'staging-active' : ''}`} style={{ minWidth: '64px', borderRadius: '12px' }}>
        <p className={`text-[10px] mb-1 font-medium ${active ? 'text-primary' : 'text-muted-foreground'}`}>
          {active ? 'In play' : '\u00A0'}
        </p>
        <AnimatePresence mode="wait">
          {active ? (
            /* Shadow wrapper is static — keeps filter off the animated element */
            <div style={perfMode ? undefined : {
              filter: 'drop-shadow(0 8px 20px rgba(0,0,0,0.35)) drop-shadow(0 3px 8px rgba(0,0,0,0.2)) drop-shadow(0 0 12px rgba(251,191,36,0.12))',
            }}>
            <motion.div
              key={`staged-${faceUp ? 'up' : 'down'}`}
              ref={scope}
              initial={{ opacity: 0, scale: 0.78, y: 12 }}
              animate={perfMode
                ? { opacity: 1, scale: 1, y: 0 }
                : { opacity: 1, scale: 1, y: [0, -5, 0] }
              }
              exit={{ opacity: 0, scale: 0.85, y: -10 }}
              transition={perfMode
                ? { opacity: SPRING_ENTRY, scale: SPRING_ENTRY, default: SPRING_EXIT }
                : { opacity: SPRING_ENTRY, scale: SPRING_ENTRY, y: FLOAT_CONFIG, default: SPRING_EXIT }
              }
              style={{ willChange: 'transform, opacity' }}
            >
              <CardView
                card={faceUp ? card : undefined}
                faceUp={faceUp}
                size="md"
                ownerColor={!faceUp ? ownerColor : undefined}
              />
            </motion.div>
            </div>
          ) : (
            <motion.div
              key="empty-slot"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={SPRING_EXIT}
              className="w-20 h-28 rounded-xl border-2 border-dashed border-border-subtle flex items-center justify-center"
            >
              <span className="text-muted-foreground/30 text-[10px]" />
            </motion.div>
          )}
        </AnimatePresence>
        {/* Small "Resolve" chip when the player needs to act on a staged card */}
        {onResolve && active && (
          <motion.button
            initial={{ opacity: 0, y: 6, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={SPRING_ENTRY}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="mt-1.5 px-3 py-1 bg-primary hover:bg-primary/90 text-primary-foreground text-[10px] font-bold rounded-lg cursor-pointer transition-colors shadow-sm"
            onClick={onResolve}
          >
            Resolve
          </motion.button>
        )}
      </div>
    )
  },
))

export default StagingSlot
