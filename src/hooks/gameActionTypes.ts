import type { Card, PowerEffectType, PowerRankKey } from '../lib/types'

export type ModalState =
  | { type: 'peekOne' }
  | { type: 'peekResult'; card: Card; slot: number }
  | { type: 'peekAll'; cards: Record<string, Card> }
  | { type: 'swap' }
  | { type: 'lock' }
  | { type: 'unlock' }
  | { type: 'rearrange' }
  | { type: 'peekChoice'; effectType: PowerEffectType; rankKey: PowerRankKey }
  | { type: 'peekOpponent' }
  | { type: 'peekOpponentResult'; card: Card; playerName: string; slot: number }
  | { type: 'peekAllOpponent' }
  | { type: 'peekAllOpponentResult'; cards: Record<number, Card>; playerName: string; locks: boolean[] }
  | { type: 'none' }
