import type { SelectionConstraint } from './useSelectionMode'

export const PEEK_ONE_CONSTRAINT: SelectionConstraint = {
  targetType: 'yourSlot',
  prompt: 'Pick one of your cards to peek',
}

export const SWAP_CONSTRAINT: SelectionConstraint = {
  targetType: 'anyPlayerSlot',
  prompt: 'Pick the first card to swap',
  secondTargetType: 'anyPlayerSlot',
  secondPrompt: 'Pick the second card to swap',
}

export const LOCK_CONSTRAINT: SelectionConstraint = {
  targetType: 'anyUnlockedSlot',
  prompt: 'Pick an unlocked card to lock',
}

export const UNLOCK_CONSTRAINT: SelectionConstraint = {
  targetType: 'anyLockedSlot',
  prompt: 'Pick a locked card to unlock',
}

export const REARRANGE_CONSTRAINT: SelectionConstraint = {
  targetType: 'anyPlayer',
  prompt: 'Pick a player to shuffle their cards',
}
