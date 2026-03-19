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
  const seatAccent = accentColor ?? '#38bdf8'
  const signalCyan = '#7dd3fc'
  const signalGold = '#facc15'
  const frameStroke = hexToRgba(seatAccent, accentColor ? 0.45 : 0.24)
  const frameGlow = hexToRgba(seatAccent, accentColor ? 0.18 : 0.08)
  const signalStroke = hexToRgba(signalCyan, 0.88)
  const signalSoft = hexToRgba(signalCyan, 0.16)
  const goldSoft = hexToRgba(signalGold, 0.22)
  const nodeFill = hexToRgba(seatAccent, accentColor ? 0.9 : 0.64)

  const cornerGlyph = (
    <>
      <path
        d="M15 15H31L24 22H19L15 26"
        fill="none"
        stroke={frameStroke}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <circle cx="33.5" cy="13.5" r="1.4" fill={nodeFill} />
    </>
  )

  const mirroredSeven = (
    <>
      <path
        d="M30 31H70L47 55"
        fill="none"
        stroke={hexToRgba('#ffffff', 0.08)}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="9"
      />
      <path
        d="M31 31H69L47.5 54"
        fill="none"
        stroke={`url(#${gradientId}-seven)`}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="6"
      />
      <path
        d="M24 26L41 42"
        fill="none"
        stroke={frameStroke}
        strokeLinecap="round"
        strokeWidth="1.5"
      />
      <path
        d="M76 26L59 42"
        fill="none"
        stroke={frameStroke}
        strokeLinecap="round"
        strokeWidth="1.5"
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
          <stop offset="0%" stopColor="#07101f" />
          <stop offset="50%" stopColor="#0f1830" />
          <stop offset="100%" stopColor="#050914" />
        </linearGradient>
        <radialGradient id={`${gradientId}-center-glow`} cx="50%" cy="50%" r="60%">
          <stop offset="0%" stopColor={frameGlow} />
          <stop offset="55%" stopColor={signalSoft} />
          <stop offset="100%" stopColor="rgba(0, 0, 0, 0)" />
        </radialGradient>
        <linearGradient id={`${gradientId}-frame`} x1="14" y1="10" x2="86" y2="130" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={hexToRgba('#ffffff', 0.14)} />
          <stop offset="35%" stopColor={frameStroke} />
          <stop offset="70%" stopColor={signalStroke} />
          <stop offset="100%" stopColor={hexToRgba(signalGold, 0.44)} />
        </linearGradient>
        <linearGradient id={`${gradientId}-seven`} x1="30" y1="31" x2="70" y2="55" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={signalCyan} />
          <stop offset="60%" stopColor="#e2f2ff" />
          <stop offset="100%" stopColor={signalGold} />
        </linearGradient>
        <linearGradient id={`${gradientId}-rails`} x1="0" y1="18" x2="0" y2="122" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={hexToRgba(signalCyan, 0)} />
          <stop offset="18%" stopColor={frameStroke} />
          <stop offset="50%" stopColor={signalStroke} />
          <stop offset="82%" stopColor={frameStroke} />
          <stop offset="100%" stopColor={hexToRgba(signalCyan, 0)} />
        </linearGradient>
      </defs>

      <rect x="0.5" y="0.5" width="99" height="139" rx="14" fill={`url(#${gradientId}-bg)`} />
      <rect x="0.5" y="0.5" width="99" height="139" rx="14" fill={`url(#${gradientId}-center-glow)`} opacity="0.95" />

      <path
        d="M17 11H83L89 17V123L83 129H17L11 123V17Z"
        fill={hexToRgba('#040814', 0.42)}
        stroke={`url(#${gradientId}-frame)`}
        strokeWidth="1.6"
      />
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
      <rect
        x="12"
        y="12"
        width="76"
        height="116"
        rx="8"
        fill="none"
        stroke={hexToRgba('#ffffff', 0.05)}
        strokeWidth="0.8"
      />

      <g opacity="0.85">
        {cornerGlyph}
        <g transform="translate(100 0) scale(-1 1)">{cornerGlyph}</g>
        <g transform="translate(0 140) scale(1 -1)">{cornerGlyph}</g>
        <g transform="translate(100 140) scale(-1 -1)">{cornerGlyph}</g>
      </g>

      <path
        d="M21 24V54L28 62V78L21 86V116"
        fill="none"
        stroke={`url(#${gradientId}-rails)`}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
      <path
        d="M79 24V54L72 62V78L79 86V116"
        fill="none"
        stroke={`url(#${gradientId}-rails)`}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />

      <path d="M14 38L34 56L30 60L10 42Z" fill={frameGlow} />
      <path d="M86 38L66 56L70 60L90 42Z" fill={frameGlow} />
      <g transform="rotate(180 50 70)">
        <path d="M14 38L34 56L30 60L10 42Z" fill={frameGlow} />
        <path d="M86 38L66 56L70 60L90 42Z" fill={frameGlow} />
      </g>

      <g opacity="0.94">
        {mirroredSeven}
        <g transform="rotate(180 50 70)">{mirroredSeven}</g>
      </g>

      <polygon
        points="50,51 61,57 64,69 58,80 44,82 35,74 36,61"
        fill={hexToRgba('#081120', 0.88)}
        stroke={hexToRgba(signalCyan, 0.42)}
        strokeWidth="1.5"
      />
      <polygon
        points="50,58 58,70 50,82 42,70"
        fill={frameGlow}
        stroke={hexToRgba(signalGold, 0.7)}
        strokeWidth="1.2"
      />
      <circle cx="50" cy="70" r="7" fill="none" stroke={goldSoft} strokeWidth="1.2" />
      <circle cx="50" cy="70" r="2.5" fill="#eef7ff" />

      <circle cx="21" cy="42" r="1.8" fill={nodeFill} />
      <circle cx="21" cy="98" r="1.8" fill={nodeFill} />
      <circle cx="79" cy="42" r="1.8" fill={nodeFill} />
      <circle cx="79" cy="98" r="1.8" fill={nodeFill} />
      <circle cx="50" cy="24" r="1.6" fill={hexToRgba(signalGold, 0.88)} />
      <circle cx="50" cy="116" r="1.6" fill={hexToRgba(signalGold, 0.88)} />
    </svg>
  )
}
