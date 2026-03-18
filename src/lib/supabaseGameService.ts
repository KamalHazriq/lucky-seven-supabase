/**
 * Supabase Game Service — All RPC wrappers
 *
 * Lobby: create_game, join_game, start_game, leave_lobby,
 * update_game_settings, update_player_profile, find_game_by_code.
 *
 * Core gameplay: draw_from_pile, take_from_discard, cancel_draw,
 * swap_with_slot, discard_drawn.
 *
 * Powers: peek_one, peek_all, peek_opponent, peek_all_opponent,
 * swap_power, lock, unlock, rearrange.
 *
 * Game flow: call_end, reveal_hand, skip_turn, leave_game.
 *
 * Chat, reveals, rematch, vote kick, dev mode, feedback, stats.
 */

import { supabase, ensureAuth } from './supabase'
import { buildDeck, shuffleDeck } from './deck'
import type { Card, GameSettings, GameDoc, PlayerScore, DevAccessDoc, PrivatePlayerDoc, LogEntry } from './types'
import { DEFAULT_GAME_SETTINGS } from './types'
import { mapRevealRow, mapPrivateStateRow } from './supabaseMappers'
import { nanoid } from 'nanoid'

// ─── Feedback data type (replaces the one from gameService.ts) ───
export interface FeedbackData {
  rating: number // 1-5
  name: string
  message: string
  appVersion: string
  theme: string
}

// ─── Create Game ────────────────────────────────────────────────
export async function createGame(
  displayName: string,
  maxPlayers: number,
  settings?: Partial<GameSettings>,
): Promise<string> {
  await ensureAuth()

  const joinCode = nanoid(6).toUpperCase()
  const seed = nanoid(12)

  const gameSettings: GameSettings = {
    powerAssignments: { ...DEFAULT_GAME_SETTINGS.powerAssignments, ...settings?.powerAssignments },
    jokerCount: settings?.jokerCount ?? DEFAULT_GAME_SETTINGS.jokerCount,
    deckSize: settings?.deckSize ?? DEFAULT_GAME_SETTINGS.deckSize,
    turnSeconds: settings?.turnSeconds ?? DEFAULT_GAME_SETTINGS.turnSeconds,
    peekAllowsOpponent: settings?.peekAllowsOpponent ?? DEFAULT_GAME_SETTINGS.peekAllowsOpponent,
    cardsPerPlayer: settings?.cardsPerPlayer ?? DEFAULT_GAME_SETTINGS.cardsPerPlayer,
    noMemoryMode: settings?.noMemoryMode ?? DEFAULT_GAME_SETTINGS.noMemoryMode,
  }

  const { data, error } = await supabase.rpc('create_game', {
    p_display_name: displayName,
    p_max_players: maxPlayers,
    p_settings: gameSettings,
    p_join_code: joinCode,
    p_seed: seed,
  })

  if (error) {
    // Join code conflict — retry once with a new code
    if (error.message.includes('Join code conflict')) {
      const retryCode = nanoid(6).toUpperCase()
      const { data: retryData, error: retryError } = await supabase.rpc('create_game', {
        p_display_name: displayName,
        p_max_players: maxPlayers,
        p_settings: gameSettings,
        p_join_code: retryCode,
        p_seed: seed,
      })
      if (retryError) throw new Error(retryError.message)
      return retryData as string
    }
    throw new Error(error.message)
  }

  return data as string
}

// ─── Join Game ──────────────────────────────────────────────────
export async function joinGame(
  gameId: string,
  displayName: string,
  colorKey?: number,
): Promise<void> {
  await ensureAuth()

  const { error } = await supabase.rpc('join_game', {
    p_game_id: gameId,
    p_display_name: displayName,
    p_color_key: colorKey ?? null,
  })

  if (error) throw new Error(error.message)
}

