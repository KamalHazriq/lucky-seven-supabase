import type { LogEntry, PlayerDoc } from './types'
import type { GameActionEvent } from './logEvents'
import { isGameActionEvent } from './logEvents'

export interface ResolvedPlayerRef {
  playerId: string
  displayName: string
  seatIndex: number
  colorKey?: number
}

export interface ResolvedSlotTarget extends ResolvedPlayerRef {
  slotIndex: number
}

export type ParsedGameAction =
  | { kind: 'draw_pile'; actor: ResolvedPlayerRef; message: string }
  | { kind: 'take_discard'; actor: ResolvedPlayerRef; message: string }
  | { kind: 'cancel_draw'; actor: ResolvedPlayerRef; message: string }
  | { kind: 'swap_slot'; actor: ResolvedPlayerRef; slotIndex: number; message: string }
  | { kind: 'discard_drawn'; actor: ResolvedPlayerRef; message: string }
  | { kind: 'power_swap'; actor: ResolvedPlayerRef; first: ResolvedSlotTarget; second: ResolvedSlotTarget; message: string }
  | { kind: 'power_lock'; actor: ResolvedPlayerRef; target: ResolvedSlotTarget; message: string }
  | { kind: 'power_unlock'; actor: ResolvedPlayerRef; target: ResolvedSlotTarget | null; fizzled: boolean; message: string }
  | { kind: 'power_rearrange'; actor: ResolvedPlayerRef; target: ResolvedPlayerRef | null; message: string }
  | { kind: 'power_peek'; actor: ResolvedPlayerRef; variant: 'self_one' | 'self_all' | 'opponent_one' | 'opponent_all'; message: string }
  | { kind: 'call_end'; actor: ResolvedPlayerRef; message: string }
  | { kind: 'player_kicked'; playerName: string | null; reason: 'kick' | 'afk'; message: string }
  | { kind: 'player_left'; playerName: string | null; message: string }

function resolvePlayerById(playerId: string, players: Record<string, PlayerDoc>): ResolvedPlayerRef | null {
  const player = players[playerId]
  if (!player) return null
  return {
    playerId,
    displayName: player.displayName,
    seatIndex: player.seatIndex,
    colorKey: player.colorKey,
  }
}

function resolvePlayerByName(name: string, players: Record<string, PlayerDoc>): ResolvedPlayerRef | null {
  for (const [playerId, player] of Object.entries(players)) {
    if (player.displayName === name) {
      return {
        playerId,
        displayName: player.displayName,
        seatIndex: player.seatIndex,
        colorKey: player.colorKey,
      }
    }
  }
  return null
}

function resolveActorFromMessage(message: string, players: Record<string, PlayerDoc>): ResolvedPlayerRef | null {
  let best: ResolvedPlayerRef | null = null

  for (const [playerId, player] of Object.entries(players)) {
    if (!message.startsWith(player.displayName)) continue
    if (best && best.displayName.length >= player.displayName.length) continue
    best = {
      playerId,
      displayName: player.displayName,
      seatIndex: player.seatIndex,
      colorKey: player.colorKey,
    }
  }

  return best
}

function resolveTarget(name: string, slotIndex: number, players: Record<string, PlayerDoc>): ResolvedSlotTarget | null {
  const player = resolvePlayerByName(name, players)
  return player ? { ...player, slotIndex } : null
}

const SWAP_CONNECTOR = '(?:<->|\\u2194|â†”|Ã¢â€ â€)'

function parseStructuredGameAction(
  event: GameActionEvent,
  message: string,
  players: Record<string, PlayerDoc>,
): ParsedGameAction | null {
  switch (event.kind) {
    case 'draw_pile': {
      const actor = resolvePlayerById(event.actorId, players)
      return actor ? { kind: 'draw_pile', actor, message } : null
    }
    case 'take_discard': {
      const actor = resolvePlayerById(event.actorId, players)
      return actor ? { kind: 'take_discard', actor, message } : null
    }
    case 'cancel_draw': {
      const actor = resolvePlayerById(event.actorId, players)
      return actor ? { kind: 'cancel_draw', actor, message } : null
    }
    case 'swap_slot': {
      const actor = resolvePlayerById(event.actorId, players)
      return actor ? { kind: 'swap_slot', actor, slotIndex: event.slotIndex, message } : null
    }
    case 'discard_drawn': {
      const actor = resolvePlayerById(event.actorId, players)
      return actor ? { kind: 'discard_drawn', actor, message } : null
    }
    case 'power_swap': {
      const actor = resolvePlayerById(event.actorId, players)
      const first = resolvePlayerById(event.first.playerId, players)
      const second = resolvePlayerById(event.second.playerId, players)
      if (!actor || !first || !second) return null
      return {
        kind: 'power_swap',
        actor,
        first: { ...first, slotIndex: event.first.slotIndex },
        second: { ...second, slotIndex: event.second.slotIndex },
        message,
      }
    }
    case 'power_lock': {
      const actor = resolvePlayerById(event.actorId, players)
      const target = resolvePlayerById(event.target.playerId, players)
      if (!actor || !target) return null
      return { kind: 'power_lock', actor, target: { ...target, slotIndex: event.target.slotIndex }, message }
    }
    case 'power_unlock': {
      const actor = resolvePlayerById(event.actorId, players)
      const target = event.target ? resolvePlayerById(event.target.playerId, players) : null
      if (!actor) return null
      return {
        kind: 'power_unlock',
        actor,
        target: target && event.target ? { ...target, slotIndex: event.target.slotIndex } : null,
        fizzled: event.fizzled,
        message,
      }
    }
    case 'power_rearrange': {
      const actor = resolvePlayerById(event.actorId, players)
      const target = event.targetPlayerId ? resolvePlayerById(event.targetPlayerId, players) : null
      return actor ? { kind: 'power_rearrange', actor, target, message } : null
    }
    case 'power_peek': {
      const actor = resolvePlayerById(event.actorId, players)
      return actor ? { kind: 'power_peek', actor, variant: event.variant, message } : null
    }
    case 'call_end': {
      const actor = resolvePlayerById(event.actorId, players)
      return actor ? { kind: 'call_end', actor, message } : null
    }
    case 'player_kicked': {
      const player = resolvePlayerById(event.playerId, players)
      return { kind: 'player_kicked', playerName: player?.displayName ?? null, reason: event.reason, message }
    }
    case 'player_left': {
      const player = resolvePlayerById(event.playerId, players)
      return { kind: 'player_left', playerName: player?.displayName ?? null, message }
    }
    default:
      return null
  }
}

