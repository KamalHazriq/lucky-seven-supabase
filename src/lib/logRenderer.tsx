import { type ReactNode } from 'react'
import { getPlayerColor } from './playerColors'
import type { LogEntry } from './types'

interface PlayerInfo {
  playerId?: string
  displayName: string
  seatIndex: number
  colorKey?: number
}

// ─── Power label map ────────────────────────────────────────
// Maps any variation of power text → display label (BOLD + CAPS)
const POWER_KEYWORDS: Record<string, string> = {
  'peek all': 'PEEK ALL',
  'peek_all_three_of_your_cards': 'PEEK ALL',
  'peek_all': 'PEEK ALL',
  'as peek all': 'PEEK ALL',
  'as peek_all': 'PEEK ALL',
  'peek 1': 'PEEK',
  'peek_one_of_your_cards': 'PEEK',
  'peek_one': 'PEEK',
  'as peek': 'PEEK',
  'as peek_one': 'PEEK',
  'as swap': 'SWAP',
  'swap_one_to_one': 'SWAP',
  'as lock': 'LOCK',
  'lock_one_card': 'LOCK',
  'as unlock': 'UNLOCK',
  'unlock_one_locked_card': 'UNLOCK',
  'as rearrange': 'CHAOS',
  'rearrange_cards': 'CHAOS',
  'as peek_opponent': 'PEEK',
  'peek_one_opponent_card': 'PEEK',
}

// Build a regex for power keywords — match longest first
const powerKeywordsSorted = Object.keys(POWER_KEYWORDS).sort((a, b) => b.length - a.length)
const powerPattern = new RegExp(
  `(${powerKeywordsSorted.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`,
  'gi',
)

// ─── Card display pattern — matches suit symbols in parentheses ────
// Matches patterns like (10♠), (K♥), (A♦), (Joker), (7♣)
const CARD_PATTERN = /(\([^)]*[♠♥♦♣][^)]*\)|\(Joker\))/g

// ─── Action verbs — highlighted in the log as colored text ──────
// Matches whole words/phrases so "discarded" won't split into "discard" + "ed"
const ACTION_KEYWORDS: Record<string, { label: string; color: string }> = {
  'discarded':    { label: 'DISCARDED', color: 'text-orange-400' },
  'swapped':      { label: 'SWAPPED',   color: 'text-amber-400' },
  'drew':         { label: 'DREW',       color: 'text-blue-400' },
  'took':         { label: 'TOOK',       color: 'text-orange-400' },
  'called end':   { label: 'CALLED END', color: 'text-red-400' },
  'joined':       { label: 'JOINED',     color: 'text-emerald-400' },
}

const actionKeywordsSorted = Object.keys(ACTION_KEYWORDS).sort((a, b) => b.length - a.length)
const actionPattern = new RegExp(
  `\\b(${actionKeywordsSorted.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`,
  'gi',
)

// ─── Source keywords — DISCARD, PILE ────────────────────────
// Use word boundaries to prevent matching inside longer words (e.g. "discarded")
const SOURCE_KEYWORDS: Record<string, { label: string; color: string }> = {
  'from discard': { label: 'DISCARD', color: 'text-orange-400' },
  'the discard':  { label: 'DISCARD', color: 'text-orange-400' },
  'from the pile': { label: 'PILE', color: 'text-blue-400' },
  'the pile':     { label: 'PILE', color: 'text-blue-400' },
}

const sourceKeywordsSorted = Object.keys(SOURCE_KEYWORDS).sort((a, b) => b.length - a.length)
const sourcePattern = new RegExp(
  `(${sourceKeywordsSorted.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`,
  'gi',
)

/** Power label chip — small rounded pill, consistent color */
function renderPowerChip(label: string, key: string) {
  return (
    <span key={key} className="inline-flex items-center px-1.5 py-px rounded-md text-[9px] font-bold uppercase tracking-wider bg-violet-900/50 text-violet-300 border border-violet-700/30 leading-none align-middle">
      {label}
    </span>
  )
}

