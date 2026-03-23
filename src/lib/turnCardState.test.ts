import { describe, expect, it } from 'vitest'
import { getTurnCardUiState } from './turnCardState'
import type { Card } from './types'

function makeCard(id: string, rank: Card['rank'] = 'K'): Card {
  return {
    id,
    rank,
    suit: 'hearts',
    isJoker: false,
  }
}

describe('getTurnCardUiState', () => {
  it('treats a pile draw as a committed action with discard and power available', () => {
    const state = getTurnCardUiState({
      drawnCard: makeCard('pile-7', '7'),
      drawnCardSource: 'pile',
    })

    expect(state.activeCard?.id).toBe('pile-7')
    expect(state.activeCardSource).toBe('pile')
    expect(state.canSwap).toBe(true)
    expect(state.canCancel).toBe(false)
    expect(state.canDiscard).toBe(true)
    expect(state.canUsePower).toBe(true)
  })

  it('keeps discard selection in a reversible preview state', () => {
    const state = getTurnCardUiState({
      drawnCard: null,
      drawnCardSource: null,
      localOverride: { card: makeCard('discard-k'), source: 'discard-preview' },
    })

    expect(state.activeCard?.id).toBe('discard-k')
    expect(state.activeCardSource).toBe('discard-preview')
    expect(state.isDiscardPreview).toBe(true)
    expect(state.canSwap).toBe(true)
    expect(state.canCancel).toBe(true)
    expect(state.canDiscard).toBe(false)
    expect(state.canUsePower).toBe(false)
  })

  it('blocks pile-only follow-up actions once discard has been committed', () => {
    const state = getTurnCardUiState({
      drawnCard: makeCard('discard-q', 'Q'),
      drawnCardSource: 'discard',
    })

    expect(state.activeCardSource).toBe('discard')
    expect(state.canSwap).toBe(true)
    expect(state.canCancel).toBe(true)
    expect(state.canDiscard).toBe(false)
    expect(state.canUsePower).toBe(false)
  })

  it('returns an empty state when there is no active card', () => {
    const state = getTurnCardUiState({
      drawnCard: null,
      drawnCardSource: null,
    })

    expect(state.activeCard).toBeNull()
    expect(state.activeCardSource).toBeNull()
    expect(state.hasActiveCard).toBe(false)
    expect(state.canSwap).toBe(false)
    expect(state.canCancel).toBe(false)
    expect(state.canDiscard).toBe(false)
    expect(state.canUsePower).toBe(false)
  })
})
