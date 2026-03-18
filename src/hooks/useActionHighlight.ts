import { useState, useEffect, useRef } from 'react'
import type { LogEntry, PlayerDoc } from '../lib/types'
import { getSeatColor } from '../lib/playerColors'

export interface ActionHighlightInfo {
  color: string
  label: string
}

/** Per-slot overlay: playerId → slotIndex → color */
export type SlotOverlayMap = Record<string, Record<number, string>>

/** Per-slot swap label: playerId → slotIndex → label string (e.g. "Kamal #2") */
export type SwapLabelMap = Record<string, Record<number, string>>

type HighlightMap = Record<string, ActionHighlightInfo | null>

/**
 * Watches actionVersion changes and parses the latest log entry
 * to produce temporary per-player highlights, per-slot overlays,
 * and swap labels that auto-clear.
 *
 * v1.5: Added swapLabels for clear swap visibility (Part 2C).
 */
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
  // Keep stable refs so the effect only re-runs on actionVersion change
  const logRef = useRef(log)
  const playersRef = useRef(players)
  logRef.current = log
  playersRef.current = players

  useEffect(() => {
    if (actionVersion === prevVersion.current) return
    prevVersion.current = actionVersion
    if (document.hidden) return // skip visual overlays when tab is backgrounded

    const log = logRef.current
    const players = playersRef.current

    const lastEntry = log[log.length - 1]
    if (!lastEntry) return

    const msg = lastEntry.msg

    // Find which player is the actor (name appears before the first verb)
    let actorId: string | null = null
    let actorSeat = 0

    for (const [pid, pd] of Object.entries(players)) {
      if (msg.startsWith(pd.displayName)) {
        actorId = pid
        actorSeat = pd.seatIndex
        break
      }
    }

    if (!actorId) return

    // Determine action label from keywords
    let label = 'acted'
    if (msg.includes('drew from the pile')) label = 'drew'
    else if (msg.includes('took from discard')) label = 'took discard'
    else if (msg.includes('swapped their card')) label = 'swapped'
    else if (msg.includes('discarded')) label = 'discarded'
    else if (msg.includes('as swap:')) label = 'swapped'
    else if (msg.includes('as peek')) label = 'peeked'
    else if (msg.includes('as lock')) label = 'locked'
    else if (msg.includes('as unlock')) label = 'unlocked'
    else if (msg.includes('as rearrange')) label = 'shuffled'
    else if (msg.includes('called END')) label = 'called END'

    const color = getSeatColor(actorSeat)

    setHighlights({ [actorId]: { color: color.solid, label } })

    // Parse slot-level overlays from log message
    const newSlotOverlays: SlotOverlayMap = {}
    const newSwapLabels: SwapLabelMap = {}

    // "swapped their card #N" → actor's own slot N-1
    const selfSwapMatch = msg.match(/swapped their card #(\d)/)
    if (selfSwapMatch) {
      const slot = parseInt(selfSwapMatch[1], 10) - 1
      newSlotOverlays[actorId] = { [slot]: color.solid }
    }

    // "as swap: PlayerA's #X ↔ PlayerB's #Y"
    const queenSwapMatch = msg.match(/as swap:\s*(.+)'s #(\d)\s*↔\s*(.+)'s #(\d)/)
    if (queenSwapMatch) {
      const nameA = queenSwapMatch[1]
      const slotA = parseInt(queenSwapMatch[2], 10) - 1
      const nameB = queenSwapMatch[3]
      const slotB = parseInt(queenSwapMatch[4], 10) - 1

      // Find player IDs for both sides
      let pidA: string | null = null
      let pidB: string | null = null
      for (const [pid, pd] of Object.entries(players)) {
        if (pd.displayName === nameA) {
          pidA = pid
          newSlotOverlays[pid] = { ...newSlotOverlays[pid], [slotA]: color.solid }
        }
        if (pd.displayName === nameB) {
          pidB = pid
          newSlotOverlays[pid] = { ...newSlotOverlays[pid], [slotB]: color.solid }
        }
      }

      // Add swap labels: each slot gets a label pointing to its swap partner
      // "Name #N" label shows WHERE the card came FROM (the other side)
      if (pidA) {
        newSwapLabels[pidA] = { [slotA]: `↔ ${nameB} #${slotB + 1}` }
      }
      if (pidB) {
        newSwapLabels[pidB] = { [slotB]: `↔ ${nameA} #${slotA + 1}` }
      }
    }

    // "as lock on TARGET's card #N" or "their own card #N"
    const lockMatch = msg.match(/as lock on (.+?) card #(\d)/)
    if (lockMatch) {
      const targetName = lockMatch[1] === 'their own' ? null : lockMatch[1].replace(/'s$/, '')
      const slot = parseInt(lockMatch[2], 10) - 1
      if (targetName) {
        for (const [pid, pd] of Object.entries(players)) {
          if (pd.displayName === targetName) {
            newSlotOverlays[pid] = { [slot]: color.solid }
          }
        }
      } else {
        newSlotOverlays[actorId] = { [slot]: color.solid }
      }
    }

    // "as unlock on TARGET's card #N" or "their own card #N"
    const unlockMatch = msg.match(/as unlock on (.+?) card #(\d)/)
    if (unlockMatch) {
      const targetName = unlockMatch[1] === 'their own' ? null : unlockMatch[1].replace(/'s$/, '')
      const slot = parseInt(unlockMatch[2], 10) - 1
      if (targetName) {
        for (const [pid, pd] of Object.entries(players)) {
          if (pd.displayName === targetName) {
            newSlotOverlays[pid] = { [slot]: color.solid }
          }
        }
      } else {
        newSlotOverlays[actorId] = { [slot]: color.solid }
      }
    }

    // "as rearrange on PlayerName's cards"
    const rearrangeMatch = msg.match(/as rearrange on (.+?)'s cards/)
    if (rearrangeMatch) {
      const targetName = rearrangeMatch[1]
      for (const [pid, pd] of Object.entries(playersRef.current)) {
        if (pd.displayName === targetName) {
          // Highlight all 3 slots
          newSlotOverlays[pid] = { 0: color.solid, 1: color.solid, 2: color.solid }
        }
      }
    }

    setSlotOverlays(newSlotOverlays)
    setSwapLabels(newSwapLabels)

    // Clear previous timer
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      setHighlights({})
      setSlotOverlays({})
      setSwapLabels({})
    }, 2000)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [actionVersion])

  return { highlights, slotOverlays, swapLabels }
}
