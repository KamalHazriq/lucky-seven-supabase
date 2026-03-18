import { useEffect, useRef, type RefObject } from 'react'
import type { GameDoc, PlayerDoc, Card } from '../lib/types'
import { getPlayerColor } from '../lib/playerColors'
import { getSlotCount } from '../lib/slotState'

/**
 * Detects remote player card actions (draw, take, swap, discard, queen swap)
 * and triggers flying card animations + remote staging state.
 *
 * Extracted from Game.tsx — watches actionVersion bumps and parses the last
 * log entry to determine which animation to play.
 */

interface RemoteAnimationDeps {
  game: GameDoc | null
  players: Record<string, PlayerDoc>
  localUserId: string | undefined
  reduced: boolean

  // DOM refs
  drawPileRef: RefObject<HTMLDivElement | null>
  discardPileRef: RefObject<HTMLDivElement | null>
  stagingRef: RefObject<HTMLDivElement | null>
  localPanelRef: RefObject<HTMLDivElement | null>
  otherPanelRefs: RefObject<Record<string, HTMLDivElement | null>>

  // Flying card controls
  triggerFly: (from: DOMRect, to: DOMRect, faceUp: boolean, card?: Card | null, ownerColor?: string) => void
  queueFly: (from: DOMRect, to: DOMRect, faceUp: boolean, card?: Card | null, ownerColor?: string) => void
}

interface RemoteAnimationState {
  setRemoteStaging: (v: { card: Card | null; faceUp: boolean; ownerColor?: string } | null) => void
}

