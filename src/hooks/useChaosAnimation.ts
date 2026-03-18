import { useCallback, useEffect, useRef, useState } from 'react'
import type { LogEntry, PlayerDoc } from '../lib/types'
import { playSfx } from '../lib/sfx'

/**
 * Detects chaos/rearrange power usage and returns a map of player IDs
 * whose panels should play the shuffle animation.
 *
 * Watches actionVersion bumps and parses the latest log entry for:
 *   "{name} used (card) as rearrange on {targetName}'s cards!"
 */
export function useChaosAnimation(
  actionVersion: number,
  log: LogEntry[],
  players: Record<string, PlayerDoc>,
): Record<string, boolean> {
  const prevVersion = useRef(actionVersion)
  const [animating, setAnimating] = useState<Record<string, boolean>>({})
  const startAnimation = useCallback((targetId: string) => {
    playSfx('shuffle')
    setAnimating((prev) => ({ ...prev, [targetId]: true }))
  }, [])
  const finishAnimation = useCallback((targetId: string) => {
    setAnimating((prev) => {
      const next = { ...prev }
      delete next[targetId]
      return next
    })
  }, [])

  useEffect(() => {
    if (actionVersion === prevVersion.current) return
    prevVersion.current = actionVersion

    const lastEntry = log[log.length - 1]
    if (!lastEntry) return
    const msg = lastEntry.msg

    // Match rearrange log pattern
    if (!/as rearrange/i.test(msg)) return

    // Extract target name: "... rearrange on {name}'s cards!"
    const targetMatch = msg.match(/rearrange on (.+?)['']s cards/i)
    if (!targetMatch) return
    const targetName = targetMatch[1]

    // Find the target player ID by display name
    let targetId: string | null = null
    for (const [pid, pd] of Object.entries(players)) {
      if (pd.displayName === targetName) {
        targetId = pid
        break
      }
    }
    if (!targetId) return

    // Trigger animation + sound
    startAnimation(targetId)

    // Clear after animation duration (~900ms)
    const timer = setTimeout(() => {
      finishAnimation(targetId)
    }, 950)

    return () => clearTimeout(timer)
  }, [actionVersion, log, players, startAnimation, finishAnimation])

  return animating
}
