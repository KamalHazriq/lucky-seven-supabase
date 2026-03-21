import type { GameSettings } from './types'
import { DEFAULT_GAME_SETTINGS } from './types'

export interface FeedbackData {
  rating: number
  name: string
  message: string
  appVersion: string
  theme: string
}

export interface GlobalStatsSnapshot {
  gamesPlayed: number
  totalVisits: number
  lastGameAt: number | null
  gamesFinished: number
  totalPlayers: number
  uniquePlayers: number
}

export const EMPTY_GLOBAL_STATS: GlobalStatsSnapshot = {
  gamesPlayed: 0,
  totalVisits: 0,
  lastGameAt: null,
  gamesFinished: 0,
  totalPlayers: 0,
  uniquePlayers: 0,
}

export function mergeGameSettings(settings?: Partial<GameSettings>): GameSettings {
  return {
    powerAssignments: { ...DEFAULT_GAME_SETTINGS.powerAssignments, ...settings?.powerAssignments },
    jokerCount: settings?.jokerCount ?? DEFAULT_GAME_SETTINGS.jokerCount,
    deckSize: settings?.deckSize ?? DEFAULT_GAME_SETTINGS.deckSize,
    turnSeconds: settings?.turnSeconds ?? DEFAULT_GAME_SETTINGS.turnSeconds,
    peekAllowsOpponent: settings?.peekAllowsOpponent ?? DEFAULT_GAME_SETTINGS.peekAllowsOpponent,
    cardsPerPlayer: settings?.cardsPerPlayer ?? DEFAULT_GAME_SETTINGS.cardsPerPlayer,
    noMemoryMode: settings?.noMemoryMode ?? DEFAULT_GAME_SETTINGS.noMemoryMode,
  }
}

export function firstRpcRow<T>(data: T | T[] | null | undefined): T | undefined {
  if (!data) return undefined
  return Array.isArray(data) ? data[0] : data
}
