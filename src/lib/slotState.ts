import type { LockInfo } from './types'

const EMPTY_LOCK_INFO: LockInfo = { lockerId: null, lockerName: null }

export function getSlotCount(
  locks: boolean[] | null | undefined,
  fallbackCount = 3,
): number {
  return locks && locks.length > 0 ? locks.length : fallbackCount
}

export function createDefaultLocks(slotCount = 3): boolean[] {
  return Array.from({ length: slotCount }, () => false)
}

export function normalizeLocks(
  locks: boolean[] | null | undefined,
  fallbackCount = 3,
): boolean[] {
  const slotCount = Math.max(locks?.length ?? 0, fallbackCount)
  return Array.from({ length: slotCount }, (_, index) => locks?.[index] ?? false)
}

export function normalizeLockedBy(
  lockedBy: (LockInfo | null | undefined)[] | null | undefined,
  fallbackCount = 3,
): LockInfo[] {
  const slotCount = Math.max(lockedBy?.length ?? 0, fallbackCount)
  return Array.from(
    { length: slotCount },
    (_, index) => lockedBy?.[index] ?? EMPTY_LOCK_INFO,
  )
}