// ─── Start Game ─────────────────────────────────────────────────
export async function startGame(gameId: string): Promise<void> {
  await ensureAuth()

  // Read the game to get seed + settings for deck building
  const { data: game, error: gameError } = await supabase
    .from('games')
    .select('seed, settings')
    .eq('id', gameId)
    .single()

  if (gameError || !game) throw new Error('Could not read game')

  const jokerCount = (game.settings as GameSettings)?.jokerCount ?? 2
  const deckSize = (game.settings as GameSettings)?.deckSize ?? 1
  const seed = game.seed as string

  // Build and shuffle deck client-side using the deterministic seed
  const deck = shuffleDeck(buildDeck(jokerCount, deckSize, seed), seed)

  const { error } = await supabase.rpc('start_game', {
    p_game_id: gameId,
    p_deck: deck,
  })

  if (error) throw new Error(error.message)
}

// ─── Leave Lobby ────────────────────────────────────────────────
export async function leaveLobby(gameId: string): Promise<void> {
  await ensureAuth()

  const { error } = await supabase.rpc('leave_lobby', {
    p_game_id: gameId,
  })

  if (error) throw new Error(error.message)
}

// ─── Update Game Settings ───────────────────────────────────────
export async function updateGameSettings(
  gameId: string,
  settings: Partial<GameSettings>,
): Promise<void> {
  await ensureAuth()

  const { error } = await supabase.rpc('update_game_settings', {
    p_game_id: gameId,
    p_settings: settings,
  })

  if (error) throw new Error(error.message)
}

// ─── Update Player Profile ──────────────────────────────────────
export async function updatePlayerProfile(
  gameId: string,
  updates: { displayName?: string; colorKey?: number },
): Promise<void> {
  await ensureAuth()

  const { error } = await supabase.rpc('update_player_profile', {
    p_game_id: gameId,
    p_display_name: updates.displayName ?? null,
    p_color_key: updates.colorKey ?? null,
  })

  if (error) throw new Error(error.message)
}

// ─── Find Game by Code ──────────────────────────────────────────
export async function findGameByCode(joinCode: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('find_game_by_code', {
    p_join_code: joinCode,
  })

  if (error) return null
  return (data as string) ?? null
}

// ═════════════════════════════════════════════════════════════════
// Phase 3b — Core Gameplay Actions
// ═════════════════════════════════════════════════════════════════

// ─── Draw from Pile ─────────────────────────────────────────────
export async function drawFromPile(gameId: string): Promise<void> {
  await ensureAuth()

  const { error } = await supabase.rpc('draw_from_pile', {
    p_game_id: gameId,
  })

  if (error) throw new Error(error.message)
}

// ─── Take from Discard ──────────────────────────────────────────
export async function takeFromDiscard(gameId: string): Promise<void> {
  await ensureAuth()

  const { error } = await supabase.rpc('take_from_discard', {
    p_game_id: gameId,
  })

  if (error) throw new Error(error.message)
}

// ─── Cancel Draw ────────────────────────────────────────────────
export async function cancelDraw(gameId: string): Promise<void> {
  await ensureAuth()

  const { error } = await supabase.rpc('cancel_draw', {
    p_game_id: gameId,
  })

  if (error) throw new Error(error.message)
}

// ─── Swap with Slot ─────────────────────────────────────────────
export async function swapWithSlot(gameId: string, slotIndex: number): Promise<void> {
  await ensureAuth()

  const { error } = await supabase.rpc('swap_with_slot', {
    p_game_id: gameId,
    p_slot_index: slotIndex,
  })

  if (error) throw new Error(error.message)
}

// ─── Discard Drawn Card ─────────────────────────────────────────
export async function discardDrawn(gameId: string): Promise<void> {
  await ensureAuth()

  const { error } = await supabase.rpc('discard_drawn', {
    p_game_id: gameId,
  })

  if (error) throw new Error(error.message)
}

// ═════════════════════════════════════════════════════════════════
// Phase 3c — Powers
// ═════════════════════════════════════════════════════════════════

// ─── Peek One ───────────────────────────────────────────────────
export async function usePeekOne(gameId: string, slotIndex: number, noMemory = false): Promise<Card> {
  await ensureAuth()

  const { data, error } = await supabase.rpc('use_peek_one', {
    p_game_id: gameId,
    p_slot_index: slotIndex,
    p_no_memory: noMemory,
  })

  if (error) throw new Error(error.message)
  return data as Card
}

// ─── Peek All ───────────────────────────────────────────────────
export async function usePeekAll(gameId: string, noMemory = false): Promise<Record<number, Card>> {
  await ensureAuth()

  const { data, error } = await supabase.rpc('use_peek_all', {
    p_game_id: gameId,
    p_no_memory: noMemory,
  })

  if (error) throw new Error(error.message)
  return data as Record<number, Card>
}