/** Card display chip — shows card with suit color matching actual card colors */
function renderCardChip(text: string, key: string) {
  const isRed = text.includes('\u2665') || text.includes('\u2666') // hearts or diamonds
  const isJoker = text.toLowerCase().includes('joker')
  // Red suits = bright red, black suits = white (high contrast), joker = purple
  const style = isJoker
    ? { color: '#c084fc', backgroundColor: 'rgba(126,34,206,0.15)', borderColor: 'rgba(168,85,247,0.3)' }
    : isRed
      ? { color: '#f87171', backgroundColor: 'rgba(239,68,68,0.12)', borderColor: 'rgba(248,113,113,0.3)' }
      : { color: '#f1f5f9', backgroundColor: 'rgba(100,116,139,0.15)', borderColor: 'rgba(100,116,139,0.3)' }

  return (
    <span
      key={key}
      className="inline-flex items-center px-1 py-px rounded text-[9px] font-bold leading-none align-middle"
      style={style}
    >
      {text}
    </span>
  )
}

/** Source label chip — DISCARD or PILE */
function renderSourceChip(label: string, color: string, key: string) {
  return (
    <span key={key} className={`inline-flex items-center text-[9px] font-bold uppercase tracking-wider leading-none align-middle ${color}`}>
      {label}
    </span>
  )
}

/** Action verb chip — DISCARDED, DREW, SWAPPED, etc. */
function renderActionChip(label: string, color: string, key: string) {
  return (
    <span key={key} className={`inline-flex items-center text-[9px] font-bold uppercase tracking-wider leading-none align-middle ${color}`}>
      {label}
    </span>
  )
}

function renderPlayerChip(player: PlayerInfo | null | undefined, key: string, fallbackLabel = 'Unknown') {
  if (!player) {
    return (
      <span
        key={key}
        className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-bold leading-none align-middle whitespace-nowrap"
        style={{ backgroundColor: 'rgba(100,116,139,0.18)', color: '#e2e8f0' }}
      >
        {fallbackLabel}
      </span>
    )
  }

  const color = getPlayerColor(player.seatIndex, player.colorKey)
  return (
    <span
      key={key}
      className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-bold leading-none align-middle whitespace-nowrap"
      style={{
        backgroundColor: color.bg,
        color: color.text,
        minWidth: '2em',
        textAlign: 'center',
      }}
    >
      {player.displayName}
    </span>
  )
}

function renderSlotChip(slotIndex: number, key: string) {
  return (
    <span
      key={key}
      className="inline-flex items-center px-1 py-px rounded text-[9px] font-bold leading-none align-middle"
      style={{
        color: '#f1f5f9',
        backgroundColor: 'rgba(100,116,139,0.15)',
        border: '1px solid rgba(100,116,139,0.3)',
      }}
    >
      #{slotIndex + 1}
    </span>
  )
}

function appendText(target: ReactNode[], text: string | null | undefined, key: string) {
  if (!text) return
  target.push(<span key={key}>{text}</span>)
}

function resolvePlayerInfo(
  playerId: string | null | undefined,
  byId: Map<string, PlayerInfo>,
): PlayerInfo | null {
  if (!playerId) return null
  return byId.get(playerId) ?? null
}

