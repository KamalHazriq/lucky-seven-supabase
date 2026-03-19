import { useId } from 'react'

interface LuckySevenCardBackProps {
  accentColor?: string
  className?: string
}

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

export default function LuckySevenCardBack({
  accentColor,
  className,
}: LuckySevenCardBackProps) {
  const gradientId = useId().replace(/:/g, '')
  const accent = accentColor ?? '#7dd3fc'
  const signal = '#dbeafe'
  const gold = '#facc15'
  const accentSoft = hexToRgba(accent, accentColor ? 0.18 : 0.1)
  const accentStroke = hexToRgba(accent, accentColor ? 0.42 : 0.24)
  const signalStroke = hexToRgba(signal, 0.82)

  const topSeven = (
    <>
      <path
        d="M30 33H70L48 55"
        fill="none"
        stroke={hexToRgba('#ffffff', 0.08)}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="7.5"
      />
      <path
        d="M31 33H69L48.5 54.5"
        fill="none"
        stroke={`url(#${gradientId}-signal)`}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="4"
      />
    </>
  )

  return (
    <svg
      viewBox="0 0 100 140"
      className={className}
      aria-hidden="true"
      focusable="false"
      preserveAspectRatio="none"
      shapeRendering="geometricPrecision"
    >
      <defs>
        <linearGradient id={`${gradientId}-bg`} x1="0" y1="0" x2="100" y2="140" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#07111f" />
          <stop offset="56%" stopColor="#0d1830" />
          <stop offset="100%" stopColor="#050a14" />
        </linearGradient>
        <radialGradient id={`${gradientId}-glow`} cx="50%" cy="50%" r="60%">
          <stop offset="0%" stopColor={accentSoft} />
          <stop offset="46%" stopColor={hexToRgba('#7dd3fc', 0.08)} />
          <stop offset="100%" stopColor="rgba(0,0,0,0)" />
        </radialGradient>
        <linearGradient id={`${gradientId}-frame`} x1="14" y1="10" x2="86" y2="130" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={hexToRgba('#ffffff', 0.14)} />
          <stop offset="48%" stopColor={accentStroke} />
          <stop offset="100%" stopColor={hexToRgba(gold, 0.34)} />
        </linearGradient>
        <linearGradient id={`${gradientId}-signal`} x1="30" y1="33" x2="70" y2="55" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={signalStroke} />
          <stop offset="72%" stopColor={signal} />
          <stop offset="100%" stopColor={hexToRgba(gold, 0.9)} />
        </linearGradient>
      </defs>

      <rect x="0.5" y="0.5" width="99" height="139" rx="14" fill={`url(#${gradientId}-bg)`} />
      <rect x="0.5" y="0.5" width="99" height="139" rx="14" fill={`url(#${gradientId}-glow)`} opacity="0.9" />

      <rect
        x="7"
        y="7"
        width="86"
        height="126"
        rx="10"
        fill="none"
        stroke={hexToRgba('#ffffff', 0.06)}
        strokeWidth="1"
      />
      <path
        d="M16 12H84L88 16V124L84 128H16L12 124V16Z"
        fill={hexToRgba('#040815', 0.18)}
        stroke={`url(#${gradientId}-frame)`}
        strokeWidth="1.4"
      />
      <rect
        x="14"
        y="14"
        width="72"
        height="112"
        rx="7"
        fill="none"
        stroke={hexToRgba('#ffffff', 0.05)}
        strokeWidth="0.8"
      />

      <path
        d="M18 18H28L24 22H18"
        fill="none"
        stroke={accentStroke}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.4"
      />
      <path
        d="M82 18H72L76 22H82"
        fill="none"
        stroke={accentStroke}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.4"
      />
      <path
        d="M18 122H28L24 118H18"
        fill="none"
        stroke={accentStroke}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.4"
      />
      <path
        d="M82 122H72L76 118H82"
        fill="none"
        stroke={accentStroke}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.4"
      />

      <path
        d="M50 18V33"
        fill="none"
        stroke={hexToRgba(gold, 0.5)}
        strokeLinecap="round"
        strokeWidth="1.2"
      />
      <path
        d="M50 107V122"
        fill="none"
        stroke={hexToRgba(gold, 0.5)}
        strokeLinecap="round"
        strokeWidth="1.2"
      />

      {topSeven}
      <g transform="rotate(180 50 70)">{topSeven}</g>

      <line
        x1="34"
        y1="70"
        x2="66"
        y2="70"
        stroke={hexToRgba('#ffffff', 0.1)}
        strokeWidth="1"
      />
      <circle cx="50" cy="70" r="10" fill="none" stroke={accentStroke} strokeWidth="1.2" />
      <rect
        x="46"
        y="66"
        width="8"
        height="8"
        transform="rotate(45 50 70)"
        fill={hexToRgba('#07111f', 0.92)}
        stroke={hexToRgba(gold, 0.7)}
        strokeWidth="1.1"
      />
      <circle cx="50" cy="70" r="1.8" fill="#eef6ff" />
    </svg>
  )
}
