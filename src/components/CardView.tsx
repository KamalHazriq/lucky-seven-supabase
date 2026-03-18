import { useState, useRef, useCallback, useEffect, useMemo, memo } from 'react'
import { usePerformanceMode } from '../hooks/usePerformanceMode'
import { motion, type Transition } from 'framer-motion'

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
  sm: 'w-14 min-w-0 h-20 text-xs',
  md: 'w-20 h-28 text-sm',
  lg: 'w-24 h-34 text-base',
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
  const [showTooltip, setShowTooltip] = useState(false)
  const lockerName = lockInfo?.lockerName

  const ownerColorStyle = useMemo(() => {
    if (!ownerColor) return null
    return {
      background: `linear-gradient(145deg, ${hexToRgba(ownerColor, 0.85)} 0%, ${hexToRgba(ownerColor, 0.5)} 35%, ${hexToRgba(ownerColor, 0.6)} 70%, ${hexToRgba(ownerColor, 0.75)} 100%)`,
      boxShadow: `inset 0 1px 0 ${hexToRgba('#ffffff', 0.06)}, 0 4px 12px ${hexToRgba(ownerColor, 0.25)}`,
    }
  }, [ownerColor])
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

  // ─── Font sizes per card size ───
  const suitFontSize = size === 'lg' ? '1.6rem' : size === 'md' ? '1.25rem' : '0.95rem'
  const rankFontSize = size === 'lg' ? '0.7rem' : size === 'md' ? '0.6rem' : '0.45rem'
  const cornerSuitSize = size === 'lg' ? '0.55rem' : size === 'md' ? '0.45rem' : '0.35rem'
  const cornerTop = size === 'lg' ? '3px' : '2px'
  const cornerLeft = size === 'lg' ? '4px' : '3px'

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
          : ownerColor
            ? 'border border-white/[0.08] hover:border-white/25 transition-[border-color] duration-200 shadow-md hover:shadow-lg'
            : 'bg-gradient-to-br from-blue-900 via-blue-800 to-blue-950 border border-blue-700/50 shadow-md'
        }
      `}
      style={{
        perspective: '600px',
        ...(!showFace && ownerColorStyle ? ownerColorStyle : {}),
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
                <span className="font-bold" style={{ fontSize: rankFontSize, lineHeight: 1 }}>
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
                <span className="font-bold" style={{ fontSize: rankFontSize, lineHeight: 1 }}>
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
                className="font-extrabold leading-none"
                style={{
                  color: suitColor(card),
                  fontSize: size === 'lg' ? '0.75rem' : size === 'md' ? '0.6rem' : '0.5rem',
                  marginTop: '1px',
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
          className={perfMode ? 'absolute inset-0 rounded-xl' : 'card-shimmer absolute inset-0 rounded-xl'}
          style={ownerColor && !perfMode ? {
            '--shimmer-color': ownerColor,
          } as React.CSSProperties : undefined}
        >
          <div className="flex items-center justify-center h-full">
            <div
              className="w-7 h-7 rounded-full border flex items-center justify-center"
              style={{
                borderColor: ownerColor ? 'rgba(255,255,255,0.15)' : 'rgba(96,165,250,0.20)',
                background: ownerColor ? 'rgba(255,255,255,0.04)' : 'rgba(96,165,250,0.06)',
              }}
            >
              <span
                className="font-bold text-base"
                style={{ color: ownerColor ? 'rgba(255,255,255,0.4)' : 'rgba(96,165,250,0.40)' }}
              >
                7
              </span>
            </div>
          </div>
        </div>
      )}

      {/* King lock overlay — visible on locked cards */}
      {locked && (
        showFace ? (
          <div className="absolute top-0.5 right-0.5 z-10 pointer-events-none flex items-center justify-center w-5 h-5 bg-red-900/80 rounded-full shadow-md">
            <span className="text-[10px] leading-none">🔒</span>
          </div>
        ) : (
          <div className="absolute inset-0 rounded-xl bg-red-900/25 backdrop-blur-[1px] flex items-center justify-center z-10 pointer-events-none">
            <div className="flex flex-col items-center">
              <span className="text-2xl drop-shadow-lg">K</span>
              <span className="text-red-400 text-lg drop-shadow-lg" style={{ lineHeight: 1 }}>🔒</span>
            </div>
          </div>
        )
      )}

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
        <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-emerald-600 text-white text-[9px] font-semibold px-1.5 py-0.5 rounded-full z-10">
          Known
        </span>
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
