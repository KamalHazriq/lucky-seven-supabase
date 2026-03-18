import { forwardRef, memo, useEffect, useRef } from 'react'
import { AnimatePresence, motion, useAnimate } from 'motion/react'
import CardView from './CardView'
import type { Card } from '../lib/types'
import { usePerformanceMode } from '../hooks/usePerformanceMode'
import { BUTTON_HOVER, BUTTON_TAP, LAYOUT_SPRING, SURFACE_ENTRY_SPRING } from '../lib/motionTokens'

const FLOAT_CONFIG = { duration: 3.2, ease: 'easeInOut' as const, repeat: Infinity }
const CROSSFADE_SPRING = { type: 'spring' as const, stiffness: 320, damping: 24, mass: 0.6 }

interface StagingSlotProps {
  card: Card | null
  faceUp: boolean
  active: boolean
  onResolve?: () => void
  ownerColor?: string
}

const StagingSlot = memo(forwardRef<HTMLDivElement, StagingSlotProps>(
  function StagingSlot({ card, faceUp, active, onResolve, ownerColor }, ref) {
    const [scope, animate] = useAnimate()
    const prevActive = useRef(active)
    const perfMode = usePerformanceMode()

    useEffect(() => {
      if (active && prevActive.current && scope.current) {
        animate(
          scope.current,
          { opacity: [0.72, 1], scale: [0.965, 1], y: [2, 0] },
          CROSSFADE_SPRING,
        )
      }
      prevActive.current = active
    }, [card, faceUp, active, animate, scope])

    return (
      <motion.div
        ref={ref}
        layout="position"
        initial={{ opacity: 0, y: 8, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={LAYOUT_SPRING}
        className={`text-center relative ${active && !perfMode ? 'staging-active' : ''}`}
        style={{ minWidth: '64px', borderRadius: '12px' }}
      >
        <motion.p
          layout="position"
          className={`text-[10px] mb-1 font-medium ${active ? 'text-primary' : 'text-muted-foreground'}`}
        >
          {active ? 'In play' : '\u00A0'}
        </motion.p>

        <AnimatePresence mode="wait">
          {active ? (
            <div style={perfMode ? undefined : {
              filter: 'drop-shadow(0 8px 20px rgba(0,0,0,0.35)) drop-shadow(0 3px 8px rgba(0,0,0,0.2)) drop-shadow(0 0 12px rgba(251,191,36,0.12))',
            }}>
              <motion.div
                key={`staged-${card?.id ?? 'empty'}-${faceUp ? 'up' : 'down'}`}
                ref={scope}
                layout="position"
                initial={{ opacity: 0, scale: 0.82, y: 14, rotate: -3 }}
                animate={perfMode
                  ? { opacity: 1, scale: 1, y: 0, rotate: 0 }
                  : { opacity: 1, scale: 1, y: [0, -5, 0], rotate: [0, -1.2, 0] }
                }
                exit={{ opacity: 0, scale: 0.88, y: -10, rotate: 2 }}
                transition={perfMode
                  ? { opacity: SURFACE_ENTRY_SPRING, scale: SURFACE_ENTRY_SPRING, rotate: LAYOUT_SPRING }
                  : { opacity: SURFACE_ENTRY_SPRING, scale: SURFACE_ENTRY_SPRING, rotate: LAYOUT_SPRING, y: FLOAT_CONFIG }
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
              layout="position"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={LAYOUT_SPRING}
              className="w-20 h-28 rounded-xl border-2 border-dashed border-border-subtle flex items-center justify-center"
            >
              <motion.span
                animate={perfMode ? undefined : { opacity: [0.16, 0.26, 0.16] }}
                transition={perfMode ? undefined : { duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
                className="text-muted-foreground/30 text-[10px]"
              />
            </motion.div>
          )}
        </AnimatePresence>

        {onResolve && active && (
          <motion.button
            initial={{ opacity: 0, y: 8, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={SURFACE_ENTRY_SPRING}
            whileHover={BUTTON_HOVER}
            whileTap={BUTTON_TAP}
            className="mt-1.5 px-3 py-1 bg-primary hover:bg-primary/90 text-primary-foreground text-[10px] font-bold rounded-lg cursor-pointer transition-colors shadow-sm"
            onClick={onResolve}
          >
            Resolve
          </motion.button>
        )}
      </motion.div>
    )
  },
))

export default StagingSlot
