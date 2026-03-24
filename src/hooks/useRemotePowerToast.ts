import { useEffect, useRef } from 'react'
import toast from 'react-hot-toast'
import type { LogEntry, PlayerDoc } from '../lib/types'
import { parseGameAction } from '../lib/gameActionEvents'

function toastForPowerAction(log: LogEntry, players: Record<string, PlayerDoc>) {
  const event = parseGameAction(log, players)
  if (!event || !('actor' in event)) return null

  switch (event.kind) {
    case 'power_swap':
      return {
        icon: '🔀',
        text: `${event.actor.displayName} used SWAP: ${event.first.displayName} #${event.first.slotIndex + 1} ↔ ${event.second.displayName} #${event.second.slotIndex + 1}`,
      }
    case 'power_peek':
      return {
        icon: event.variant === 'self_all' || event.variant === 'opponent_all' ? '👀' : '👁️',
        text: `${event.actor.displayName} used ${event.variant === 'self_all' || event.variant === 'opponent_all' ? 'PEEK ALL' : 'PEEK'}`,
      }
    case 'power_lock':
      return {
        icon: '🔒',
        text: `${event.actor.displayName} used LOCK on ${event.target.displayName} #${event.target.slotIndex + 1}`,
      }
    case 'power_unlock':
      return {
        icon: '🔓',
        text: event.target
          ? `${event.actor.displayName} used UNLOCK on ${event.target.displayName} #${event.target.slotIndex + 1}`
          : `${event.actor.displayName} used UNLOCK but it fizzled`,
      }
    case 'power_rearrange':
      return {
        icon: '🌀',
        text: event.target
          ? `${event.actor.displayName} used CHAOS on ${event.target.displayName}`
          : `${event.actor.displayName} used CHAOS`,
      }
    default:
      return null
  }
}

export function useRemotePowerToast(
  actionVersion: number,
  log: LogEntry[],
  players: Record<string, PlayerDoc>,
  localUserId: string | undefined,
): void {
  const prevVersion = useRef(actionVersion)

  useEffect(() => {
    if (actionVersion === prevVersion.current) return
    prevVersion.current = actionVersion

    const lastEntry = log[log.length - 1]
    if (!lastEntry) return
    const display = toastForPowerAction(lastEntry, players)
    if (!display) return

    const parsed = parseGameAction(lastEntry, players)
    if (!parsed || !('actor' in parsed)) return

    const isLocalActor = parsed.actor.playerId === localUserId

    // Replace actor name with "You" for own actions
    const toastText = isLocalActor
      ? display.text.replace(parsed.actor.displayName, 'You')
      : display.text

    toast(toastText, {
      icon: display.icon,
      duration: 3000,
      style: {
        background: isLocalActor ? 'rgba(20, 83, 45, 0.95)' : 'rgba(30, 41, 59, 0.95)',
        color: '#e2e8f0',
        border: isLocalActor ? '1px solid rgba(34, 197, 94, 0.3)' : '1px solid rgba(100, 116, 139, 0.3)',
        fontSize: '12px',
        fontWeight: '500',
        maxWidth: '320px',
        backdropFilter: 'blur(8px)',
      },
    })
  }, [actionVersion, log, players, localUserId])
}