export function parseGameAction(entry: LogEntry | null | undefined, players: Record<string, PlayerDoc>): ParsedGameAction | null {
  if (!entry) return null

  if (isGameActionEvent(entry.event)) {
    const parsed = parseStructuredGameAction(entry.event, entry.msg, players)
    if (parsed) return parsed
  }

  const message = entry.msg
  const actor = resolveActorFromMessage(message, players)

  if (actor && message.includes('drew from the pile')) {
    return { kind: 'draw_pile', actor, message }
  }

  if (actor && message.includes('took from discard')) {
    return { kind: 'take_discard', actor, message }
  }

  if (actor && message.includes('returned the card to discard')) {
    return { kind: 'cancel_draw', actor, message }
  }

  const swapSlotMatch = actor ? message.match(/swapped their card #(\d+)/i) : null
  if (actor && swapSlotMatch) {
    return {
      kind: 'swap_slot',
      actor,
      slotIndex: parseInt(swapSlotMatch[1], 10) - 1,
      message,
    }
  }

  if (actor && /\bdiscarded\b/i.test(message)) {
    return { kind: 'discard_drawn', actor, message }
  }

  const powerSwapMatch = actor
    ? message.match(new RegExp(`as swap:\\s*(.+?)'s #(\\d+)\\s*${SWAP_CONNECTOR}\\s*(.+?)'s #(\\d+)`, 'i'))
    : null
  if (actor && powerSwapMatch) {
    const first = resolveTarget(powerSwapMatch[1], parseInt(powerSwapMatch[2], 10) - 1, players)
    const second = resolveTarget(powerSwapMatch[3], parseInt(powerSwapMatch[4], 10) - 1, players)
    if (first && second) {
      return { kind: 'power_swap', actor, first, second, message }
    }
  }

  const lockMatch = actor ? message.match(/as lock on (their own|.+?'s) card #(\d+)/i) : null
  if (actor && lockMatch) {
    const slotIndex = parseInt(lockMatch[2], 10) - 1
    const target = lockMatch[1] === 'their own'
      ? resolvePlayerById(actor.playerId, players)
      : resolvePlayerByName(lockMatch[1].replace(/'s$/, ''), players)
    if (target) {
      return { kind: 'power_lock', actor, target: { ...target, slotIndex }, message }
    }
  }

  const unlockFizzled = actor && /as unlock but no card was locked/i.test(message)
  if (actor && unlockFizzled) {
    return { kind: 'power_unlock', actor, target: null, fizzled: true, message }
  }

  const unlockMatch = actor ? message.match(/as unlock on (their own|.+?'s) card #(\d+)/i) : null
  if (actor && unlockMatch) {
    const slotIndex = parseInt(unlockMatch[2], 10) - 1
    const target = unlockMatch[1] === 'their own'
      ? resolvePlayerById(actor.playerId, players)
      : resolvePlayerByName(unlockMatch[1].replace(/'s$/, ''), players)
    if (target) {
      return {
        kind: 'power_unlock',
        actor,
        target: { ...target, slotIndex },
        fizzled: false,
        message,
      }
    }
  }

  const rearrangeMatch = actor ? message.match(/as rearrange on (.+?)'s cards!?/i) : null
  if (actor && rearrangeMatch) {
    return {
      kind: 'power_rearrange',
      actor,
      target: resolvePlayerByName(rearrangeMatch[1], players),
      message,
    }
  }

  if (actor && /as peek_all_opponent/i.test(message)) {
    return { kind: 'power_peek', actor, variant: 'opponent_all', message }
  }

  if (actor && /as peek_opponent/i.test(message)) {
    return { kind: 'power_peek', actor, variant: 'opponent_one', message }
  }

  if (actor && /as peek_all/i.test(message)) {
    return { kind: 'power_peek', actor, variant: 'self_all', message }
  }

  if (actor && /as peek_one/i.test(message)) {
    return { kind: 'power_peek', actor, variant: 'self_one', message }
  }

  if (actor && /called END/i.test(message)) {
    return { kind: 'call_end', actor, message }
  }

  const afkKickMatch = message.match(/(.+?) was AFK-kicked/i)
  if (afkKickMatch) {
    return { kind: 'player_kicked', playerName: afkKickMatch[1], reason: 'afk', message }
  }

  const kickMatch = message.match(/(.+?) was kicked/i)
  if (kickMatch) {
    return { kind: 'player_kicked', playerName: kickMatch[1], reason: 'kick', message }
  }

  const leaveMatch = message.match(/(.+?) left the game/i)
  if (leaveMatch) {
    return { kind: 'player_left', playerName: leaveMatch[1], message }
  }

  return null
}
