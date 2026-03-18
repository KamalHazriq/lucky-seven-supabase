/**
 * Supabase row → TypeScript type mappers.
 * Converts snake_case Postgres columns to camelCase types
 * expected by existing UI components.
 */

import type {
  GameDoc, PlayerDoc, PrivatePlayerDoc, PlayerScore, ChatMessage, LockInfo,
} from './types'

const EMPTY_LOCK: LockInfo = { lockerId: null, lockerName: null }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>

export function mapGameRow(r: Row): GameDoc {
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

export function mapPlayerRow(r: Row): PlayerDoc {
  const lockedByRaw: (LockInfo | null)[] = r.locked_by ?? [null, null, null]
  return {
    displayName: r.display_name,
    seatIndex: r.seat_index,
    connected: r.connected,
    locks: r.locks ?? [false, false, false],
    lockedBy: [
      lockedByRaw[0] ?? EMPTY_LOCK,
      lockedByRaw[1] ?? EMPTY_LOCK,
      lockedByRaw[2] ?? EMPTY_LOCK,
    ],
    colorKey: r.color_key ?? undefined,
    afkStrikes: r.afk_strikes ?? undefined,
  }
}

export function mapPrivateStateRow(r: Row): PrivatePlayerDoc {
  return {
    hand: r.hand ?? [],
    drawnCard: r.drawn_card ?? null,
    drawnCardSource: r.drawn_card_source ?? null,
    known: r.known ?? {},
  }
}

export function mapRevealRow(r: Row): PlayerScore {
  return {
    playerId: r.player_id,
    displayName: r.display_name,
    hand: r.hand ?? [],
    total: r.total,
    sevens: r.sevens,
  }
}

export function mapChatRow(r: Row): ChatMessage {
  return {
    id: r.id,
    userId: r.user_id,
    displayName: r.display_name,
    seatIndex: r.seat_index,
    text: r.text,
    ts: r.ts,
  }
}