// ─── Peek Opponent ──────────────────────────────────────────────
export async function usePeekOpponent(
  gameId: string,
  targetPlayerId: string,
  slotIndex: number,
  noMemory = false,
): Promise<{ card: Card; playerName: string }> {
  await ensureAuth()

  const { data, error } = await supabase.rpc('use_peek_opponent', {
    p_game_id: gameId,
    p_target_player: targetPlayerId,
    p_slot_index: slotIndex,
    p_no_memory: noMemory,
  })

  if (error) throw new Error(error.message)
  return data as { card: Card; playerName: string }
}

// ─── Peek All Opponent ──────────────────────────────────────────
export async function usePeekAllOpponent(
  gameId: string,
  targetPlayerId: string,
  noMemory = false,
): Promise<{ cards: Record<number, Card>; playerName: string; locks: boolean[] }> {
  await ensureAuth()

  const { data, error } = await supabase.rpc('use_peek_all_opponent', {
    p_game_id: gameId,
    p_target_player: targetPlayerId,
    p_no_memory: noMemory,
  })

  if (error) throw new Error(error.message)
  return data as { cards: Record<number, Card>; playerName: string; locks: boolean[] }
}

// ─── Swap Power (Queen) ─────────────────────────────────────────
export async function useSwap(
  gameId: string,
  targetA: { playerId: string; slotIndex: number },
  targetB: { playerId: string; slotIndex: number },
): Promise<void> {
  await ensureAuth()

  const { error } = await supabase.rpc('use_swap_power', {
    p_game_id: gameId,
    p_a_player: targetA.playerId,
    p_a_slot: targetA.slotIndex,
    p_b_player: targetB.playerId,
    p_b_slot: targetB.slotIndex,
  })

  if (error) throw new Error(error.message)
}

// ─── Lock ───────────────────────────────────────────────────────
export async function useLock(
  gameId: string,
  targetPlayerId: string,
  slotIndex: number,
): Promise<void> {
  await ensureAuth()

  const { error } = await supabase.rpc('use_lock', {
    p_game_id: gameId,
    p_target_player: targetPlayerId,
    p_slot_index: slotIndex,
  })

  if (error) throw new Error(error.message)
}

// ─── Unlock ─────────────────────────────────────────────────────
export async function useUnlock(
  gameId: string,
  targetPlayerId: string,
  slotIndex: number,
): Promise<void> {
  await ensureAuth()

  const { error } = await supabase.rpc('use_unlock', {
    p_game_id: gameId,
    p_target_player: targetPlayerId,
    p_slot_index: slotIndex,
  })

  if (error) throw new Error(error.message)
}

// ─── Rearrange ──────────────────────────────────────────────────
export async function useRearrange(
  gameId: string,
  targetPlayerId: string,
): Promise<void> {
  await ensureAuth()

  const { error } = await supabase.rpc('use_rearrange', {
    p_game_id: gameId,
    p_target_player: targetPlayerId,
  })

  if (error) throw new Error(error.message)
}

// ═════════════════════════════════════════════════════════════════
// Phase 3c — Game Flow
// ═════════════════════════════════════════════════════════════════

// ─── Call End ───────────────────────────────────────────────────
export async function callEnd(gameId: string): Promise<void> {
  await ensureAuth()

  const { error } = await supabase.rpc('call_end', {
    p_game_id: gameId,
  })

  if (error) throw new Error(error.message)
}

// ─── Reveal Hand ────────────────────────────────────────────────
export async function revealHand(gameId: string): Promise<void> {
  await ensureAuth()

  const { error } = await supabase.rpc('reveal_hand', {
    p_game_id: gameId,
  })

  if (error) throw new Error(error.message)
}

// ─── Skip Turn ──────────────────────────────────────────────────
export async function skipTurn(gameId: string, expectedActionVersion: number): Promise<void> {
  await ensureAuth()

  const { error } = await supabase.rpc('skip_turn', {
    p_game_id: gameId,
    p_expected_action_version: expectedActionVersion,
  })

  if (error) throw new Error(error.message)
}

