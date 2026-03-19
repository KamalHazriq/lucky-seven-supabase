import { useState, useEffect, useRef } from 'react'
import type { LogEntry, PlayerDoc } from '../lib/types'
import { getSeatColor } from '../lib/playerColors'
import { parseGameAction } from '../lib/gameActionEvents'

export interface ActionHighlightInfo {
  color: string
  label: string
}

export type SlotOverlayMap = Record<string, Record<number, string>>
export type SwapLabelMap = Record<string, Record<number, string>>

type HighlightMap = Record<string, ActionHighlightInfo | null>

export function useActionHighlight(
  actionVersion: number,
  log: LogEntry[],
  players: Record<string, PlayerDoc>,
): { highlights: HighlightMap; slotOverlays: SlotOverlayMap; swapLabels: SwapLabelMap } {
  const [highlights, setHighlights] = useState<HighlightMap>({})
  const [slotOverlays, setSlotOverlays] = useState<SlotOverlayMap>({})
  const [swapLabels, setSwapLabels] = useState<SwapLabelMap>({})
  const prevVersion = useRef(actionVersion)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (actionVersion === prevVersion.current) return
    prevVersion.current = actionVersion
    if (document.hidden) return

    const event = parseGameAction(log[log.length - 1], players)
    if (!event || !('actor' in event)) return

    const color = getSeatColor(event.actor.seatIndex)
    const highlightColor = color.solid

    let label = 'acted'
    const newSlotOverlays: SlotOverlayMap = {}
    const newSwapLabels: SwapLabelMap = {}

    switch (event.kind) {
      case 'draw_pile':
        label = 'drew'
        break
      case 'take_discard':
        label = 'took discard'
        break
      case 'swap_slot':
        label = 'swapped'
        newSlotOverlays[event.actor.playerId] = { [event.slotIndex]: highlightColor }
        break
      case 'discard_drawn':
        label = 'discarded'
        break
      case 'power_swap':
        label = 'swapped'
        newSlotOverlays[event.first.playerId] = { [event.first.slotIndex]: highlightColor }
        newSlotOverlays[event.second.playerId] = { [event.second.slotIndex]: highlightColor }
        newSwapLabels[event.first.playerId] = {
          [event.first.slotIndex]: `\u2194 ${event.second.displayName} #${event.second.slotIndex + 1}`,
        }
        newSwapLabels[event.second.playerId] = {
          [event.second.slotIndex]: `\u2194 ${event.first.displayName} #${event.first.slotIndex + 1}`,
        }
        break
      case 'power_lock':
        label = 'locked'
        newSlotOverlays[event.target.playerId] = { [event.target.slotIndex]: highlightColor }
        break
      case 'power_unlock':
        label = 'unlocked'
        if (event.target) {
          newSlotOverlays[event.target.playerId] = { [event.target.slotIndex]: highlightColor }
        }
        break
      case 'power_rearrange': {
        label = 'shuffled'
        const slotCount = event.target ? (players[event.target.playerId]?.locks?.length ?? 3) : 0
        if (event.target) {
          newSlotOverlays[event.target.playerId] = Object.fromEntries(
            Array.from({ length: slotCount }, (_, index) => [index, highlightColor]),
          ) as Record<number, string>
        }
        break
      }
      case 'power_peek':
        label = 'peeked'
        break
      case 'call_end':
        label = 'called END'
        break
      default:
        return
    }

    setHighlights({ [event.actor.playerId]: { color: highlightColor, label } })
    setSlotOverlays(newSlotOverlays)
    setSwapLabels(newSwapLabels)

    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      setHighlights({})
      setSlotOverlays({})
      setSwapLabels({})
    }, 2000)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [actionVersion, log, players])

  return { highlights, slotOverlays, swapLabels }
}
