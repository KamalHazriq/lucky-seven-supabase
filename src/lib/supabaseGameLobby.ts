import { nanoid } from 'nanoid'
import { supabase, ensureAuth } from './supabase'
import { callRpc } from './supabaseRpc'
import { buildDeck, shuffleDeck } from './deck'
import type { FunctionArgs, TableRow } from './supabaseDatabase.generated'
import type { GameSettings } from './types'
import { mergeGameSettings } from './supabaseGameShared'

export async function createGame(
  displayName: string,
  maxPlayers: number,
  settings?: Partial<GameSettings>,
): Promise<string> {
  await ensureAuth()

  const seed = nanoid(12)
  const gameSettings = mergeGameSettings(settings)
  const createArgs = (joinCode: string): FunctionArgs<'create_game'> => ({
    p_display_name: displayName,
    p_max_players: maxPlayers,
    p_settings: gameSettings,
    p_join_code: joinCode,
    p_seed: seed,
  })

  try {
    return await callRpc('create_game', createArgs(nanoid(6).toUpperCase()))
  } catch (error) {
    if ((error as Error).message.includes('Join code conflict')) {
      return await callRpc('create_game', createArgs(nanoid(6).toUpperCase()))
    }
    throw error
  }
}

export async function joinGame(
  gameId: string,
  displayName: string,
  colorKey?: number,
): Promise<void> {
  await ensureAuth()
  await callRpc('join_game', {
    p_game_id: gameId,
    p_display_name: displayName,
    p_color_key: colorKey ?? null,
  })
}

export async function startGame(gameId: string): Promise<void> {
  await ensureAuth()

  const { data, error } = await supabase
    .from('games')
    .select('seed, settings')
    .eq('id', gameId)
    .single()

  if (error || !data) throw new Error('Could not read game')

  const game = data as Pick<TableRow<'games'>, 'seed' | 'settings'>
  const deck = shuffleDeck(
    buildDeck(game.settings?.jokerCount ?? 2, game.settings?.deckSize ?? 1, game.seed),
    game.seed,
  )

  await callRpc('start_game', {
    p_game_id: gameId,
    p_deck: deck,
  })
}

export async function leaveLobby(gameId: string): Promise<void> {
  await ensureAuth()
  await callRpc('leave_lobby', { p_game_id: gameId })
}

export async function updateGameSettings(
  gameId: string,
  settings: Partial<GameSettings>,
): Promise<void> {
  await ensureAuth()
  await callRpc('update_game_settings', {
    p_game_id: gameId,
    p_settings: settings,
  })
}

export async function updatePlayerProfile(
  gameId: string,
  updates: { displayName?: string; colorKey?: number },
): Promise<void> {
  await ensureAuth()
  await callRpc('update_player_profile', {
    p_game_id: gameId,
    p_display_name: updates.displayName ?? null,
    p_color_key: updates.colorKey ?? null,
  })
}

export async function findGameByCode(joinCode: string): Promise<string | null> {
  try {
    return await callRpc('find_game_by_code', { p_join_code: joinCode })
  } catch {
    return null
  }
}

export async function playAgain(
  gameId: string,
  displayName: string,
  maxPlayers: number,
  settings: Partial<GameSettings>,
  colorKey?: number,
): Promise<string> {
  await ensureAuth()
  return await callRpc('play_again', {
    p_finished_game_id: gameId,
    p_display_name: displayName,
    p_max_players: maxPlayers,
    p_settings: mergeGameSettings(settings),
    p_join_code: nanoid(6).toUpperCase(),
    p_seed: nanoid(12),
    p_color_key: colorKey ?? null,
  })
}