// ─── Leave Game ─────────────────────────────────────────────────
export async function leaveGame(gameId: string): Promise<void> {
  await ensureAuth()

  const { error } = await supabase.rpc('leave_game', {
    p_game_id: gameId,
  })

  if (error) throw new Error(error.message)
}

// ═════════════════════════════════════════════════════════════════
// Phase 4 — Chat + Reveals
// ═════════════════════════════════════════════════════════════════

// ─── Send Chat Message ──────────────────────────────────────────
export async function sendChatMessage(
  gameId: string,
  text: string,
): Promise<void> {
  await ensureAuth()

  const msgId = nanoid(10)
  const { error } = await supabase.rpc('send_chat_message', {
    p_game_id: gameId,
    p_text: text.slice(0, 300),
    p_msg_id: msgId,
  })

  if (error) throw new Error(error.message)
}

// ─── Subscribe to Reveals ───────────────────────────────────────
// Initial fetch + realtime inserts for game reveals.
// Waits for auth before subscribing so RLS policies work on first load.
export function subscribeReveals(
  gameId: string,
  cb: (scores: PlayerScore[]) => void,
): () => void {
  let scores: PlayerScore[] = []
  let cancelled = false

  const sortAndEmit = () => {
    const sorted = [...scores].sort((a, b) =>
      a.total !== b.total ? a.total - b.total : b.sevens - a.sevens,
    )
    cb(sorted)
  }

  const channel = supabase
    .channel(`reveals:${gameId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'game_reveals',
        filter: `game_id=eq.${gameId}`,
      },
      (payload) => {
        if (cancelled) return
        const newScore = mapRevealRow(payload.new)
        // Avoid duplicates
        const existing = scores.findIndex((s) => s.playerId === newScore.playerId)
        if (existing >= 0) {
          scores[existing] = newScore
        } else {
          scores.push(newScore)
        }
        sortAndEmit()
      },
    )

  // Wait for auth before subscribing + fetching (RLS needs a valid JWT)
  ensureAuth().then(() => {
    if (cancelled) return

    channel.subscribe()

    supabase
      .from('game_reveals')
      .select('*')
      .eq('game_id', gameId)
      .then(({ data }) => {
        if (cancelled || !data) return
        scores = data.map(mapRevealRow)
        sortAndEmit()
      })
  })

  return () => {
    cancelled = true
    supabase.removeChannel(channel)
  }
}

// ═════════════════════════════════════════════════════════════════
// Phase 3d — Remaining RPCs
// ═════════════════════════════════════════════════════════════════

// ─── Write Game Summary ──────────────────────────────────────────
export async function writeGameSummary(
  gameId: string,
  scores: PlayerScore[],
  game: GameDoc,
): Promise<void> {
  try {
    await ensureAuth()

    // Determine winners (min score, sevens tiebreaker)
    const minScore = scores.length > 0 ? scores[0].total : 0
    const tied = scores.filter((s) => s.total === minScore)
    const maxSevens = Math.max(...tied.map((s) => s.sevens), 0)
    const winners = tied
      .filter((s) => s.sevens === maxSevens)
      .map((s) => ({ id: s.playerId, name: s.displayName, score: s.total, sevens: s.sevens }))

    const { error } = await supabase.rpc('write_game_summary', {
      p_game_id: gameId,
      p_winners: winners,
      p_player_count: game.playerOrder.length,
      p_turns: game.actionVersion,
      p_deck_size: game.drawPileCount,
      p_settings: game.settings,
    })
    if (error) console.error('Summary write failed:', error.message)
  } catch (e) {
    console.error('Analytics write failed (non-critical):', e)
  }
}

// ─── Play Again (shared rematch lobby) ──────────────────────────
export async function playAgain(
  gameId: string,
  displayName: string,
  maxPlayers: number,
  settings: Partial<GameSettings>,
  colorKey?: number,
): Promise<string> {
  await ensureAuth()

  const joinCode = nanoid(6).toUpperCase()
  const seed = nanoid(12)

  const gameSettings: GameSettings = {
    powerAssignments: { ...DEFAULT_GAME_SETTINGS.powerAssignments, ...settings?.powerAssignments },
    jokerCount: settings?.jokerCount ?? DEFAULT_GAME_SETTINGS.jokerCount,
    deckSize: settings?.deckSize ?? DEFAULT_GAME_SETTINGS.deckSize,
    turnSeconds: settings?.turnSeconds ?? DEFAULT_GAME_SETTINGS.turnSeconds,
    peekAllowsOpponent: settings?.peekAllowsOpponent ?? DEFAULT_GAME_SETTINGS.peekAllowsOpponent,
    cardsPerPlayer: settings?.cardsPerPlayer ?? DEFAULT_GAME_SETTINGS.cardsPerPlayer,
    noMemoryMode: settings?.noMemoryMode ?? DEFAULT_GAME_SETTINGS.noMemoryMode,
  }

  const { data, error } = await supabase.rpc('play_again', {
    p_finished_game_id: gameId,
    p_display_name: displayName,
    p_max_players: maxPlayers,
    p_settings: gameSettings,
    p_join_code: joinCode,
    p_seed: seed,
    p_color_key: colorKey ?? null,
  })

  if (error) throw new Error(error.message)
  return data as string
}

// ─── Vote Kick ──────────────────────────────────────────────────
export async function initiateVoteKick(gameId: string, targetPlayerId: string): Promise<void> {
  await ensureAuth()

  const { error } = await supabase.rpc('initiate_vote_kick', {
    p_game_id: gameId,
    p_target_player: targetPlayerId,
  })

  if (error) throw new Error(error.message)
}

export async function castVoteKick(gameId: string, voteYes: boolean): Promise<void> {
  await ensureAuth()

  const { error } = await supabase.rpc('cast_vote_kick', {
    p_game_id: gameId,
    p_vote_yes: voteYes,
  })

  if (error) throw new Error(error.message)
}

export async function cancelVoteKick(gameId: string): Promise<void> {
  await ensureAuth()

  const { error } = await supabase.rpc('cancel_vote_kick', {
    p_game_id: gameId,
  })

  if (error) throw new Error(error.message)
}

// ─── Dev Mode ───────────────────────────────────────────────────
export async function activateDevMode(gameId: string, code: string): Promise<void> {
  await ensureAuth()

  const { error } = await supabase.rpc('activate_dev_mode', {
    p_game_id: gameId,
    p_code: code,
  })

  if (error) throw new Error(error.message)
}

export async function deactivateDevMode(gameId: string): Promise<void> {
  await ensureAuth()

  const { error } = await supabase.rpc('deactivate_dev_mode', {
    p_game_id: gameId,
  })

  if (error) throw new Error(error.message)
}

// ─── Dev: Reorder Draw Pile ─────────────────────────────────────
export async function devReorderDrawPile(gameId: string, reordered: Card[]): Promise<void> {
  await ensureAuth()

  const { error } = await supabase.rpc('dev_reorder_draw_pile', {
    p_game_id: gameId,
    p_reordered: reordered,
  })

  if (error) throw new Error(error.message)
}

// ─── Dev: Subscribe to dev access status ────────────────────────
export function subscribeDevAccess(
  gameId: string,
  uid: string,
  cb: (access: DevAccessDoc | null) => void,
): () => void {
  let cancelled = false

  const channel = supabase
    .channel(`dev-access:${gameId}:${uid}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'game_dev_access',
        filter: `game_id=eq.${gameId}`,
      },
      (payload) => {
        if (cancelled) return
        if (payload.eventType === 'DELETE') {
          const old = payload.old as Record<string, unknown>
          if (old.uid === uid) cb(null)
        } else {
          const row = payload.new as Record<string, unknown>
          if (row.uid === uid) {
            cb({ activatedAt: row.activated_at as number, uid: row.uid as string, privileges: row.privileges as DevAccessDoc['privileges'] })
          }
        }
      },
    )

  ensureAuth().then(() => {
    if (cancelled) return

    channel.subscribe()

    supabase
      .from('game_dev_access')
      .select('*')
      .eq('game_id', gameId)
      .eq('uid', uid)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return
        if (data) {
          cb({ activatedAt: data.activated_at, uid: data.uid, privileges: data.privileges })
        } else {
          cb(null)
        }
      })
  })

  return () => { cancelled = true; supabase.removeChannel(channel) }
}

