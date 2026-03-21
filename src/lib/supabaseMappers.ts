/**
 * Supabase row → TypeScript type mappers.
 * Converts snake_case Postgres columns to camelCase types
 * expected by existing UI components.
 */

import type {
  GameDoc, PlayerDoc, PrivatePlayerDoc, PlayerScore, ChatMessage, LockInfo,
} from './types'
import type { TableRow } from './supabaseDatabase.generated'
import { normalizeLockedBy, normalizeLocks } from './slotState'

type GameRow = TableRow<'games'>
type PlayerRow = TableRow<'game_players'>
type PrivateStateRow = TableRow<'game_private_state'>
type RevealRow = TableRow<'game_reveals'>
type ChatRow = TableRow<'game_chat_messages'>

export function mapGameRow(r: GameRow): GameDoc {
  // spent_power_card_ids: TEXT[] → Record<string, boolean>
  const spentArr: string[] = r.spent_power_card_ids ?? []
  const spent: Record<string, boolean> = {}
  for (const id of spentArr) spent[id] = true

  return {
    status: r.status,
    hostId: r.host_id,
    createdAt: r.created_at,
    maxPlayers: r.max_players,
    currentTurnPlayerId: r.current_turn_player_id ?? null,
    drawPileCount: r.draw_pile_count,
    discardTop: r.discard_top ?? null,
    seed: r.seed,
    endCalledBy: r.end_called_by ?? null,
    endRoundStartSeatIndex: r.end_round_start_seat_index ?? null,
    log: r.log ?? [],
    turnPhase: r.turn_phase ?? null,
    playerOrder: r.player_order ?? [],
    joinCode: r.join_code,
    actionVersion: r.action_version,
    lastActionAt: r.last_action_at,
    settings: r.settings,
    spentPowerCardIds: spent,
    turnStartAt: r.turn_start_at,
    voteKick: r.vote_kick ?? null,
    rematchLobbyId: r.rematch_lobby_id ?? null,
  }
}

export function mapPlayerRow(r: PlayerRow): PlayerDoc {
  const rawLocks = Array.isArray(r.locks) ? (r.locks as boolean[]) : undefined
  const lockedByRaw = Array.isArray(r.locked_by)
    ? (r.locked_by as (LockInfo | null)[])
    : undefined
  const slotCount = Math.max(rawLocks?.length ?? 0, lockedByRaw?.length ?? 0, 3)

  return {
    displayName: r.display_name,
    seatIndex: r.seat_index,
    connected: r.connected,
    locks: normalizeLocks(rawLocks, slotCount),
    lockedBy: normalizeLockedBy(lockedByRaw, slotCount),
    colorKey: r.color_key ?? undefined,
    afkStrikes: r.afk_strikes ?? undefined,
  }
}

export function mapPrivateStateRow(r: PrivateStateRow): PrivatePlayerDoc {
  return {
    hand: r.hand ?? [],
    drawnCard: r.drawn_card ?? null,
    drawnCardSource: r.drawn_card_source ?? null,
    known: r.known ?? {},
    opponent_known: r.opponent_known ?? {},
  }
}

export function mapRevealRow(r: RevealRow): PlayerScore {
  return {
    playerId: r.player_id,
    displayName: r.display_name,
    hand: r.hand ?? [],
    total: r.total,
    sevens: r.sevens,
  }
}

export function mapChatRow(r: ChatRow): ChatMessage {
  return {
    id: r.id,
    userId: r.user_id,
    displayName: r.display_name,
    seatIndex: r.seat_index,
    text: r.text,
    ts: r.ts,
  }
}
