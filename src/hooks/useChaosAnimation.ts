import { useCallback, useEffect, useRef, useState } from 'react'
import type { LogEntry, PlayerDoc } from '../lib/types'
import { playSfx } from '../lib/sfx'
import { parseGameAction } from '../lib/gameActionEvents'

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

    const event = parseGameAction(log[log.length - 1], players)
    if (event?.kind !== 'power_rearrange' || !event.target) return

    const targetId = event.target.playerId
    startAnimation(targetId)

    const timer = setTimeout(() => {
      finishAnimation(targetId)
    }, 950)

    return () => clearTimeout(timer)
  }, [actionVersion, finishAnimation, log, players, startAnimation])

  return animating
}