// ─── Dev: Subscribe to ALL players' private data ────────────────
export function subscribeAllPrivate(
  gameId: string,
  cb: (allPrivate: Record<string, PrivatePlayerDoc>) => void,
): () => void {
  let cancelled = false

  const fetchAll = () => {
    supabase
      .from('game_private_state')
      .select('*')
      .eq('game_id', gameId)
      .then(({ data }) => {
        if (cancelled || !data) return
        const result: Record<string, PrivatePlayerDoc> = {}
        for (const row of data) {
          result[row.player_id] = mapPrivateStateRow(row)
        }
        cb(result)
      })
  }

  const channel = supabase
    .channel(`dev-private:${gameId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'game_private_state',
        filter: `game_id=eq.${gameId}`,
      },
      () => {
        if (!cancelled) fetchAll()
      },
    )

  ensureAuth().then(() => {
    if (cancelled) return
    channel.subscribe()
    fetchAll()
  })

  return () => { cancelled = true; supabase.removeChannel(channel) }
}

// ─── Dev: Subscribe to draw pile ────────────────────────────────
export function subscribeDrawPile(
  gameId: string,
  cb: (cards: Card[]) => void,
): () => void {
  let cancelled = false

  const channel = supabase
    .channel(`dev-drawpile:${gameId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'game_internal',
        filter: `game_id=eq.${gameId}`,
      },
      (payload) => {
        if (cancelled) return
        const row = payload.new as Record<string, unknown>
        cb((row?.draw_pile as Card[]) ?? [])
      },
    )

  ensureAuth().then(() => {
    if (cancelled) return

    channel.subscribe()

    supabase
      .from('game_internal')
      .select('draw_pile')
      .eq('game_id', gameId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return
        cb((data?.draw_pile as Card[]) ?? [])
      })
  })

  return () => { cancelled = true; supabase.removeChannel(channel) }
}

