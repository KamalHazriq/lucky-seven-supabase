import { useEffect, useRef } from 'react'
import type { LogEntry, PlayerDoc } from '../lib/types'
import { isSfxEnabled, SFX } from '../lib/sfx'
import { parseGameAction } from '../lib/gameActionEvents'

export function useRemoteSfx(
  actionVersion: number,
  log: LogEntry[],
  players: Record<string, PlayerDoc>,
  localUserId: string | undefined,
): void {
  const prevVersion = useRef(actionVersion)

  useEffect(() => {
    if (actionVersion === prevVersion.current) return
    prevVersion.current = actionVersion

    if (!isSfxEnabled()) return

    const event = parseGameAction(log[log.length - 1], players)
    if (!event) return

    if (event.kind === 'player_kicked' || event.kind === 'player_left') {
      SFX.kick()
      return
    }

    if (!('actor' in event) || event.actor.playerId === localUserId) return

    switch (event.kind) {
      case 'draw_pile':
        SFX.draw()
        break
      case 'take_discard':
        SFX.take()
        break
      case 'discard_drawn':
        SFX.discard()
        break
      case 'swap_slot':
      case 'power_swap':
        SFX.swap()
        break
      case 'power_peek':
        if (event.variant === 'self_all' || event.variant === 'opponent_all') SFX.peekAll()
        else SFX.peek()
        break
      case 'power_lock':
        SFX.lock()
        break
      case 'power_unlock':
        SFX.unlock()
        break
      case 'power_rearrange':
        SFX.shuffle()
        break
    }
  }, [actionVersion, log, players, localUserId])
}