function renderStructuredLogMessage(entry: LogEntry, playerMap: PlayerInfo[]): ReactNode[] | null {
  const event = entry.event
  if (!event) return null

  const byId = new Map<string, PlayerInfo>()
  for (const player of playerMap) {
    if (player.playerId) byId.set(player.playerId, player)
  }

  const nodes: ReactNode[] = []

  switch (event.kind) {
    case 'game_created':
      nodes.push(renderPlayerChip(resolvePlayerInfo(event.actorId, byId), 'actor'))
      appendText(nodes, ' created the game', 'text')
      break
    case 'player_joined':
      nodes.push(renderPlayerChip(resolvePlayerInfo(event.actorId, byId), 'actor'))
      appendText(nodes, ' ', 'gap')
      nodes.push(renderActionChip('JOINED', 'text-emerald-400', 'join'))
      break
    case 'game_started':
      nodes.push(renderActionChip('STARTED', 'text-emerald-400', 'started'))
      break
    case 'draw_pile':
      nodes.push(renderPlayerChip(resolvePlayerInfo(event.actorId, byId), 'actor'))
      appendText(nodes, ' ', 'gap-1')
      nodes.push(renderActionChip('DREW', 'text-blue-400', 'drew'))
      appendText(nodes, ' from ', 'text-1')
      nodes.push(renderSourceChip('PILE', 'text-blue-400', 'pile'))
      break
    case 'take_discard':
      nodes.push(renderPlayerChip(resolvePlayerInfo(event.actorId, byId), 'actor'))
      appendText(nodes, ' ', 'gap-2')
      nodes.push(renderActionChip('TOOK', 'text-orange-400', 'took'))
      appendText(nodes, ' from ', 'text-2')
      nodes.push(renderSourceChip('DISCARD', 'text-orange-400', 'discard'))
      break
    case 'cancel_draw':
      nodes.push(renderPlayerChip(resolvePlayerInfo(event.actorId, byId), 'actor'))
      appendText(nodes, ' returned the card to ', 'cancel')
      nodes.push(renderSourceChip('DISCARD', 'text-orange-400', 'discard'))
      break
    case 'swap_slot':
      nodes.push(renderPlayerChip(resolvePlayerInfo(event.actorId, byId), 'actor'))
      appendText(nodes, ' ', 'gap-3')
      nodes.push(renderActionChip('SWAPPED', 'text-amber-400', 'swapped'))
      appendText(nodes, ' their card ', 'text-3')
      nodes.push(renderSlotChip(event.slotIndex, 'slot'))
      break
    case 'discard_drawn':
      nodes.push(renderPlayerChip(resolvePlayerInfo(event.actorId, byId), 'actor'))
      appendText(nodes, ' ', 'gap-4')
      nodes.push(renderActionChip('DISCARDED', 'text-orange-400', 'discarded'))
      break
    case 'power_swap': {
      const actor = resolvePlayerInfo(event.actorId, byId)
      const first = resolvePlayerInfo(event.first.playerId, byId)
      const second = resolvePlayerInfo(event.second.playerId, byId)
      nodes.push(renderPlayerChip(actor, 'actor'))
      appendText(nodes, ' ', 'gap-5')
      nodes.push(renderPowerChip('SWAP', 'power'))
      appendText(nodes, ' ', 'gap-6')
      nodes.push(renderPlayerChip(first, 'first'))
      appendText(nodes, ' ', 'gap-7')
      nodes.push(renderSlotChip(event.first.slotIndex, 'first-slot'))
      appendText(nodes, ' \u2194 ', 'arrow')
      nodes.push(renderPlayerChip(second, 'second'))
      appendText(nodes, ' ', 'gap-8')
      nodes.push(renderSlotChip(event.second.slotIndex, 'second-slot'))
      break
    }
    case 'power_lock': {
      const actor = resolvePlayerInfo(event.actorId, byId)
      const target = resolvePlayerInfo(event.target.playerId, byId)
      nodes.push(renderPlayerChip(actor, 'actor'))
      appendText(nodes, ' ', 'gap-9')
      nodes.push(renderPowerChip('LOCK', 'power'))
      appendText(nodes, ' on ', 'text-4')
      nodes.push(renderPlayerChip(target, 'target'))
      appendText(nodes, ' ', 'gap-10')
      nodes.push(renderSlotChip(event.target.slotIndex, 'target-slot'))
      break
    }
    case 'power_unlock': {
      const actor = resolvePlayerInfo(event.actorId, byId)
      nodes.push(renderPlayerChip(actor, 'actor'))
      appendText(nodes, ' ', 'gap-11')
      nodes.push(renderPowerChip('UNLOCK', 'power'))
      if (event.fizzled || !event.target) {
        appendText(nodes, ' but no card was locked', 'text-5')
      } else {
        const target = resolvePlayerInfo(event.target.playerId, byId)
        appendText(nodes, ' on ', 'text-6')
        nodes.push(renderPlayerChip(target, 'target'))
        appendText(nodes, ' ', 'gap-12')
        nodes.push(renderSlotChip(event.target.slotIndex, 'target-slot'))
      }
      break
    }
    case 'power_rearrange': {
      const actor = resolvePlayerInfo(event.actorId, byId)
      const target = resolvePlayerInfo(event.targetPlayerId, byId)
      nodes.push(renderPlayerChip(actor, 'actor'))
      appendText(nodes, ' ', 'gap-13')
      nodes.push(renderPowerChip('CHAOS', 'power'))
      if (target) {
        appendText(nodes, ' on ', 'text-7')
        nodes.push(renderPlayerChip(target, 'target'))
      }
      break
    }
    case 'power_peek': {
      const actor = resolvePlayerInfo(event.actorId, byId)
      const label = event.variant === 'self_all' || event.variant === 'opponent_all' ? 'PEEK ALL' : 'PEEK'
      nodes.push(renderPlayerChip(actor, 'actor'))
      appendText(nodes, ' ', 'gap-14')
      nodes.push(renderPowerChip(label, 'power'))
      if (event.targetPlayerId) {
        const target = resolvePlayerInfo(event.targetPlayerId, byId)
        if (target) {
          appendText(nodes, ' on ', 'text-8')
          nodes.push(renderPlayerChip(target, 'target'))
        }
      }
      if (typeof event.slotIndex === 'number') {
        appendText(nodes, ' ', 'gap-15')
        nodes.push(renderSlotChip(event.slotIndex, 'peek-slot'))
      }
      break
    }
    case 'call_end':
      nodes.push(renderPlayerChip(resolvePlayerInfo(event.actorId, byId), 'actor'))
      appendText(nodes, ' ', 'gap-16')
      nodes.push(renderActionChip('CALLED END', 'text-red-400', 'end'))
      break
    case 'vote_kick_started':
      nodes.push(renderPlayerChip(resolvePlayerInfo(event.actorId, byId), 'actor'))
      appendText(nodes, ' started a vote to kick ', 'text-9')
      nodes.push(renderPlayerChip(resolvePlayerInfo(event.targetPlayerId, byId), 'target'))
      appendText(nodes, ` (${event.requiredVotes} votes needed)`, 'text-10')
      break
    case 'vote_kick_cancelled':
      appendText(nodes, 'Vote to kick ', 'text-11')
      nodes.push(renderPlayerChip(resolvePlayerInfo(event.targetPlayerId, byId), 'target'))
      appendText(nodes, ` was cancelled (${event.reason.replace(/_/g, ' ')})`, 'text-12')
      break
    case 'vote_kick_progress':
      nodes.push(renderPlayerChip(resolvePlayerInfo(event.actorId, byId), 'actor'))
      appendText(nodes, ' voted to kick ', 'text-13')
      nodes.push(renderPlayerChip(resolvePlayerInfo(event.targetPlayerId, byId), 'target'))
      appendText(nodes, ` (${event.votes}/${event.requiredVotes})`, 'text-14')
      break
    case 'player_kicked':
      nodes.push(renderPlayerChip(resolvePlayerInfo(event.playerId, byId), 'player'))
      appendText(nodes, ' was ', 'text-15')
      nodes.push(renderActionChip(event.reason === 'afk' ? 'AFK-KICKED' : 'KICKED', 'text-red-400', 'kicked'))
      break
    case 'player_left':
      nodes.push(renderPlayerChip(resolvePlayerInfo(event.playerId, byId), 'player'))
      appendText(nodes, ' left the game', 'text-16')
      break
    case 'hand_revealed':
      nodes.push(renderPlayerChip(resolvePlayerInfo(event.actorId, byId), 'actor'))
      appendText(nodes, ` revealed their hand (${event.total}, ${event.sevens} sevens)`, 'text-17')
      break
    default:
      return null
  }

  return nodes
}

