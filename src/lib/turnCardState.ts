import type { Card, DrawnCardSource } from './types'

export type TurnCardUiSource = DrawnCardSource | 'discard-preview'

interface TurnCardUiStateParams {
  drawnCard: Card | null
  drawnCardSource: DrawnCardSource
  localOverride?: { card: Card; source: TurnCardUiSource } | null
}

export interface TurnCardUiState {
  activeCard: Card | null
  activeCardSource: TurnCardUiSource
  hasActiveCard: boolean
  isDiscardPreview: boolean
  isDiscardFlow: boolean
  canSwap: boolean
  canCancel: boolean
  canDiscard: boolean
  canUsePower: boolean
}

export function getTurnCardUiState({
  drawnCard,
  drawnCardSource,
  localOverride = null,
}: TurnCardUiStateParams): TurnCardUiState {
  const activeCard = localOverride?.card ?? drawnCard
  const activeCardSource: TurnCardUiSource = localOverride?.source
    ?? (drawnCard ? (drawnCardSource ?? 'pile') : null)

  const hasActiveCard = !!activeCard
  const isDiscardPreview = activeCardSource === 'discard-preview'
  const isDiscardFlow = activeCardSource === 'discard-preview' || activeCardSource === 'discard'

  return {
    activeCard,
    activeCardSource,
    hasActiveCard,
    isDiscardPreview,
    isDiscardFlow,
    canSwap: hasActiveCard,
    canCancel: hasActiveCard && isDiscardFlow,
    canDiscard: hasActiveCard && activeCardSource === 'pile',
    canUsePower: hasActiveCard && activeCardSource === 'pile',
  }
}
