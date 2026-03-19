import { useEffect, useRef, type RefObject } from 'react'
import type { GameDoc, PlayerDoc, Card } from '../lib/types'
import { getPlayerColor } from '../lib/playerColors'
import { getSlotCount } from '../lib/slotState'
import { parseGameAction } from '../lib/gameActionEvents'

interface RemoteAnimationDeps {
  game: GameDoc | null
  players: Record<string, PlayerDoc>
  localUserId: string | undefined
  reduced: boolean

  drawPileRef: RefObject<HTMLDivElement | null>
  discardPileRef: RefObject<HTMLDivElement | null>
  stagingRef: RefObject<HTMLDivElement | null>
  localPanelRef: RefObject<HTMLDivElement | null>
  otherPanelRefs: RefObject<Record<string, HTMLDivElement | null>>

  triggerFly: (from: DOMRect, to: DOMRect, faceUp: boolean, card?: Card | null, ownerColor?: string) => void
  queueFly: (from: DOMRect, to: DOMRect, faceUp: boolean, card?: Card | null, ownerColor?: string) => void

  startPileDraw: (from: DOMRect, to: DOMRect, ownerColor?: string) => void
  startDiscardTake: (card: Card, from: DOMRect, to: DOMRect, ownerColor?: string) => void
  startSwapFromStaging: (staging: DOMRect, slot: DOMRect, discard: DOMRect, swapCard: Card | null, ownerColor?: string) => void
  startDiscardAction: (from: DOMRect, to: DOMRect, card: Card | null, faceUp: boolean, ownerColor?: string) => void
}

export function useRemoteAnimations({
  game,
  players,
  localUserId,
  reduced,
  drawPileRef,
  discardPileRef,
  stagingRef,
  localPanelRef,
  otherPanelRefs,
  triggerFly,
  queueFly,
  startPileDraw,
  startDiscardTake,
  startSwapFromStaging,
  startDiscardAction,
}: RemoteAnimationDeps): void {
  const prevActionVersion = useRef(game?.actionVersion ?? 0)
  const prevDiscardTopRef = useRef<Card | null>(game?.discardTop ?? null)
  const cardsPerPlayer = game?.settings?.cardsPerPlayer ?? 3

  useEffect(() => {
    const actionVersion = game?.actionVersion ?? 0
    if (actionVersion === prevActionVersion.current || reduced || document.hidden) {
      prevActionVersion.current = actionVersion
      return
    }
    prevActionVersion.current = actionVersion

    const rafId = requestAnimationFrame(() => {
      const event = parseGameAction(game?.log?.[game.log.length - 1], players)
      if (!event) return

      const getPanelEl = (playerId: string): HTMLDivElement | null => {
        if (playerId === localUserId) return localPanelRef.current
        return otherPanelRefs.current[playerId] ?? null
      }

      const getSlotRect = (panelEl: HTMLDivElement, slotIndex: number, slotCount: number): DOMRect => {
        const slotEl = panelEl.querySelector<HTMLElement>(`[data-slot="${slotIndex}"]`)
        if (slotEl) return slotEl.getBoundingClientRect()

        const panel = panelEl.getBoundingClientRect()
        const segmentWidth = panel.width / Math.max(slotCount, 1)
        return new DOMRect(
          panel.left + segmentWidth * slotIndex + segmentWidth * 0.1,
          panel.top + panel.height * 0.35,
          segmentWidth * 0.8,
          panel.height * 0.6,
        )
      }

      if (event.kind === 'power_swap') {
        const panelA = getPanelEl(event.first.playerId)
        const panelB = getPanelEl(event.second.playerId)
        if (!panelA || !panelB) return

        const rectA = getSlotRect(panelA, event.first.slotIndex, getSlotCount(players[event.first.playerId]?.locks, cardsPerPlayer))
        const rectB = getSlotRect(panelB, event.second.slotIndex, getSlotCount(players[event.second.playerId]?.locks, cardsPerPlayer))
        const colorA = getPlayerColor(event.first.seatIndex, event.first.colorKey).solid
        const colorB = getPlayerColor(event.second.seatIndex, event.second.colorKey).solid

        triggerFly(rectA, rectB, false, null, colorA)
        queueFly(rectB, rectA, false, null, colorB)
        return
      }

      if (!('actor' in event) || event.actor.playerId === localUserId) return

      const actorPanel = otherPanelRefs.current[event.actor.playerId]
      const actorColor = getPlayerColor(event.actor.seatIndex, event.actor.colorKey).solid
      const stagingRect = stagingRef.current?.getBoundingClientRect() ?? actorPanel?.getBoundingClientRect()
      const discardRect = discardPileRef.current?.getBoundingClientRect()
      const drawRect = drawPileRef.current?.getBoundingClientRect()

      switch (event.kind) {
        case 'draw_pile':
          if (drawRect && stagingRect) {
            startPileDraw(drawRect, stagingRect, actorColor)
          }
          break
        case 'take_discard':
          if (!stagingRect || !discardRect || !prevDiscardTopRef.current) return
          startDiscardTake(prevDiscardTopRef.current, discardRect, stagingRect, actorColor)
          break
        case 'swap_slot':
          if (!actorPanel || !stagingRect || !discardRect) return
          startSwapFromStaging(
            stagingRect,
            getSlotRect(actorPanel, event.slotIndex, getSlotCount(players[event.actor.playerId]?.locks, cardsPerPlayer)),
            discardRect,
            game?.discardTop ?? null,
            actorColor,
          )
          break
        case 'discard_drawn':
          if (!discardRect) return
          if (stagingRect) {
            startDiscardAction(stagingRect, discardRect, game?.discardTop ?? null, true, actorColor)
          } else if (actorPanel) {
            startDiscardAction(actorPanel.getBoundingClientRect(), discardRect, game?.discardTop ?? null, true, actorColor)
          }
          break
      }
    })

    return () => cancelAnimationFrame(rafId)
  }, [
    game,
    players,
    localUserId,
    reduced,
    cardsPerPlayer,
    drawPileRef,
    discardPileRef,
    stagingRef,
    localPanelRef,
    otherPanelRefs,
    triggerFly,
    queueFly,
    startPileDraw,
    startDiscardTake,
    startSwapFromStaging,
    startDiscardAction,
  ])

  useEffect(() => {
    if (game?.discardTop) prevDiscardTopRef.current = game.discardTop
  }, [game?.discardTop])
}