/**
 * Process plain text for action verbs and power keywords.
 * Handles the innermost split layers.
 */
function processInnerText(text: string, keyPrefix: string): ReactNode[] {
  const result: ReactNode[] = []

  // Layer 1: Action verbs (DISCARDED, DREW, SWAPPED, TOOK, etc.)
  actionPattern.lastIndex = 0
  const actionParts = text.split(actionPattern)

  for (let a = 0; a < actionParts.length; a++) {
    const ap = actionParts[a]
    if (!ap) continue
    const normalizedA = ap.toLowerCase()
    const actionInfo = ACTION_KEYWORDS[normalizedA]
    if (actionInfo) {
      result.push(renderActionChip(actionInfo.label, actionInfo.color, `${keyPrefix}-act-${a}`))
      continue
    }

    // Layer 2: Power keywords
    powerPattern.lastIndex = 0
    const powerParts = ap.split(powerPattern)

    for (let p = 0; p < powerParts.length; p++) {
      const pp = powerParts[p]
      if (!pp) continue
      const normalizedP = pp.toLowerCase()
      const powerLabel = POWER_KEYWORDS[normalizedP]
      if (powerLabel) {
        result.push(renderPowerChip(powerLabel, `${keyPrefix}-pow-${a}-${p}`))
      } else {
        result.push(<span key={`${keyPrefix}-txt-${a}-${p}`}>{pp}</span>)
      }
    }
  }

  return result
}

/**
 * Process a text fragment for card patterns, source keywords, action verbs, and power keywords.
 * Processing order: cards → source phrases → action verbs → power keywords.
 * Returns an array of ReactNode fragments.
 */
