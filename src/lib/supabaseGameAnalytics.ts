import type { GameDoc, PlayerScore } from './types'
import { ensureAuth } from './supabase'
import { callRpc } from './supabaseRpc'
import { EMPTY_GLOBAL_STATS, firstRpcRow, type FeedbackData, type GlobalStatsSnapshot } from './supabaseGameShared'

export async function writeGameSummary(
  gameId: string,
  scores: PlayerScore[],
  game: GameDoc,
): Promise<void> {
  try {
    await ensureAuth()
    const minScore = scores.length > 0 ? scores[0].total : 0
    const tiedScores = scores.filter((score) => score.total === minScore)
    const maxSevens = Math.max(...tiedScores.map((score) => score.sevens), 0)
    const winners = tiedScores
      .filter((score) => score.sevens === maxSevens)
      .map((score) => ({
        id: score.playerId,
        name: score.displayName,
        score: score.total,
        sevens: score.sevens,
      }))

    await callRpc('write_game_summary', {
      p_game_id: gameId,
      p_winners: winners,
      p_player_count: game.playerOrder.length,
      p_turns: game.actionVersion,
      p_deck_size: game.drawPileCount,
      p_settings: game.settings,
    })
  } catch (error) {
    console.error('Analytics write failed (non-critical):', error)
  }
}

export async function submitFeedback(data: FeedbackData): Promise<void> {
  await ensureAuth()
  await callRpc('submit_feedback', {
    p_rating: data.rating,
    p_name: data.name,
    p_message: data.message,
    p_app_version: data.appVersion,
    p_theme: data.theme,
  })
}

export async function incrementVisits(): Promise<void> {
  try {
    await callRpc('increment_visits', {})
  } catch (error) {
    console.error('Visit increment failed:', (error as Error).message)
  }
}

export async function getGlobalStats(): Promise<GlobalStatsSnapshot> {
  try {
    const data = await callRpc('get_global_stats', {})
    const row = firstRpcRow(data)
    if (!row) return EMPTY_GLOBAL_STATS

    const uniquePlayers = Number(row.unique_players)
    return {
      gamesPlayed: row.games_played ?? 0,
      totalVisits: row.total_visits ?? 0,
      lastGameAt: row.last_game_at ?? null,
      gamesFinished: row.games_finished ?? 0,
      totalPlayers: row.total_players ?? 0,
      uniquePlayers: Number.isFinite(uniquePlayers) ? uniquePlayers : 0,
    }
  } catch {
    return EMPTY_GLOBAL_STATS
  }
}
