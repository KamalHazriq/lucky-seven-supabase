import { useMemo } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'motion/react'
import { cardDisplay, suitColor } from '../lib/deck'
import type { Card } from '../lib/types'

/** Convert hex/rgba color string to rgba with custom alpha */
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
  /** If true, use a simple fade+slide instead of arc (reduced motion) */
  reduced?: boolean
  /** If true, play a 3D flip at landing (card becomes face-up on arrival) */
  flipOnLand?: boolean
  /** Size variant — 'sm' for flying tokens, 'md' for staging card */
  size?: 'sm' | 'md'
}

/**
 * Premium flying card animation — floaty, slow, indie poker vibe.
 *
 * v1.5: GPU-optimized via translate3d (no left/top layout thrash).
 * Duration 1400–1700ms on desktop, gentle cubic-bezier easing.
 * 20-step quadratic bezier arc, subtle scale lift (~1.03 mid-flight),
 * soft drop shadows, smooth opacity settle.
 *
 * Reduced motion fallback: clean 250ms fade + short slide.
 * Rendered as a portal into document.body (overlay layer).
 */
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

  // Compute start/end centers
  const sx = from.x + from.width / 2 - width / 2
  const sy = from.y + from.height / 2 - height / 2
  const ex = to.x + to.width / 2 - width / 2
  const ey = to.y + to.height / 2 - height / 2

  // Midpoint with upward arc offset — proportional to distance
  // Premium feel: higher arc with gentle apex for floaty poker-table motion
  const mx = (sx + ex) / 2
  const dist = Math.sqrt((ex - sx) ** 2 + (ey - sy) ** 2)
  const arcHeight = Math.min(dist * 0.55, 150)
  const my = Math.min(sy, ey) - arcHeight

  // Generate high-res keyframe offsets along quadratic bezier (20 steps)
  // Using translate offsets from starting position for GPU-only transforms
  const keyframes = useMemo(() => {
    if (reduced) {
      return { x: [0, ex - sx], y: [0, ey - sy] }
    }
    const steps = 20
    const xs: number[] = []
    const ys: number[] = []
    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      // Quadratic bezier: B(t) = (1-t)^2 P0 + 2(1-t)t P1 + t^2 P2
      const x = (1 - t) ** 2 * sx + 2 * (1 - t) * t * mx + t ** 2 * ex
      const y = (1 - t) ** 2 * sy + 2 * (1 - t) * t * my + t ** 2 * ey
      // Store as offsets from starting position
      xs.push(x - sx)
      ys.push(y - sy)
    }
    return { x: xs, y: ys }
  }, [sx, sy, mx, my, ex, ey, reduced])

  // Scale keyframes — subtle lift to ~1.05 mid-flight, clean landing (less distracting)
  const scaleFrames = reduced
    ? [1, 1]
    : [
        1, 1.01, 1.025, 1.038, 1.045, 1.05, 1.05, 1.048, 1.04,
        1.03, 1.02, 1.01, 1.005, 1.0, 0.995, 0.99, 0.988,
        0.99, 0.995, 0.998, 1.0,
      ]

  // Opacity — fully visible, clean settle
  const opacityFrames = reduced
    ? [0.5, 1]
    : [
        0.92, 1, 1, 1, 1, 1, 1, 1, 1,
        1, 1, 1, 1, 1, 1, 1, 1,
        0.98, 0.95, 0.92, 0.88,
      ]

  // Rotation keyframes — gentler tilt for organic feel
  const rotateFrames = reduced
    ? [0, 0]
    : [
        0, -0.8, -1.5, -2.0, -1.8, -1.2, -0.5, 0, 0.4,
        0.6, 0.6, 0.5, 0.3, 0.1, 0, -0.05, 0,
        0, 0, 0, 0,
      ]

  const reducedDuration = 0.25

  // Flip on land: card starts showing back, flips to face at ~80% of flight
  void flipOnLand // Reserved for future use

  return createPortal(
    <motion.div
      initial={{
        x: 0,
        y: 0,
        scale: 1,
        rotate: 0,
        opacity: reduced ? 0.5 : 1,
      }}
      animate={{
        x: keyframes.x,
        y: keyframes.y,
        scale: scaleFrames,
        opacity: opacityFrames,
        rotate: rotateFrames,
      }}
      transition={reduced
        ? { duration: reducedDuration, ease: 'easeOut' }
        : {
            duration,
            // Premium: gentle launch, float at apex, slow elegant landing
            ease: [0.22, 0.9, 0.36, 1],
          }
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
        filter: 'drop-shadow(0 10px 24px rgba(0,0,0,0.45)) drop-shadow(0 4px 10px rgba(0,0,0,0.25))',
        willChange: 'transform, opacity',
      }}
    >
      <div
        className={`w-full h-full rounded-xl shadow-lg flex items-center justify-center ${
          faceUp && card
            ? 'bg-white border border-slate-200'
            : ownerColor
              ? 'border border-white/15'
              : 'bg-gradient-to-br from-blue-900 via-blue-800 to-blue-950 border border-blue-700/50'
        }`}
        style={{
          ...(!faceUp && ownerColor ? {
            background: `linear-gradient(145deg, ${hexToRgba(ownerColor, 0.8)} 0%, ${hexToRgba(ownerColor, 0.55)} 40%, ${hexToRgba(ownerColor, 0.65)} 100%)`,
          } : {}),
        }}
      >
        {faceUp && card ? (
          <span
            className={`font-bold ${size === 'md' ? 'text-sm' : 'text-xs'}`}
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
      </div>
    </motion.div>,
    document.body,
  )
}