function processTextFragment(text: string, keyPrefix: string): ReactNode[] {
  const result: ReactNode[] = []

  // Layer 0: Split on card patterns first
  CARD_PATTERN.lastIndex = 0
  const cardParts = text.split(CARD_PATTERN)

  for (let c = 0; c < cardParts.length; c++) {
    const cardPart = cardParts[c]
    if (!cardPart) continue

    // Check if this is a card reference
    CARD_PATTERN.lastIndex = 0
    if (CARD_PATTERN.test(cardPart)) {
      CARD_PATTERN.lastIndex = 0
      result.push(renderCardChip(cardPart, `${keyPrefix}-card-${c}`))
      continue
    }

    // Layer 1: Source phrases (from discard, the pile, etc.)
    sourcePattern.lastIndex = 0
    const sourceParts = cardPart.split(sourcePattern)

    for (let s = 0; s < sourceParts.length; s++) {
      const sp = sourceParts[s]
      if (!sp) continue
      const normalized = sp.toLowerCase()
      const sourceInfo = SOURCE_KEYWORDS[normalized]
      if (sourceInfo) {
        result.push(renderSourceChip(sourceInfo.label, sourceInfo.color, `${keyPrefix}-src-${c}-${s}`))
      } else {
        // Layers 2+3: Action verbs → power keywords
        result.push(...processInnerText(sp, `${keyPrefix}-inner-${c}-${s}`))
      }
    }
  }

  return result
}

/**
 * Renders a log message with:
 * 1. Player names highlighted as colored chips (word-boundary safe)
 * 2. Power keywords rendered as bold uppercase badges
 * 3. Card references (10♠) highlighted with suit colors
 * 4. Source keywords (DISCARD, PILE) highlighted
 *
 * v1.4.2: Card display chips, source labels, enhanced readability.
 */
export function renderLogMessage(
  entryOrMsg: LogEntry | string,
  playerMap: PlayerInfo[],
): ReactNode {
  const entry = typeof entryOrMsg === 'string' ? null : entryOrMsg
  if (entry?.event) {
    const structured = renderStructuredLogMessage(entry, playerMap)
    if (structured && structured.length > 0) return structured
  }

  const msg = typeof entryOrMsg === 'string' ? entryOrMsg : entryOrMsg.msg
  if (playerMap.length === 0 && !powerPattern.test(msg)) {
    // Still check for card/source patterns even without players
    powerPattern.lastIndex = 0
    const fragments = processTextFragment(msg, 'np')
    return fragments.length > 0 ? fragments : msg
  }
  // Reset regex lastIndex since we use 'g' flag
  powerPattern.lastIndex = 0

  // Sort by name length descending so longer names match first
  const sorted = [...playerMap].sort(
    (a, b) => b.displayName.length - a.displayName.length,
  )

  // Build a name → player info lookup
  const nameToInfo: Record<string, { seatIndex: number; colorKey?: number }> = {}
  for (const p of sorted) {
    nameToInfo[p.displayName] = { seatIndex: p.seatIndex, colorKey: p.colorKey }
  }

  // ─── Step 1: Split on player names using word boundaries ───
  const escaped = sorted.map((p) =>
    p.displayName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
  )

  const namePatternStr = escaped
    .map((name) => `\\b${name}\\b`)
    .join('|')

  let parts: string[]
  if (sorted.length > 0 && namePatternStr) {
    const namePattern = new RegExp(`(${namePatternStr})`, 'g')
    parts = msg.split(namePattern)
  } else {
    parts = [msg]
  }

  // ─── Step 2: For each part, check if it's a name or process for keywords ───
  const result: ReactNode[] = []

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    if (!part) continue

    // Check if this part is a player name
    const info = nameToInfo[part]
    if (info !== undefined) {
      const color = getPlayerColor(info.seatIndex, info.colorKey)
      result.push(
        <span
          key={`name-${i}`}
          className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-bold leading-none align-middle whitespace-nowrap"
          style={{
            backgroundColor: color.bg,
            color: color.text,
            minWidth: '2em',
            textAlign: 'center',
          }}
        >
          {part}
        </span>,
      )
      continue
    }

    // Not a name — process for card, source, and power keywords
    const fragments = processTextFragment(part, `frag-${i}`)
    result.push(...fragments)
  }

  return result.length > 0 ? result : msg
}
