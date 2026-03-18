import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { Card, LockInfo } from '../lib/types'
import { suitColor } from '../lib/deck'
import { usePerformanceMode } from '../hooks/usePerformanceMode'
import { CARD_FLIP_SPRING, CARD_HOVER_SPRING, CARD_LAYOUT_SPRING } from '../lib/motionTokens'

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
  const showFace = !!(faceUp && card)
  const isFaceCard = !!card && !card.isJoker && ['J', 'Q', 'K'].includes(card.rank)
  const perfMode = usePerformanceMode()
  const [showTooltip, setShowTooltip] = useState(false)
  const lockerName = lockInfo?.lockerName
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)

  const ownerColorStyle = useMemo(() => {
    if (!ownerColor) return null
    return {
      background: `linear-gradient(145deg, ${hexToRgba(ownerColor, 0.85)} 0%, ${hexToRgba(ownerColor, 0.5)} 35%, ${hexToRgba(ownerColor, 0.6)} 70%, ${hexToRgba(ownerColor, 0.75)} 100%)`,
      boxShadow: `inset 0 1px 0 ${hexToRgba('#ffffff', 0.06)}, 0 4px 12px ${hexToRgba(ownerColor, 0.25)}`,
    }
  }, [ownerColor])

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

  const suitFontSize = size === 'lg'
    ? (isFaceCard ? '1.56rem' : '1.86rem')
    : size === 'md'
      ? (isFaceCard ? '1.26rem' : '1.5rem')
      : (isFaceCard ? '0.98rem' : '1.12rem')
  const rankFontSize = size === 'lg'
    ? '0.92rem'
    : size === 'md'
      ? '0.78rem'
      : '0.62rem'
  const centerRankSize = size === 'lg'
    ? (isFaceCard ? '1.08rem' : '1.3rem')
    : size === 'md'
      ? (isFaceCard ? '0.92rem' : '1.02rem')
      : (isFaceCard ? '0.72rem' : '0.76rem')
  const cornerSuitSize = size === 'lg' ? '0.62rem' : size === 'md' ? '0.52rem' : '0.4rem'
  const cornerTop = size === 'lg' ? '3px' : '2px'
  const cornerLeft = size === 'lg' ? '4px' : '3px'
  const interactive = !!onClick && !disabled
  const hoverMotion = perfMode ? { scale: 1.02, y: -2 } : { scale: 1.045, y: -4, rotate: -0.8 }
  const tapMotion = perfMode ? { scale: 0.985, y: 0 } : { scale: 0.97, y: -1 }

  return (
    <motion.div
      layout="position"
      whileHover={interactive ? hoverMotion : undefined}
      whileTap={interactive ? tapMotion : undefined}
      transition={interactive ? CARD_HOVER_SPRING : CARD_LAYOUT_SPRING}
      onClick={!disabled ? onClick : undefined}
      className={`
        ${sizes[size]}
        relative rounded-xl select-none overflow-visible
        flex flex-col items-center justify-center
        transition-[box-shadow,filter] duration-300
        ${interactive ? 'cursor-pointer hover:shadow-xl' : ''}
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
        perspective: '900px',
        transformStyle: 'preserve-3d',
        filter: highlight ? 'drop-shadow(0 10px 22px rgba(245, 158, 11, 0.22))' : undefined,
        ...(!showFace && ownerColorStyle ? ownerColorStyle : {}),
      }}
    >
      <AnimatePresence mode="wait" initial={false}>
        {showFace && card ? (
          <motion.div
            key={`face-${card.id}`}
            initial={{ rotateY: 84, scale: 0.96, opacity: 0.72 }}
            animate={{ rotateY: 0, scale: 1, opacity: 1 }}
            exit={{ rotateY: -86, scale: 0.96, opacity: 0.58 }}
            transition={CARD_FLIP_SPRING}
            className="absolute inset-0 flex flex-col items-center justify-center w-full h-full"
            style={{
              backfaceVisibility: 'hidden',
              transformStyle: 'preserve-3d',
            }}
          >
            {card.isJoker ? (
              <>
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
                <span style={{ color: '#a855f7', fontSize: suitFontSize }} className="leading-none drop-shadow-[0_2px_6px_rgba(168,85,247,0.22)]">
                  🃏
                </span>
                <span
                  className="font-bold leading-none tracking-tight"
                  style={{ color: '#a855f7', fontSize: size === 'lg' ? '0.58rem' : size === 'md' ? '0.52rem' : '0.42rem', marginTop: '2px', letterSpacing: '0.12em' }}
                >
                  JOKER
                </span>
              </>
            ) : (
              <>
                <div
                  className="absolute flex flex-col items-center leading-none"
                  style={{
                    top: cornerTop,
                    left: cornerLeft,
                    color: suitColor(card),
                  }}
                >
                  <span className="font-black tracking-tight" style={{ fontSize: rankFontSize, lineHeight: 1 }}>
                    {card.rank}
                  </span>
                  <span style={{ fontSize: cornerSuitSize, lineHeight: 1, marginTop: '0px' }}>
                    {SUIT_SYMBOL[card.suit]}
                  </span>
                </div>

                <div
                  className="absolute flex flex-col items-center leading-none"
                  style={{
                    bottom: cornerTop,
                    right: cornerLeft,
                    color: suitColor(card),
                    transform: 'rotate(180deg)',
                  }}
                >
                  <span className="font-black tracking-tight" style={{ fontSize: rankFontSize, lineHeight: 1 }}>
                    {card.rank}
                  </span>
                  <span style={{ fontSize: cornerSuitSize, lineHeight: 1, marginTop: '0px' }}>
                    {SUIT_SYMBOL[card.suit]}
                  </span>
                </div>

                <div className="flex flex-col items-center justify-center" style={{ gap: isFaceCard ? '3px' : '2px' }}>
                  <span
                    className="leading-none"
                    style={{
                      color: suitColor(card),
                      fontSize: suitFontSize,
                      filter: isFaceCard ? 'drop-shadow(0 2px 6px rgba(15, 23, 42, 0.12))' : undefined,
                    }}
                  >
                    {SUIT_SYMBOL[card.suit]}
                  </span>

                  <span
                    className="font-black leading-none tracking-tight"
                    style={{
                      color: suitColor(card),
                      fontSize: centerRankSize,
                      padding: isFaceCard ? '2px 7px' : undefined,
                      borderRadius: isFaceCard ? '999px' : undefined,
                      background: isFaceCard ? 'linear-gradient(180deg, rgba(15,23,42,0.08), rgba(15,23,42,0.02))' : undefined,
                      boxShadow: isFaceCard ? 'inset 0 1px 0 rgba(255,255,255,0.7)' : undefined,
                      letterSpacing: isFaceCard ? '0.12em' : '0.02em',
                      minWidth: isFaceCard ? '1.85em' : undefined,
                      textAlign: 'center',
                    }}
                  >
                    {card.rank}
                  </span>
                </div>
              </>
            )}

            {card.rank === '7' && !card.isJoker && (
              <motion.span
                initial={{ scale: 0.7, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={CARD_LAYOUT_SPRING}
                className="absolute -top-1 -right-1 bg-amber-400 text-amber-900 text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center shadow-sm"
              >
                0
              </motion.span>
            )}
          </motion.div>
        ) : (
          <motion.div
            key={`back-${ownerColor ?? 'default'}`}
            initial={{ rotateY: -84, scale: 0.965, opacity: 0.76 }}
            animate={{ rotateY: 0, scale: 1, opacity: 1 }}
            exit={{ rotateY: 88, scale: 0.965, opacity: 0.58 }}
            transition={CARD_FLIP_SPRING}
            className={perfMode ? 'absolute inset-0 rounded-xl' : 'card-shimmer absolute inset-0 rounded-xl'}
            style={ownerColor && !perfMode ? {
              '--shimmer-color': ownerColor,
            } as React.CSSProperties : undefined}
          >
            <div className="flex items-center justify-center h-full">
              <motion.div
                animate={perfMode ? undefined : { scale: [1, 1.03, 1] }}
                transition={perfMode ? undefined : { duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
                className="w-7 h-7 rounded-full border flex items-center justify-center"
                style={{
                  borderColor: ownerColor ? 'rgba(255,255,255,0.15)' : 'rgba(96,165,250,0.20)',
                  background: ownerColor ? 'rgba(255,255,255,0.04)' : 'rgba(96,165,250,0.06)',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)',
                }}
              >
                <span
                  className="font-bold text-base"
                  style={{ color: ownerColor ? 'rgba(255,255,255,0.4)' : 'rgba(96,165,250,0.40)' }}
                >
                  7
                </span>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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
            <motion.div
              id="lock-tooltip"
              role="tooltip"
              initial={{ opacity: 0, y: 4, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 2, scale: 0.96 }}
              transition={CARD_LAYOUT_SPRING}
              className="absolute -top-9 left-1/2 -translate-x-1/2 bg-slate-900 border border-red-500/50 text-red-300 text-[10px] font-medium px-2 py-1 rounded-lg shadow-lg whitespace-nowrap z-30 pointer-events-none"
            >
              Locked by {lockerName}
            </motion.div>
          )}
        </div>
      )}

      {known && !faceUp && (
        <motion.span
          initial={{ opacity: 0, y: 3 }}
          animate={{ opacity: 1, y: 0 }}
          transition={CARD_LAYOUT_SPRING}
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
