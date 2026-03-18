import { useMemo } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'motion/react'
import { cardDisplay, suitColor } from '../lib/deck'
import type { Card } from '../lib/types'

function hexToRgba(color: string, alpha: number): string {
  const rgbaMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
  if (rgbaMatch) {
    return `rgba(${rgbaMatch[1]}, ${rgbaMatch[2]}, ${rgbaMatch[3]}, ${alpha})`
  }
  const hex = color.replace('#', '')
  const r = parseInt(hex.substring(0, 2), 16)
  const g = parseInt(hex.substring(2, 4), 16)
  const b = parseInt(hex.substring(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

interface FlyingCardProps {
  from: DOMRect
  to: DOMRect
  faceUp: boolean
  card?: Card | null
  ownerColor?: string
  onComplete: () => void
  duration?: number
  reduced?: boolean
  flipOnLand?: boolean
  size?: 'sm' | 'md'
}

export default function FlyingCard({
  from,
  to,
  faceUp,
  card,
  ownerColor,
  onComplete,
  duration = 1.5,
  reduced = false,
  flipOnLand = false,
  size = 'sm',
}: FlyingCardProps) {
  const width = size === 'md' ? 80 : 56
  const height = size === 'md' ? 112 : 80

  const sx = from.x + from.width / 2 - width / 2
  const sy = from.y + from.height / 2 - height / 2
  const ex = to.x + to.width / 2 - width / 2
  const ey = to.y + to.height / 2 - height / 2

  const mx = (sx + ex) / 2
  const dist = Math.sqrt((ex - sx) ** 2 + (ey - sy) ** 2)
  const arcHeight = Math.min(dist * 0.52, 144)
  const my = Math.min(sy, ey) - arcHeight

  const keyframes = useMemo(() => {
    if (reduced) {
      return { x: [0, ex - sx], y: [0, ey - sy] }
    }
    const steps = 24
    const xs: number[] = []
    const ys: number[] = []
    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      const x = (1 - t) ** 2 * sx + 2 * (1 - t) * t * mx + t ** 2 * ex
      const y = (1 - t) ** 2 * sy + 2 * (1 - t) * t * my + t ** 2 * ey
      xs.push(x - sx)
      ys.push(y - sy)
    }
    return { x: xs, y: ys }
  }, [sx, sy, mx, my, ex, ey, reduced])

  const scaleFrames = reduced
    ? [1, 1]
    : [
        1, 1.01, 1.022, 1.032, 1.04, 1.048, 1.052, 1.053, 1.052,
        1.048, 1.04, 1.032, 1.022, 1.012, 1.004, 0.998, 0.994,
        0.992, 0.994, 0.996, 0.998, 0.999, 1, 1.001, 1,
      ]

  const opacityFrames = reduced
    ? [0.55, 1]
    : [
        0.9, 0.96, 1, 1, 1, 1, 1, 1, 1,
        1, 1, 1, 1, 1, 1, 0.99, 0.98,
        0.96, 0.94, 0.92, 0.9, 0.89, 0.88, 0.9, 0.92,
      ]

  const rotateFrames = reduced
    ? [0, 0]
    : [
        0, -1.2, -2.1, -2.7, -2.8, -2.4, -1.8, -1, -0.3,
        0.3, 0.7, 0.9, 0.9, 0.8, 0.6, 0.4, 0.2,
        0.1, 0, -0.08, 0, 0, 0, 0, 0,
      ]

  const liftFrames = reduced
    ? [0, 0]
    : [0, -2, -4, -6, -8, -8, -7, -5, -3, -1, 0]

  const flipFrames = flipOnLand && !reduced
    ? { rotateY: [0, 0, 0, 180], offset: [0, 0.7, 0.82, 1] }
    : null

  return createPortal(
    <motion.div
      initial={{
        x: 0,
        y: 0,
        scale: 1,
        rotate: 0,
        opacity: reduced ? 0.55 : 0.92,
      }}
      animate={{
        x: keyframes.x,
        y: keyframes.y,
        scale: scaleFrames,
        opacity: opacityFrames,
        rotate: rotateFrames,
      }}
      transition={reduced
        ? { duration: 0.25, ease: 'easeOut' }
        : { duration, ease: [0.22, 0.88, 0.34, 1] }
      }
      onAnimationComplete={onComplete}
      className="pointer-events-none"
      style={{
        position: 'fixed',
        left: sx,
        top: sy,
        width,
        height,
        zIndex: 9999,
        filter: 'drop-shadow(0 12px 24px rgba(0,0,0,0.35)) drop-shadow(0 4px 10px rgba(0,0,0,0.2))',
        willChange: 'transform, opacity',
      }}
    >
      <motion.div
        animate={reduced ? undefined : { y: liftFrames }}
        transition={reduced ? undefined : { duration, ease: [0.22, 0.88, 0.34, 1] }}
        style={{
          width: '100%',
          height: '100%',
          transformStyle: 'preserve-3d',
          transformPerspective: '1200px',
        }}
      >
        <motion.div
          animate={reduced
            ? undefined
            : flipFrames
              ? { rotateX: [-5, -10, -4, 0], rotateY: flipFrames.rotateY }
              : { rotateX: [-5, -11, -6, 0], rotateY: [0, 4, -2, 0] }
          }
          transition={reduced
            ? undefined
            : flipFrames
              ? { duration, ease: [0.22, 0.88, 0.34, 1], times: flipFrames.offset }
              : { duration, ease: [0.22, 0.88, 0.34, 1] }
          }
          className={`w-full h-full rounded-xl shadow-lg flex items-center justify-center ${
            faceUp && card
              ? 'bg-white border border-slate-200'
              : ownerColor
                ? 'border border-white/15'
                : 'bg-gradient-to-br from-blue-900 via-blue-800 to-blue-950 border border-blue-700/50'
          }`}
          style={{
            backfaceVisibility: 'hidden',
            ...( !faceUp && ownerColor ? {
              background: `linear-gradient(145deg, ${hexToRgba(ownerColor, 0.8)} 0%, ${hexToRgba(ownerColor, 0.55)} 40%, ${hexToRgba(ownerColor, 0.65)} 100%)`,
            } : {}),
          }}
        >
          {faceUp && card ? (
            <span
              className={`font-black tracking-tight ${size === 'md' ? 'text-sm' : 'text-xs'}`}
              style={{ color: suitColor(card) }}
            >
              {cardDisplay(card)}
            </span>
          ) : (
            <div
              className={`${size === 'md' ? 'w-8 h-8' : 'w-6 h-6'} rounded-full border-2 flex items-center justify-center`}
              style={{ borderColor: ownerColor ? 'rgba(255,255,255,0.35)' : 'rgba(96,165,250,0.3)' }}
            >
              <span
                className={`font-bold ${size === 'md' ? 'text-base' : 'text-sm'}`}
                style={{ color: ownerColor ? 'rgba(255,255,255,0.6)' : 'rgba(96,165,250,0.5)' }}
              >
                7
              </span>
            </div>
          )}
        </motion.div>
      </motion.div>
    </motion.div>,
    document.body,
  )
}
