import { useState, useRef, useCallback, useEffect, useMemo, memo } from 'react'
import { usePerformanceMode } from '../hooks/usePerformanceMode'
import { useReducedMotion } from '../hooks/useReducedMotion'
import { motion, type Transition } from 'framer-motion'
import LuckySevenCardBack from './LuckySevenCardBack'
import KingLockOverlay from './KingLockOverlay'

/** Shared spring configs for premium buttery-smooth motion */
const SPRING_HOVER: Transition = { type: 'spring', stiffness: 350, damping: 22, mass: 0.6 }
const SPRING_FLIP: Transition  = { type: 'spring', stiffness: 160, damping: 20, mass: 0.9 }
import type { Card, LockInfo } from '../lib/types'
import { suitColor } from '../lib/deck'

/** Convert a hex color or rgba() string to rgba with custom alpha */
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

/** Suit symbol lookup */
const SUIT_SYMBOL: Record<string, string> = {
  hearts: '\u2665',
  diamonds: '\u2666',
  clubs: '\u2663',
  spades: '\u2660',
}

interface CardViewProps {
  card?: Card | null
  faceUp?: boolean
  known?: boolean
  locked?: boolean
  lockInfo?: LockInfo | null
  onClick?: () => void
  disabled?: boolean
  highlight?: boolean
  size?: 'sm' | 'md' | 'lg'
  label?: string
  /** Player owner color (tinted) — applied to face-down card border & center circle */
  ownerColor?: string
}

const sizes = {
  sm: 'w-12 min-w-0 h-[4.25rem] text-xs sm:w-14 sm:h-20',
  md: 'w-[4.25rem] h-24 text-sm sm:w-20 sm:h-28',
  lg: 'w-20 h-28 text-base sm:w-24 sm:h-34',
}

