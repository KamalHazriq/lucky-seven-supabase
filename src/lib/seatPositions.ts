/**
 * getSeatPositions — v1.5 Table Layout Engine
 *
 * Returns { left, top } (%) for each opponent seat around a poker-table ellipse.
 * Local player is always fixed at bottom-center (not returned here).
 *
 * Layout rules:
 * - 1–4 players: circular/semi-circular arrangement
 * - 5–7 players: two-row strategy (sides + top arc)
 * - 8+ players: parametric elliptical fallback
 * - All positions clamped to safe bounds (header, sides, local player zone)
 * - Center pile zone (35–65% left, 35–55% top) is avoided for seats
 * - Table layout disabled on mobile (<768px) — enforced by useLayout hook
 *
 * @param otherCount  Number of OTHER players (excluding local player)
 */
export interface SeatPosition {
  left: number  // percentage (0–100)
  top: number   // percentage (0–100)
}

// ─── Safe bounds — reserve header, sides, and local player zone ───
const MIN_TOP = 8    // Reserve top for banner safe-gap (bumped from 6)
const MAX_TOP = 76   // Reserve bottom for local player
const MIN_LEFT = 6   // Left edge padding (bumped from 4 to prevent panel clipping)
const MAX_LEFT = 94  // Right edge padding (bumped from 96)

// Center of the ellipse (slightly above center for visual balance)
const CX = 50
const CY = 40

// Center pile exclusion zone (seats should not land here)
const PILE_ZONE = { left: 34, right: 66, top: 32, bottom: 56 }

/** Minimum spacing between any two seats (in % units) */
const MIN_SEAT_DISTANCE = 14

/** Clamp a seat position to safe bounds */
function clamp(pos: SeatPosition): SeatPosition {
  return {
    left: Math.max(MIN_LEFT, Math.min(MAX_LEFT, pos.left)),
    top: Math.max(MIN_TOP, Math.min(MAX_TOP, pos.top)),
  }
}

/** Check if a position is inside the center pile zone */
function inPileZone(pos: SeatPosition): boolean {
  return (
    pos.left > PILE_ZONE.left && pos.left < PILE_ZONE.right &&
    pos.top > PILE_ZONE.top && pos.top < PILE_ZONE.bottom
  )
}

/** Push a position out of the pile zone by moving it radially outward */
function avoidPileZone(pos: SeatPosition): SeatPosition {
  if (!inPileZone(pos)) return pos
  const dx = pos.left - CX
  const dy = pos.top - CY
  const angle = Math.atan2(dy, dx)
  // Push outward from center
  const pushDist = 18
  return {
    left: CX + pushDist * Math.cos(angle) + (dx > 0 ? 4 : -4),
    top: CY + pushDist * Math.sin(angle),
  }
}

/** Validate minimum spacing between all seats, log warnings in dev */
function validateSpacing(positions: SeatPosition[]): SeatPosition[] {
  // Simple check — in production we just return as-is
  // The hand-tuned layouts should already satisfy spacing
  if (import.meta.env.DEV) {
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        const dx = positions[i].left - positions[j].left
        const dy = positions[i].top - positions[j].top
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < MIN_SEAT_DISTANCE) {
          console.warn(`[seatPositions] Seats ${i} and ${j} are too close (${dist.toFixed(1)}% < ${MIN_SEAT_DISTANCE}%)`)
        }
      }
    }
  }
  return positions
}

export function getSeatPositions(
  otherCount: number,
): SeatPosition[] {
  if (otherCount === 0) return []

  // ─── Hand-tuned layouts for common player counts ───

  if (otherCount === 1) {
    // Single opponent: top center
    return validateSpacing([
      clamp({ left: CX, top: 10 }),
    ])
  }

  if (otherCount === 2) {
    // Two opponents: top-left and top-right
    return validateSpacing([
      clamp({ left: 22, top: 18 }),
      clamp({ left: 78, top: 18 }),
    ])
  }

  if (otherCount === 3) {
    // Three: arc across the top
    return validateSpacing([
      clamp({ left: 12, top: 26 }),
      clamp({ left: CX, top: 10 }),
      clamp({ left: 88, top: 26 }),
    ])
  }

  if (otherCount === 4) {
    // Four: wider arc, sides lower
    return validateSpacing([
      clamp({ left: 6, top: 36 }),
      clamp({ left: 24, top: 12 }),
      clamp({ left: 76, top: 12 }),
      clamp({ left: 94, top: 36 }),
    ])
  }

  // ─── 5+ players: two-row strategy ───

  if (otherCount === 5) {
    // Row 1 (top arc): 3 players evenly spaced
    // Row 2 (sides): 2 players flanking lower (inset from edges)
    return validateSpacing([
      clamp({ left: 7, top: 44 }),
      clamp({ left: 20, top: 14 }),
      clamp({ left: CX, top: 9 }),
      clamp({ left: 80, top: 14 }),
      clamp({ left: 93, top: 44 }),
    ])
  }

  if (otherCount === 6) {
    // Row 1 (top arc): 4 players
    // Row 2 (sides): 2 players (inset from edges)
    return validateSpacing([
      clamp({ left: 7, top: 46 }),
      clamp({ left: 14, top: 20 }),
      clamp({ left: 35, top: 9 }),
      clamp({ left: 65, top: 9 }),
      clamp({ left: 86, top: 20 }),
      clamp({ left: 93, top: 46 }),
    ])
  }

  if (otherCount === 7) {
    // Row 1 (top arc): 5 players
    // Row 2 (sides): 2 players lower (inset from edges)
    return validateSpacing([
      clamp({ left: 7, top: 50 }),
      clamp({ left: 10, top: 24 }),
      clamp({ left: 28, top: 9 }),
      clamp({ left: CX, top: 8 }),
      clamp({ left: 72, top: 9 }),
      clamp({ left: 90, top: 24 }),
      clamp({ left: 93, top: 50 }),
    ])
  }

  // ─── Fallback: parametric elliptical distribution for 8+ ───
  const positions: SeatPosition[] = []
  const rx = 45
  const ry = 35
  const padAngle = Math.max(0.04, 0.12 - otherCount * 0.008)
  const startAngle = Math.PI - padAngle
  const endAngle = padAngle

  for (let i = 0; i < otherCount; i++) {
    const t = otherCount === 1 ? 0.5 : i / (otherCount - 1)
    const angle = startAngle - t * (startAngle - endAngle)
    let pos: SeatPosition = {
      left: CX + rx * Math.cos(angle),
      top: CY - ry * Math.sin(angle),
    }
    pos = avoidPileZone(pos)
    positions.push(clamp(pos))
  }

  return validateSpacing(positions)
}

/** Local player fixed position — bottom center */
export const LOCAL_SEAT: SeatPosition = { left: 50, top: 94 }

/**
 * Check if table layout should be disabled.
 * Table layout is disabled on mobile (<768px viewport width).
 * This check is also enforced by useLayout hook, but this utility
 * can be used for tooltip/messaging purposes.
 */
export function isTableLayoutDisabled(): boolean {
  if (typeof window === 'undefined') return true
  return window.innerWidth < 768
}
