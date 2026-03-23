import { useCallback, useState, type RefObject } from 'react'

export type StagedDropTarget =
  | { kind: 'discard' }
  | { kind: 'slot'; slotIndex: number }
  | null

interface UseStagedCardDropParams {
  enabled: boolean
  allowDiscardTarget?: boolean
  lockedSlots: boolean[]
  localPanelRef: RefObject<HTMLDivElement | null>
  discardPileRef: RefObject<HTMLDivElement | null>
}

function pointInside(rect: DOMRect, x: number, y: number, padding = 0): boolean {
  return (
    x >= rect.left - padding &&
    x <= rect.right + padding &&
    y >= rect.top - padding &&
    y <= rect.bottom + padding
  )
}

function sameTarget(a: StagedDropTarget, b: StagedDropTarget): boolean {
  if (!a && !b) return true
  if (!a || !b) return false
  if (a.kind !== b.kind) return false
  if (a.kind === 'discard') return true
  return b.kind === 'slot' && a.slotIndex === b.slotIndex
}

export function useStagedCardDrop({
  enabled,
  allowDiscardTarget = true,
  lockedSlots,
  localPanelRef,
  discardPileRef,
}: UseStagedCardDropParams) {
  const [dropTarget, setDropTarget] = useState<StagedDropTarget>(null)

  const resolveDropTarget = useCallback((x: number, y: number): StagedDropTarget => {
    if (!enabled) return null

    const discardRect = discardPileRef.current?.getBoundingClientRect()
    if (allowDiscardTarget && discardRect && pointInside(discardRect, x, y, 18)) {
      return { kind: 'discard' }
    }

    const panelEl = localPanelRef.current
    if (!panelEl) return null

    const slotEls = Array.from(panelEl.querySelectorAll<HTMLElement>('[data-slot]'))
    for (const slotEl of slotEls) {
      const slotIndex = Number(slotEl.dataset.slot ?? '-1')
      if (slotIndex < 0 || lockedSlots[slotIndex]) continue
      if (pointInside(slotEl.getBoundingClientRect(), x, y, 14)) {
        return { kind: 'slot', slotIndex }
      }
    }

    return null
  }, [allowDiscardTarget, discardPileRef, enabled, localPanelRef, lockedSlots])

  const updateDropTarget = useCallback((x: number, y: number) => {
    const next = resolveDropTarget(x, y)
    setDropTarget((prev) => (sameTarget(prev, next) ? prev : next))
    return next
  }, [resolveDropTarget])

  const clearDropTarget = useCallback(() => {
    setDropTarget(null)
  }, [])

  return {
    dropTarget,
    resolveDropTarget,
    updateDropTarget,
    clearDropTarget,
  }
}
