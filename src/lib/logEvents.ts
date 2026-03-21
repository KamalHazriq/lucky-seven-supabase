export type PowerPeekVariant = 'self_one' | 'self_all' | 'opponent_one' | 'opponent_all'
export type VoteKickCancelReason = 'vote_no' | 'starter_cancel' | 'host_cancel'

export interface EventSlotTarget {
  playerId: string
  slotIndex: number
}

export type GameActionEvent =
  | { kind: 'game_created'; actorId: string }
  | { kind: 'player_joined'; actorId: string }
  | { kind: 'game_started'; actorId: string }
  | { kind: 'draw_pile'; actorId: string }
  | { kind: 'take_discard'; actorId: string }
  | { kind: 'cancel_draw'; actorId: string }
  | { kind: 'swap_slot'; actorId: string; slotIndex: number }
  | { kind: 'discard_drawn'; actorId: string }
  | { kind: 'power_swap'; actorId: string; first: EventSlotTarget; second: EventSlotTarget }
  | { kind: 'power_lock'; actorId: string; target: EventSlotTarget }
  | { kind: 'power_unlock'; actorId: string; target: EventSlotTarget | null; fizzled: boolean }
  | { kind: 'power_rearrange'; actorId: string; targetPlayerId: string | null }
  | { kind: 'power_peek'; actorId: string; variant: PowerPeekVariant; targetPlayerId?: string | null; slotIndex?: number | null }
  | { kind: 'call_end'; actorId: string }
  | { kind: 'vote_kick_started'; actorId: string; targetPlayerId: string; requiredVotes: number }
  | { kind: 'vote_kick_cancelled'; actorId: string | null; targetPlayerId: string; reason: VoteKickCancelReason }
  | { kind: 'vote_kick_progress'; actorId: string; targetPlayerId: string; votes: number; requiredVotes: number }
  | { kind: 'player_kicked'; playerId: string; reason: 'kick' | 'afk' }
  | { kind: 'player_left'; playerId: string }
  | { kind: 'hand_revealed'; actorId: string; total: number; sevens: number }

export function isGameActionEvent(value: unknown): value is GameActionEvent {
  return typeof value === 'object' && value !== null && 'kind' in value
}
