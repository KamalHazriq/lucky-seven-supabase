import type { Card } from './types'
import { ensureAuth } from './supabase'
import { callRpc } from './supabaseRpc'

export async function drawFromPile(gameId: string): Promise<void> {
  await ensureAuth()
  await callRpc('draw_from_pile', { p_game_id: gameId })
}

export async function takeFromDiscard(gameId: string): Promise<void> {
  await ensureAuth()
  await callRpc('take_from_discard', { p_game_id: gameId })
}

export async function cancelDraw(gameId: string): Promise<void> {
  await ensureAuth()
  await callRpc('cancel_draw', { p_game_id: gameId })
}

export async function swapWithSlot(gameId: string, slotIndex: number): Promise<void> {
  await ensureAuth()
  await callRpc('swap_with_slot', { p_game_id: gameId, p_slot_index: slotIndex })
}

export async function discardDrawn(gameId: string): Promise<void> {
  await ensureAuth()
  await callRpc('discard_drawn', { p_game_id: gameId })
}

export async function usePeekOne(gameId: string, slotIndex: number, noMemory = false): Promise<Card> {
  await ensureAuth()
  return await callRpc('use_peek_one', {
    p_game_id: gameId,
    p_slot_index: slotIndex,
    ...(noMemory ? { p_no_memory: true } : {}),
  })
}

export async function usePeekAll(gameId: string, noMemory = false): Promise<Record<number, Card>> {
  await ensureAuth()
  const result = await callRpc('use_peek_all', {
    p_game_id: gameId,
    ...(noMemory ? { p_no_memory: true } : {}),
  })
  return Object.fromEntries(
    Object.entries(result).map(([slotIndex, card]) => [Number(slotIndex), card]),
  ) as Record<number, Card>
}

export async function usePeekOpponent(
  gameId: string,
  targetPlayerId: string,
  slotIndex: number,
  noMemory = false,
): Promise<{ card: Card; playerName: string }> {
  await ensureAuth()
  return await callRpc('use_peek_opponent', {
    p_game_id: gameId,
    p_target_player: targetPlayerId,
    p_slot_index: slotIndex,
    ...(noMemory ? { p_no_memory: true } : {}),
  })
}

export async function usePeekAllOpponent(
  gameId: string,
  targetPlayerId: string,
  noMemory = false,
): Promise<{ cards: Record<number, Card>; playerName: string; locks: boolean[] }> {
  await ensureAuth()
  const result = await callRpc('use_peek_all_opponent', {
    p_game_id: gameId,
    p_target_player: targetPlayerId,
    ...(noMemory ? { p_no_memory: true } : {}),
  })
  return {
    ...result,
    cards: Object.fromEntries(
      Object.entries(result.cards).map(([slotIndex, card]) => [Number(slotIndex), card]),
    ) as Record<number, Card>,
  }
}

export async function useSwap(
  gameId: string,
  targetA: { playerId: string; slotIndex: number },
  targetB: { playerId: string; slotIndex: number },
): Promise<void> {
  await ensureAuth()
  await callRpc('use_swap_power', {
    p_game_id: gameId,
    p_a_player: targetA.playerId,
    p_a_slot: targetA.slotIndex,
    p_b_player: targetB.playerId,
    p_b_slot: targetB.slotIndex,
  })
}

export async function useLock(gameId: string, targetPlayerId: string, slotIndex: number): Promise<void> {
  await ensureAuth()
  await callRpc('use_lock', {
    p_game_id: gameId,
    p_target_player: targetPlayerId,
    p_slot_index: slotIndex,
  })
}

export async function useUnlock(gameId: string, targetPlayerId: string, slotIndex: number): Promise<void> {
  await ensureAuth()
  await callRpc('use_unlock', {
    p_game_id: gameId,
    p_target_player: targetPlayerId,
    p_slot_index: slotIndex,
  })
}

export async function useRearrange(gameId: string, targetPlayerId: string): Promise<void> {
  await ensureAuth()
  await callRpc('use_rearrange', {
    p_game_id: gameId,
    p_target_player: targetPlayerId,
  })
}

export async function callEnd(gameId: string): Promise<void> {
  await ensureAuth()
  await callRpc('call_end', { p_game_id: gameId })
}

export async function revealHand(gameId: string): Promise<void> {
  await ensureAuth()
  await callRpc('reveal_hand', { p_game_id: gameId })
}

export async function skipTurn(gameId: string, expectedActionVersion: number): Promise<void> {
  await ensureAuth()
  await callRpc('skip_turn', {
    p_game_id: gameId,
    p_expected_action_version: expectedActionVersion,
  })
}

export async function leaveGame(gameId: string): Promise<void> {
  await ensureAuth()
  await callRpc('leave_game', { p_game_id: gameId })
}
