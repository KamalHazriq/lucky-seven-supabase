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
  const seatAccent = accentColor ?? '#67e8f9'
  const signalSilver = '#e2e8f0'
  const frameStroke = hexToRgba(seatAccent, accentColor ? 0.42 : 0.24)
  const frameGlow = hexToRgba(seatAccent, accentColor ? 0.18 : 0.1)
  const silverStroke = hexToRgba(signalSilver, 0.88)
  const silverSoft = hexToRgba(signalSilver, 0.18)
  const lineSoft = hexToRgba(signalSilver, 0.12)

  const sevenMark = (
    <>
      <path
        d="M31 32H69L49.5 53"
        fill="none"
        stroke={hexToRgba('#ffffff', 0.07)}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="8"
      />
      <path
        d="M31 32H69L49.5 53"
        fill="none"
        stroke={`url(#${gradientId}-signal)`}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="3.4"
      />
    </>
  )

  const sideVault = (
    <>
      <path
        d="M20 24L37 41V56L29 65"
        fill="none"
        stroke={`url(#${gradientId}-guide)`}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.4"
      />
      <path
        d="M80 24L63 41V56L71 65"
        fill="none"
        stroke={`url(#${gradientId}-guide)`}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.4"
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
          <stop offset="0%" stopColor="#06101a" />
          <stop offset="54%" stopColor="#0a1524" />
          <stop offset="100%" stopColor="#040912" />
        </linearGradient>
        <radialGradient id={`${gradientId}-center-glow`} cx="50%" cy="50%" r="58%">
          <stop offset="0%" stopColor={frameGlow} />
          <stop offset="44%" stopColor={hexToRgba(seatAccent, accentColor ? 0.1 : 0.05)} />
          <stop offset="100%" stopColor="rgba(0, 0, 0, 0)" />
        </radialGradient>
        <linearGradient id={`${gradientId}-frame`} x1="10" y1="10" x2="90" y2="130" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={hexToRgba('#ffffff', 0.1)} />
          <stop offset="60%" stopColor={frameStroke} />
          <stop offset="100%" stopColor={hexToRgba(signalSilver, 0.28)} />
        </linearGradient>
        <linearGradient id={`${gradientId}-signal`} x1="31" y1="32" x2="69" y2="53" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={seatAccent} />
          <stop offset="58%" stopColor={silverStroke} />
          <stop offset="100%" stopColor={hexToRgba(signalSilver, 0.98)} />
        </linearGradient>
        <linearGradient id={`${gradientId}-guide`} x1="20" y1="24" x2="50" y2="70" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={hexToRgba(seatAccent, 0.1)} />
          <stop offset="100%" stopColor={silverSoft} />
        </linearGradient>
      </defs>

      <rect x="0.5" y="0.5" width="99" height="139" rx="14" fill={`url(#${gradientId}-bg)`} />
      <rect x="0.5" y="0.5" width="99" height="139" rx="14" fill={`url(#${gradientId}-center-glow)`} opacity="0.9" />

      <rect
        x="7"
        y="7"
        width="86"
        height="126"
        rx="10"
        fill="none"
        stroke={`url(#${gradientId}-frame)`}
        strokeWidth="1.15"
      />
      <path
        d="M15 12H85L88 15V125L85 128H15L12 125V15Z"
        fill="none"
        stroke={hexToRgba('#ffffff', 0.05)}
        strokeWidth="0.8"
      />

      <path
        d="M50 18L68 30L74 48L68 66L50 78L32 66L26 48L32 30Z"
        fill={hexToRgba('#08131f', 0.34)}
        stroke={lineSoft}
        strokeWidth="1"
      />
      <path
        d="M50 24L62 32L66 48L62 62L50 70L38 62L34 48L38 32Z"
        fill="none"
        stroke={hexToRgba(seatAccent, accentColor ? 0.2 : 0.12)}
        strokeWidth="1"
      />

      <g opacity="0.84">
        {sideVault}
        <g transform="rotate(180 50 70)">{sideVault}</g>
      </g>

      <g opacity="0.96">
        {sevenMark}
        <g transform="rotate(180 50 70)">{sevenMark}</g>
      </g>

      <line
        x1="36"
        y1="70"
        x2="64"
        y2="70"
        stroke={hexToRgba('#ffffff', 0.08)}
        strokeLinecap="round"
        strokeWidth="0.9"
      />
      <rect
        x="44.5"
        y="64.5"
        width="11"
        height="11"
        rx="1.6"
        transform="rotate(45 50 70)"
        fill={hexToRgba('#06101a', 0.96)}
        stroke={hexToRgba(signalSilver, 0.56)}
        strokeWidth="1"
      />
      <circle cx="50" cy="70" r="2" fill="#f6fbff" />
    </svg>
  )
}
