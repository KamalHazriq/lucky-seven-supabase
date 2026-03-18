export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades'
export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K'

export interface Card {
  id: string
  suit: Suit
  rank: Rank
  isJoker?: boolean
}

export type GameStatus = 'lobby' | 'active' | 'ending' | 'finished'

export interface LogEntry {
  ts: number
  msg: string
}

// ─── Power effect types ─────────────────────────────────────
export type PowerEffectType =
  | 'peek_one_of_your_cards'
  | 'peek_all_three_of_your_cards'
  | 'swap_one_to_one'
  | 'lock_one_card'
  | 'unlock_one_locked_card'
  | 'rearrange_cards'

/** Rank keys that can be assigned powers */
export type PowerRankKey = '10' | 'J' | 'Q' | 'K' | 'JOKER'

/** Maps each power-card rank to an effect type */
export type PowerAssignments = Record<PowerRankKey, PowerEffectType>

export const ALL_EFFECT_TYPES: { value: PowerEffectType; label: string }[] = [
  { value: 'peek_one_of_your_cards', label: 'Peek 1 card' },
  { value: 'peek_all_three_of_your_cards', label: 'Peek all 3 cards' },
  { value: 'swap_one_to_one', label: 'Swap 1:1' },
  { value: 'lock_one_card', label: 'Lock 1 card' },
  { value: 'unlock_one_locked_card', label: 'Unlock 1 card' },
  { value: 'rearrange_cards', label: 'Rearrange cards' },
]

export const DEFAULT_POWER_ASSIGNMENTS: PowerAssignments = {
  '10': 'unlock_one_locked_card',
  J: 'peek_all_three_of_your_cards',
  Q: 'swap_one_to_one',
  K: 'lock_one_card',
  JOKER: 'rearrange_cards',
}

export type DeckSize = 1 | 1.5 | 2

export type TurnSeconds = 0 | 30 | 60 | 90 | 120 // 0 = unlimited (no timer)

export interface GameSettings {
  powerAssignments: PowerAssignments
  jokerCount: number // 1-4
  deckSize: DeckSize // 1 = standard, 1.5 = 1 full + 27 extra, 2 = double deck
  turnSeconds: TurnSeconds // 0 = unlimited, 30/60/90/120
  peekAllowsOpponent: boolean // When true, peek powers can also target opponent cards
}

export const DEFAULT_GAME_SETTINGS: GameSettings = {
  powerAssignments: { ...DEFAULT_POWER_ASSIGNMENTS },
  jokerCount: 2,
  deckSize: 1,
  turnSeconds: 0,
  peekAllowsOpponent: true,
}

/** Human-readable effect label for UI */
export const EFFECT_LABELS: Record<PowerEffectType, { label: string; desc: string; color: string }> = {
  peek_one_of_your_cards: { label: 'Peek 1', desc: 'Look at one of your face-down cards', color: 'bg-amber-600 hover:bg-amber-500' },
  peek_all_three_of_your_cards: { label: 'Peek All', desc: 'Look at all your face-down cards', color: 'bg-amber-600 hover:bg-amber-500' },
  swap_one_to_one: { label: 'Swap', desc: "Swap any two players' unlocked cards", color: 'bg-purple-600 hover:bg-purple-500' },
  lock_one_card: { label: 'Lock', desc: 'Lock any card (cannot be swapped)', color: 'bg-red-600 hover:bg-red-500' },
  unlock_one_locked_card: { label: 'Unlock', desc: 'Unlock a locked card', color: 'bg-cyan-600 hover:bg-cyan-500' },
  rearrange_cards: { label: 'Chaos', desc: "Randomly shuffle another player's unlocked cards", color: 'bg-fuchsia-600 hover:bg-fuchsia-500' },
}

// ─── Lock metadata ──────────────────────────────────────────
export interface LockInfo {
  lockerId: string | null
  lockerName: string | null
}

export const EMPTY_LOCK_INFO: LockInfo = { lockerId: null, lockerName: null }

// ─── Vote-Kick ──────────────────────────────────────────────
export interface VoteKick {
  active: boolean
  targetId: string
  targetName: string
  startedBy: string
  createdAt: number
  votes: string[] // player IDs who voted yes
  requiredVotes: number
}

// ─── Game Document ──────────────────────────────────────────
export interface GameDoc {
  status: GameStatus
  hostId: string
  createdAt: number
  maxPlayers: number
  currentTurnPlayerId: string | null
  drawPileCount: number
  discardTop: Card | null
  seed: string
  endCalledBy: string | null
  /** Seat index of the player whose turn it was when End was called */
  endRoundStartSeatIndex: number | null
  log: LogEntry[]
  turnPhase: 'draw' | 'action' | null
  playerOrder: string[]
  joinCode: string
  actionVersion: number
  lastActionAt: number
  settings: GameSettings
  /** Tracks card IDs whose power has been used (spent). Spent cards cannot use power again. */
  spentPowerCardIds: Record<string, boolean>
  /** Timestamp when the current turn started (used for turn timer countdown) */
  turnStartAt: number
  /** Active vote-kick data (null if no vote in progress) */
  voteKick: VoteKick | null
  /** ID of the rematch lobby created from this finished game (null/absent if none yet) */
  rematchLobbyId?: string | null
}

export interface PlayerDoc {
  displayName: string
  seatIndex: number
  connected: boolean
  /** Public lock state per slot — visible to all players */
  locks: [boolean, boolean, boolean]
  /** Who locked each slot (public metadata) */
  lockedBy: [LockInfo, LockInfo, LockInfo]
  /** Optional color key (index into LOBBY_COLORS palette). If set, overrides seat color. */
  colorKey?: number
  /** Consecutive AFK timeout strikes. Reset to 0 on any action. Kicked on 2. */
  afkStrikes?: number
}

export type DrawnCardSource = 'pile' | 'discard' | null

export interface PrivatePlayerDoc {
  hand: Card[]
  drawnCard: Card | null
  /** Where the drawn card came from — used for cancel-draw rollback */
  drawnCardSource: DrawnCardSource
  known: Record<string, Card>
  /** Opponent cards known to this player: { targetPlayerId: { slotIndex: Card } } */
  opponent_known?: Record<string, Record<string, Card>>
}

export interface PlayerScore {
  playerId: string
  displayName: string
  hand: Card[]
  total: number
  sevens: number
}

// ─── Chat ────────────────────────────────────────────────────
export interface ChatMessage {
  id: string
  userId: string
  displayName: string
  seatIndex: number
  text: string
  ts: number
}

// ─── Developer Mode ─────────────────────────────────────────
export interface DevPrivileges {
  canSeeAllCards: boolean
  canPeekDrawPile: boolean
  canInspectGameState: boolean
  canUseCheatActions: boolean
  /** Personal-only privilege: reorder the discard pile (owner UID only) */
  canReorderDiscardPile: boolean
}

export const DEFAULT_DEV_PRIVILEGES: DevPrivileges = {
  canSeeAllCards: true,
  canPeekDrawPile: true,
  canInspectGameState: true,
  canUseCheatActions: true,
  canReorderDiscardPile: false, // granted only to owner UID via config/dev.ownerUid
}

export interface DevAccessDoc {
  activatedAt: number
  uid: string
  privileges: DevPrivileges
}

/** Returns the PowerRankKey for a card, or null if it has no power */
export function getCardRankKey(card: Card): PowerRankKey | null {
  if (card.isJoker) return 'JOKER'
  switch (card.rank) {
    case 'J': return 'J'
    case 'Q': return 'Q'
    case 'K': return 'K'
    case '10': return '10'
    default: return null
  }
}
