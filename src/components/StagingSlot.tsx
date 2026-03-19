import { forwardRef, memo, useRef, useEffect, useCallback, useState } from 'react'
import { motion, AnimatePresence, useAnimate, type PanInfo } from 'framer-motion'
import CardView from './CardView'
import type { Card } from '../lib/types'
import { usePerformanceMode } from '../hooks/usePerformanceMode'

const SPRING_ENTRY = { type: 'spring' as const, stiffness: 220, damping: 20, mass: 0.9 }
const SPRING_EXIT = { type: 'spring' as const, stiffness: 260, damping: 26, mass: 0.7 }
const FLOAT_CONFIG = { duration: 3.5, ease: 'easeInOut' as const, repeat: Infinity }
const CROSSFADE_SPRING = { type: 'spring' as const, stiffness: 300, damping: 22, mass: 0.6 }

export interface StagingDragPoint {
  x: number
  y: number
  sourceRect: DOMRect
}

interface StagingSlotProps {
  card: Card | null
  faceUp: boolean
  active: boolean
  onResolve?: () => void
  ownerColor?: string
  interactive?: boolean
  pending?: boolean
  dropHint?: string | null
  onDragMove?: (point: StagingDragPoint) => void
  onDragEnd?: (point: StagingDragPoint) => void
  onDragCancel?: () => void
}

const StagingSlot = memo(forwardRef<HTMLDivElement, StagingSlotProps>(
  function StagingSlot({
    card,
    faceUp,
    active,
    onResolve,
    ownerColor,
    interactive = false,
    pending = false,
    dropHint,
    onDragMove,
    onDragEnd,
    onDragCancel,
  }, ref) {
    const [scope, animate] = useAnimate()
    const [showRevealBeat, setShowRevealBeat] = useState(false)
    const [revealBeatKey, setRevealBeatKey] = useState(0)
    const prevActive = useRef(active)
    const prevVisualRef = useRef({ active, faceUp })
    const perfMode = usePerformanceMode()

    const emitDragPoint = useCallback((handler?: (point: StagingDragPoint) => void, info?: PanInfo) => {
      if (!handler || !scope.current || !info) return
      handler({
        x: info.point.x,
        y: info.point.y,
        sourceRect: scope.current.getBoundingClientRect(),
      })
    }, [scope])

    useEffect(() => {
      if (active && prevActive.current && scope.current) {
        animate(scope.current, { opacity: [0.7, 1], scale: [0.96, 1] }, CROSSFADE_SPRING)
      }
      prevActive.current = active
    }, [active, animate, card, faceUp, scope])

    useEffect(() => {
      const prev = prevVisualRef.current
      let frameId: number | null = null
      if (active && prev.active && faceUp && !prev.faceUp) {
        frameId = requestAnimationFrame(() => {
          setRevealBeatKey((current) => current + 1)
          setShowRevealBeat(true)
        })
      } else if (!active || !faceUp) {
        frameId = requestAnimationFrame(() => {
          setShowRevealBeat(false)
        })
      }
      prevVisualRef.current = { active, faceUp }
      return () => {
        if (frameId != null) cancelAnimationFrame(frameId)
      }
    }, [active, faceUp])

    const statusHint = dropHint ?? (pending ? 'Waiting for reveal...' : interactive ? 'Drag to a slot or discard' : null)

    return (
      <div
        ref={ref}
        className={`text-center relative ${active && !perfMode ? 'staging-active' : ''}`}
        style={{ minWidth: '64px', borderRadius: '12px' }}
      >
        <p className={`text-[10px] mb-1 font-medium ${active ? 'text-primary' : 'text-muted-foreground'}`}>
          {active ? (pending ? 'Resolving' : 'In play') : '\u00A0'}
        </p>

        <AnimatePresence mode="wait">
          {active ? (
            <div
              className="relative"
              style={perfMode ? undefined : {
                filter: 'drop-shadow(0 8px 20px rgba(0,0,0,0.35)) drop-shadow(0 3px 8px rgba(0,0,0,0.2)) drop-shadow(0 0 12px rgba(251,191,36,0.12))',
              }}
            >
              {showRevealBeat && !perfMode && (
                <motion.div
                  key={`staging-reveal-${revealBeatKey}`}
                  initial={{ opacity: 0, scale: 0.76 }}
                  animate={{ opacity: [0, 0.9, 0], scale: [0.76, 1.04, 1.28] }}
                  transition={{ duration: 0.62, times: [0, 0.42, 1], ease: 'easeOut' }}
                  onAnimationComplete={() => setShowRevealBeat(false)}
                  className="pointer-events-none absolute inset-[-10px] rounded-[18px]"
                  style={{
                    background: 'radial-gradient(circle at 50% 50%, rgba(255,255,255,0.82) 0%, rgba(125,211,252,0.24) 20%, rgba(250,204,21,0.15) 38%, transparent 72%)',
                    mixBlendMode: 'screen',
                  }}
                >
                  <motion.div
                    initial={{ opacity: 0, x: '-120%' }}
                    animate={{ opacity: [0, 0.6, 0], x: ['-120%', '140%'] }}
                    transition={{ duration: 0.56, times: [0, 0.28, 1], ease: [0.22, 0.9, 0.36, 1] }}
                    className="absolute inset-y-[-16%] left-[-36%] w-[50%] rotate-[14deg]"
                    style={{
                      background: 'linear-gradient(120deg, transparent 0%, rgba(255,255,255,0.05) 26%, rgba(255,255,255,0.36) 49%, rgba(250,204,21,0.2) 58%, transparent 84%)',
                    }}
                  />
                </motion.div>
              )}

              <motion.div
                key={`staged-${faceUp ? 'up' : 'down'}`}
                ref={scope}
                initial={{ opacity: 0, scale: 0.78, y: 12 }}
                animate={perfMode
                  ? { opacity: 1, scale: 1, y: 0 }
                  : { opacity: 1, scale: 1, y: [0, -5, 0] }
                }
                exit={{ opacity: 0, scale: 0.85, y: -10 }}
                whileHover={interactive ? { scale: 1.045, y: -7, rotate: -1.2 } : undefined}
                whileDrag={interactive ? { scale: 1.085, y: -11, rotate: 2.5, zIndex: 20 } : undefined}
                drag={interactive}
                dragMomentum={false}
                dragElastic={0.08}
                dragSnapToOrigin
                onDrag={(_, info) => emitDragPoint(onDragMove, info)}
                onDragEnd={(_, info) => {
                  emitDragPoint(onDragEnd, info)
                  onDragCancel?.()
                }}
                transition={perfMode
                  ? { opacity: SPRING_ENTRY, scale: SPRING_ENTRY, default: SPRING_EXIT }
                  : { opacity: SPRING_ENTRY, scale: SPRING_ENTRY, y: FLOAT_CONFIG, default: SPRING_EXIT }
                }
                style={{ willChange: 'transform, opacity', touchAction: interactive ? 'none' : undefined }}
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

        {statusHint && active && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={SPRING_ENTRY}
            className="mt-1 text-[10px] font-semibold"
            style={{ color: dropHint ? '#fbbf24' : pending ? 'var(--text-dim)' : 'var(--text-muted)' }}
          >
            {statusHint}
          </motion.div>
        )}

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