export function useRemoteAnimations(
  deps: RemoteAnimationDeps,
  state: RemoteAnimationState,
): void {
  const {
    game, players, localUserId, reduced,
    drawPileRef, discardPileRef, stagingRef, localPanelRef, otherPanelRefs,
    triggerFly, queueFly,
  } = deps
  const { setRemoteStaging } = state

  const prevActionVersion = useRef(game?.actionVersion ?? 0)
  const prevDiscardTopRef = useRef<Card | null>(game?.discardTop ?? null)
  const cardsPerPlayer = game?.settings?.cardsPerPlayer ?? 3

  // ─── Main remote animation detection ───
  useEffect(() => {
    const av = game?.actionVersion ?? 0
    if (av === prevActionVersion.current || reduced || document.hidden) {
      prevActionVersion.current = av
      return
    }
    prevActionVersion.current = av

    // Defer to next frame so DOM refs have settled after layout render
    const rafId = requestAnimationFrame(() => {
      const lastEntry = game?.log?.[game.log.length - 1]
      if (!lastEntry) return
      const msg = lastEntry.msg

      // Find actor from message
      let actorId: string | null = null
      for (const [pid, pd] of Object.entries(players)) {
        if (msg.startsWith(pd.displayName)) {
          actorId = pid
          break
        }
      }
      if (!actorId) return

      const actorColor = getPlayerColor(players[actorId]?.seatIndex ?? 0, players[actorId]?.colorKey).solid

      // Helper: get actual slot rect from DOM
      const getSlotRect = (panelEl: HTMLDivElement, slot: number, slotCount: number): DOMRect => {
        const slotEl = panelEl.querySelector<HTMLElement>(`[data-slot="${slot}"]`)
        if (slotEl) return slotEl.getBoundingClientRect()
        const p = panelEl.getBoundingClientRect()
        const segW = p.width / Math.max(slotCount, 1)
        return new DOMRect(p.left + segW * slot + segW * 0.1, p.top + p.height * 0.35, segW * 0.8, p.height * 0.6)
      }

      // Helper: get panel element for a player
      const getPanelEl = (pid: string): HTMLDivElement | null => {
        if (pid === localUserId) return localPanelRef.current
        return otherPanelRefs.current[pid] ?? null
      }

      // ─── Queen swap: "used X as swap: A's #1 ↔ B's #2" ───
      const queenSwapMatch = msg.match(/as swap:\s*(.+)'s #(\d)\s*↔\s*(.+)'s #(\d)/)
      if (queenSwapMatch) {
        const nameA = queenSwapMatch[1]
        const slotA = parseInt(queenSwapMatch[2], 10) - 1
        const nameB = queenSwapMatch[3]
        const slotB = parseInt(queenSwapMatch[4], 10) - 1

        let pidA: string | null = null
        let pidB: string | null = null
        for (const [pid, pd] of Object.entries(players)) {
          if (pd.displayName === nameA) pidA = pid
          if (pd.displayName === nameB) pidB = pid
        }

        if (pidA && pidB) {
          const panelA = getPanelEl(pidA)
          const panelB = getPanelEl(pidB)
          if (panelA && panelB) {
            const colorA = getPlayerColor(players[pidA]?.seatIndex ?? 0, players[pidA]?.colorKey).solid
            const colorB = getPlayerColor(players[pidB]?.seatIndex ?? 0, players[pidB]?.colorKey).solid
            const rectA = getSlotRect(panelA, slotA, getSlotCount(players[pidA]?.locks, cardsPerPlayer))
            const rectB = getSlotRect(panelB, slotB, getSlotCount(players[pidB]?.locks, cardsPerPlayer))
            triggerFly(rectA, rectB, false, null, colorA)
            queueFly(rectB, rectA, false, null, colorB)
          }
        }
        setRemoteStaging(null)
        return
      }

      // ─── Only animate draw/take/discard for remote players ───
      if (actorId === localUserId) return

      const targetEl = otherPanelRefs.current[actorId]
      if (!targetEl) return

      const getStagingRect = (): DOMRect => {
        const el = stagingRef.current
        return el ? el.getBoundingClientRect() : targetEl.getBoundingClientRect()
      }

      if (msg.includes('drew from the pile')) {
        setRemoteStaging({ card: null, faceUp: false, ownerColor: actorColor })
        requestAnimationFrame(() => {
          const fromEl = drawPileRef.current
          if (fromEl) {
            triggerFly(fromEl.getBoundingClientRect(), getStagingRect(), false, null, actorColor)
          }
        })
      } else if (msg.includes('took from discard')) {
        if (game?.turnPhase !== 'action') {
          setRemoteStaging(null)
          return
        }
        const takenCard = prevDiscardTopRef.current
        setRemoteStaging({ card: takenCard, faceUp: true, ownerColor: actorColor })
        requestAnimationFrame(() => {
          const fromEl = discardPileRef.current
          if (fromEl) {
            triggerFly(fromEl.getBoundingClientRect(), getStagingRect(), true, takenCard, actorColor)
          }
        })
      } else if (msg.includes('discarded') || msg.includes('swapped their card')) {
        const fromEl = stagingRef.current ?? otherPanelRefs.current[actorId]
        if (msg.includes('swapped their card')) {
          const slotMatch = msg.match(/swapped their card #(\d)/)
          const slotIdx = slotMatch ? parseInt(slotMatch[1]) - 1 : 0
          const actorPanel = otherPanelRefs.current[actorId]
          const toEl = discardPileRef.current

          if (fromEl && actorPanel) {
            const slotRect = getSlotRect(actorPanel, slotIdx, getSlotCount(players[actorId]?.locks, cardsPerPlayer))
            triggerFly(fromEl.getBoundingClientRect(), slotRect, false, null, actorColor)
          }
          if (actorPanel && toEl) {
            const slotRect = getSlotRect(actorPanel, slotIdx, getSlotCount(players[actorId]?.locks, cardsPerPlayer))
            queueFly(slotRect, toEl.getBoundingClientRect(), true, game?.discardTop ?? null, actorColor)
          }
        } else {
          const toEl = discardPileRef.current
          if (fromEl && toEl) {
            triggerFly(fromEl.getBoundingClientRect(), toEl.getBoundingClientRect(), true, game?.discardTop ?? null, actorColor)
          }
        }
        setRemoteStaging(null)
      }
    }) // end requestAnimationFrame
    return () => cancelAnimationFrame(rafId)
  }, [game?.actionVersion, game?.log, players, localUserId, reduced, triggerFly, queueFly, game?.discardTop, game?.turnPhase, cardsPerPlayer,
    drawPileRef, discardPileRef, stagingRef, localPanelRef, otherPanelRefs, setRemoteStaging])

  // Track previous discardTop for remote staging visuals
  useEffect(() => {
    if (game?.discardTop) prevDiscardTopRef.current = game.discardTop
  }, [game?.discardTop])

  // Clear remote staging when turn changes back to draw phase
  useEffect(() => {
    if (game?.turnPhase === 'draw') setRemoteStaging(null)
  }, [game?.turnPhase, setRemoteStaging])
}