// ─── Feedback ───────────────────────────────────────────────────
export async function submitFeedback(data: FeedbackData): Promise<void> {
  await ensureAuth()

  const { error } = await supabase.rpc('submit_feedback', {
    p_rating: data.rating,
    p_name: data.name,
    p_message: data.message,
    p_app_version: data.appVersion,
    p_theme: data.theme,
  })

  if (error) throw new Error(error.message)
}

// ─── Global Stats ───────────────────────────────────────────────
export async function incrementVisits(): Promise<void> {
  const { error } = await supabase.rpc('increment_visits')
  if (error) console.error('Visit increment failed:', error.message)
}

export async function getGlobalStats(): Promise<{
  gamesPlayed: number
  totalVisits: number
  lastGameAt: number | null
  gamesFinished: number
  totalPlayers: number
  uniquePlayers: number
}> {
  const { data, error } = await supabase.rpc('get_global_stats')
  if (error || !data) return { gamesPlayed: 0, totalVisits: 0, lastGameAt: null, gamesFinished: 0, totalPlayers: 0, uniquePlayers: 0 }
  // TABLE-returning RPCs return an array of rows
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined
  if (!row) return { gamesPlayed: 0, totalVisits: 0, lastGameAt: null, gamesFinished: 0, totalPlayers: 0, uniquePlayers: 0 }
  return {
    gamesPlayed: (row.games_played as number) ?? 0,
    totalVisits: (row.total_visits as number) ?? 0,
    lastGameAt: (row.last_game_at as number) ?? null,
    gamesFinished: (row.games_finished as number) ?? 0,
    totalPlayers: (row.total_players as number) ?? 0,
    uniquePlayers: Number(row.unique_players) ?? 0,
  }
}

// ─── Game History (paginated) ───────────────────────────────────
export async function fetchHistoryPage(
  gameId: string,
  offset: number,
  pageSize = 100,
): Promise<{ entries: LogEntry[]; hasMore: boolean }> {
  const { data, error } = await supabase
    .from('game_history')
    .select('ts, msg')
    .eq('game_id', gameId)
    .order('ts', { ascending: false })
    .range(offset, offset + pageSize - 1)

  if (error || !data) return { entries: [], hasMore: false }
  const entries: LogEntry[] = data.map((r) => ({ ts: r.ts, msg: r.msg }))
  return { entries, hasMore: data.length === pageSize }
}