function CardView({
  card,
  faceUp = false,
  known = false,
  locked = false,
  lockInfo,
  onClick,
  disabled = false,
  highlight = false,
  size = 'md',
  label,
  ownerColor,
}: CardViewProps) {
  const showFace = faceUp && card
  const perfMode = usePerformanceMode()
  const { reduced } = useReducedMotion()
  const [showTooltip, setShowTooltip] = useState(false)
  const [showRevealFlash, setShowRevealFlash] = useState(false)
  const [revealFlashKey, setRevealFlashKey] = useState(0)
  const [prevLocked, setPrevLocked] = useState(locked)
  const lockerName = lockInfo?.lockerName
  const prevShowFaceRef = useRef(!!showFace)
  const mountedRef = useRef(false)

  const faceDownFrameStyle = useMemo(() => {
    if (showFace || !ownerColor) return null
    return {
      borderColor: hexToRgba(ownerColor, 0.26),
      boxShadow: `0 10px 24px ${hexToRgba(ownerColor, 0.18)}, 0 4px 14px rgba(0,0,0,0.28), inset 0 1px 0 ${hexToRgba('#ffffff', 0.05)}`,
    }
  }, [ownerColor, showFace])
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)

  const handleTouchStart = useCallback(() => {
    if (!lockerName) return
    longPressRef.current = setTimeout(() => setShowTooltip(true), 400)
  }, [lockerName])

  const handleTouchEnd = useCallback(() => {
    if (longPressRef.current) clearTimeout(longPressRef.current)
  }, [])

  useEffect(() => {
    if (!showTooltip) return
    const handler = (e: TouchEvent) => {
      if (tooltipRef.current && !tooltipRef.current.contains(e.target as Node)) {
        setShowTooltip(false)
      }
    }
    document.addEventListener('touchstart', handler, { passive: true })
    return () => document.removeEventListener('touchstart', handler)
  }, [showTooltip])

  useEffect(() => {
    const wasShowingFace = prevShowFaceRef.current
    const isShowingFace = !!showFace
    let frameId: number | null = null

    if (mountedRef.current && isShowingFace && !wasShowingFace) {
      frameId = requestAnimationFrame(() => {
        setRevealFlashKey((prev) => prev + 1)
        setShowRevealFlash(true)
      })
    } else if (!isShowingFace) {
      frameId = requestAnimationFrame(() => {
        setShowRevealFlash(false)
      })
    }

    prevShowFaceRef.current = isShowingFace
    mountedRef.current = true
    return () => {
      if (frameId != null) cancelAnimationFrame(frameId)
    }
  }, [showFace])

  useEffect(() => {
    setPrevLocked(locked)
  }, [locked])

  // ─── Font sizes per card size ───
  const suitFontSize = size === 'lg' ? '1.8rem' : size === 'md' ? '1.5rem' : '1.1rem'
  const rankFontSize = size === 'lg' ? '0.85rem' : size === 'md' ? '0.75rem' : '0.58rem'
  const cornerSuitSize = size === 'lg' ? '0.6rem' : size === 'md' ? '0.52rem' : '0.4rem'
  const isFaceCard = card && !card.isJoker && (card.rank === 'J' || card.rank === 'Q' || card.rank === 'K')
  const cornerTop = size === 'lg' ? '3px' : '2px'
  const cornerLeft = size === 'lg' ? '4px' : '3px'
  const shouldAnimateLockEntrance = locked && !prevLocked

  return (
    <motion.div
      whileHover={onClick && !disabled ? { scale: 1.07, y: -5, rotate: -1 } : undefined}
      whileTap={onClick && !disabled ? { scale: 0.95, y: 0 } : undefined}
      transition={onClick && !disabled ? SPRING_HOVER : undefined}
      onClick={!disabled ? onClick : undefined}
      className={`
        ${sizes[size]}
        relative rounded-xl select-none
        flex flex-col items-center justify-center
        transition-shadow duration-300
        ${onClick && !disabled ? 'cursor-pointer hover:shadow-xl' : ''}
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
        ${highlight ? 'ring-2 ring-gold ring-offset-2 ring-offset-transparent shadow-gold/30 shadow-xl' : ''}
        ${showFace
          ? 'bg-white border border-slate-200/80 shadow-lg'
          : 'bg-slate-950 border border-white/[0.08] transition-[border-color] duration-200 shadow-md'
        }
      `}
      style={{
        perspective: '600px',
        ...(!showFace && faceDownFrameStyle ? faceDownFrameStyle : {}),
      }}
    >
      {showFace ? (
        <motion.div
          initial={{ rotateY: 90, scale: 0.92 }}
          animate={{ rotateY: 0, scale: 1 }}
          transition={SPRING_FLIP}
          className="flex flex-col items-center justify-center w-full h-full"
          style={{ backfaceVisibility: 'hidden' }}
        >
          {card.isJoker ? (
            /* ─── Joker card ─── */
            <>
              {/* Top-left corner */}
              <span
                className="absolute font-bold leading-none"
                style={{
                  fontSize: rankFontSize,
                  top: cornerTop,
                  left: cornerLeft,
                  color: '#a855f7',
                }}
              >
                <span style={{ fontSize: cornerSuitSize }}>🃏</span>
              </span>
              {/* Center */}
              <span style={{ color: '#a855f7', fontSize: suitFontSize }} className="leading-none">
                🃏
              </span>
              <span
                className="font-bold leading-none tracking-tight"
                style={{ color: '#a855f7', fontSize: size === 'lg' ? '0.55rem' : size === 'md' ? '0.5rem' : '0.4rem', marginTop: '2px' }}
              >
                JOKER
              </span>
            </>
          ) : (
            /* ─── Normal card — tabletop style ─── */
            <>
              {/* Top-left corner: rank + suit */}
              <div
                className="absolute flex flex-col items-center leading-none"
                style={{
                  top: cornerTop,
                  left: cornerLeft,
                  color: suitColor(card),
                }}
              >
                <span
                  className={isFaceCard ? 'font-black' : 'font-bold'}
                  style={{ fontSize: rankFontSize, lineHeight: 1, fontStyle: isFaceCard ? 'italic' : 'normal' }}
                >
                  {card.rank}
                </span>
                <span style={{ fontSize: cornerSuitSize, lineHeight: 1, marginTop: '0px' }}>
                  {SUIT_SYMBOL[card.suit]}
                </span>
              </div>

              {/* Bottom-right corner: mirrored rank + suit */}
              <div
                className="absolute flex flex-col items-center leading-none"
                style={{
                  bottom: cornerTop,
                  right: cornerLeft,
                  color: suitColor(card),
                  transform: 'rotate(180deg)',
                }}
              >
                <span
                  className={isFaceCard ? 'font-black' : 'font-bold'}
                  style={{ fontSize: rankFontSize, lineHeight: 1, fontStyle: isFaceCard ? 'italic' : 'normal' }}
                >
                  {card.rank}
                </span>
                <span style={{ fontSize: cornerSuitSize, lineHeight: 1, marginTop: '0px' }}>
                  {SUIT_SYMBOL[card.suit]}
                </span>
              </div>

              {/* Center: large suit icon */}
              <span
                className="leading-none"
                style={{
                  color: suitColor(card),
                  fontSize: suitFontSize,
                }}
              >
                {SUIT_SYMBOL[card.suit]}
              </span>

              {/* Rank below suit */}
              <span
                className={isFaceCard ? 'font-black leading-none' : 'font-extrabold leading-none'}
                style={{
                  color: suitColor(card),
                  fontSize: size === 'lg' ? '0.85rem' : size === 'md' ? '0.72rem' : '0.55rem',
                  marginTop: '1px',
                  fontStyle: isFaceCard ? 'italic' : 'normal',
                }}
              >
                {card.rank}
              </span>
            </>
          )}

          {/* Seven = 0 badge */}
          {card.rank === '7' && !card.isJoker && (
            <span className="absolute -top-1 -right-1 bg-amber-400 text-amber-900 text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center shadow-sm">
              0
            </span>
          )}
        </motion.div>
      ) : (
        /* ─── Face-down card back ─── */
        <div
          className={`absolute inset-0 rounded-xl overflow-hidden l7-cardback-shell${onClick && !disabled ? ' l7-cardback-shell-interactive' : ''}`}
          style={ownerColor ? {
            '--l7-cardback-accent': ownerColor,
            '--l7-cardback-accent-soft': hexToRgba(ownerColor, 0.18),
          } as React.CSSProperties : undefined}
        >
          <LuckySevenCardBack accentColor={ownerColor} className="h-full w-full" />
          {!perfMode && (
            <div
              className="card-shimmer pointer-events-none absolute inset-0 opacity-40 mix-blend-screen"
              style={{
                '--shimmer-color': ownerColor
                  ? hexToRgba(ownerColor, 0.1)
                  : 'rgba(125, 211, 252, 0.08)',
              } as React.CSSProperties}
            />
          )}
        </div>
      )}

      {showRevealFlash && showFace && !perfMode && !reduced && (
        <motion.div
          key={`reveal-${revealFlashKey}`}
          initial={{ opacity: 0, scale: 0.82 }}
          animate={{ opacity: [0, 0.95, 0], scale: [0.82, 1.03, 1.24] }}
          transition={{ duration: 0.55, times: [0, 0.42, 1], ease: 'easeOut' }}
          onAnimationComplete={() => setShowRevealFlash(false)}
          className="pointer-events-none absolute inset-0 rounded-xl overflow-hidden"
          style={{
            zIndex: 6,
            background: 'radial-gradient(circle at 50% 50%, rgba(255,255,255,0.85) 0%, rgba(125,211,252,0.24) 18%, rgba(250,204,21,0.14) 34%, transparent 68%)',
            mixBlendMode: 'screen',
          }}
        >
          <motion.div
            initial={{ opacity: 0, x: '-120%' }}
            animate={{ opacity: [0, 0.65, 0], x: ['-120%', '120%'] }}
            transition={{ duration: 0.48, times: [0, 0.28, 1], ease: [0.22, 0.9, 0.36, 1] }}
            className="absolute inset-y-[-16%] left-[-40%] w-[52%] rotate-[14deg]"
            style={{
              background: 'linear-gradient(120deg, transparent 0%, rgba(255,255,255,0.06) 26%, rgba(255,255,255,0.4) 48%, rgba(250,204,21,0.22) 58%, transparent 84%)',
            }}
          />
        </motion.div>
      )}

      <KingLockOverlay
        locked={locked}
        size={size}
        animateOnEnter={shouldAnimateLockEntrance}
        motionEnabled={!perfMode && !reduced}
      />

      {/* Lock tooltip trigger — hover + long-press */}
      {locked && lockerName && (
        <div
          ref={tooltipRef}
          className="absolute inset-0 z-20 cursor-help"
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          role="group"
          aria-describedby={showTooltip ? 'lock-tooltip' : undefined}
        >
          {showTooltip && (
            <div
              id="lock-tooltip"
              role="tooltip"
              className="absolute -top-9 left-1/2 -translate-x-1/2 bg-slate-900 border border-red-500/50 text-red-300 text-[10px] font-medium px-2 py-1 rounded-lg shadow-lg whitespace-nowrap z-30 pointer-events-none"
            >
              Locked by {lockerName}
            </div>
          )}
        </div>
      )}

      {known && !faceUp && (
        <motion.span
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 500, damping: 20, mass: 0.5 }}
          className="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-emerald-600 text-white text-[9px] font-semibold px-1.5 py-0.5 rounded-full z-10"
        >
          Known
        </motion.span>
      )}

      {label && (
        <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[10px] text-slate-400 whitespace-nowrap">
          {label}
        </span>
      )}
    </motion.div>
  )
}

export default memo(CardView)
