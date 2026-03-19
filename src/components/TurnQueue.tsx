import { memo } from 'react'
import { motion } from 'framer-motion'
import type { PlayerDoc } from '../lib/types'
import { getPlayerColor } from '../lib/playerColors'

interface TurnQueueProps {
  playerOrder: string[]
  players: Record<string, PlayerDoc>
  currentTurnPlayerId: string | null
  localPlayerId: string
  /** Compact mode for top bar — smaller text, no wrap, horizontal scroll */
  compact?: boolean
}

function TurnQueue({
  playerOrder,
  players,
  currentTurnPlayerId,
  localPlayerId,
  compact = false,
}: TurnQueueProps) {
  if (!currentTurnPlayerId || playerOrder.length < 2) return null

  const currentIdx = playerOrder.indexOf(currentTurnPlayerId)
  if (currentIdx === -1) return null

  // Build queue: current player + next players
  const maxShow = compact ? Math.min(playerOrder.length, 5) : Math.min(playerOrder.length, 4)
  const queue: { pid: string; queueNum: number }[] = []
  for (let i = 0; i < maxShow; i++) {
    const idx = (currentIdx + i) % playerOrder.length
    queue.push({ pid: playerOrder[idx], queueNum: i + 1 })
  }

  /* ─── Compact: top-bar inline strip ─── */
  if (compact) {
    return (
      <div className="flex items-center gap-1 overflow-hidden max-w-full">
        {queue.map(({ pid, queueNum }, i) => {
          const pd = players[pid]
          if (!pd) return null
          const color = getPlayerColor(pd.seatIndex, pd.colorKey)
          const isCurrent = queueNum === 1
          const isLocal = pid === localPlayerId
          const name = pd.displayName.length > 8
            ? pd.displayName.slice(0, 7) + '…'
            : pd.displayName

          return (
            <span key={pid} className="flex items-center gap-0.5 shrink-0">
              {i > 0 && (
                <span className="text-muted-foreground/40 text-[9px] mx-0.5">›</span>
              )}
              <span
                className={`
                  inline-flex items-center gap-0.5 px-1.5 py-px rounded-full text-[10px] font-semibold whitespace-nowrap
                  ${isCurrent ? 'ring-1 ring-white/20' : 'opacity-60'}
                `}
                style={{
                  backgroundColor: isCurrent ? color.bg : 'rgba(100,116,139,0.12)',
                  color: color.text,
                }}
              >
                <span
                  className="w-1 h-1 rounded-full shrink-0"
                  style={{ backgroundColor: color.solid }}
                />
                {name}
                {isLocal && (
                  <span className="text-amber-300 text-[8px] font-bold">(you)</span>
                )}
                {isCurrent && (
                  <motion.span
                    animate={{ opacity: [1, 0.4, 1] }}
                    transition={{ duration: 1.2, repeat: Infinity }}
                    className="text-[8px]"
                  >
                    ▶
                  </motion.span>
                )}
              </span>
            </span>
          )
        })}
      </div>
    )
  }

  /* ─── Full: below-header turn queue ─── */
  return (
    <div className="flex items-center gap-1.5 justify-center flex-wrap mb-3">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mr-1">
        Turn
      </span>
      {queue.map(({ pid, queueNum }, i) => {
        const pd = players[pid]
        if (!pd) return null
        const color = getPlayerColor(pd.seatIndex, pd.colorKey)
        const isCurrent = queueNum === 1
        const isLocal = pid === localPlayerId
        const name = pd.displayName.length > 10
          ? pd.displayName.slice(0, 9) + '…'
          : pd.displayName

        return (
          <span key={pid} className="flex items-center gap-1">
            {i > 0 && (
              <span className="text-muted-foreground/40 text-[10px]">›</span>
            )}
            <motion.span
              initial={isCurrent ? { scale: 0.9, opacity: 0 } : false}
              animate={{ scale: 1, opacity: isCurrent ? 1 : 0.7 }}
              className={`
                inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold
                ${isCurrent ? 'ring-1 ring-white/20 shadow-sm' : ''}
              `}
              style={{
                backgroundColor: isCurrent ? color.bg : 'rgba(100,116,139,0.15)',
                color: color.text,
                ...(isCurrent ? { boxShadow: `0 0 8px ${color.tinted}` } : {}),
              }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ backgroundColor: color.solid }}
              />
              <span className="truncate max-w-[72px]">
                {name}
              </span>
              {isLocal && (
                <span className="text-amber-300 text-[9px] font-bold">
                  (you)
                </span>
              )}
              {isCurrent && (
                <motion.span
                  animate={{ opacity: [1, 0.4, 1] }}
                  transition={{ duration: 1.2, repeat: Infinity }}
                  className="text-[9px]"
                >
                  ▶
                </motion.span>
              )}
            </motion.span>
          </span>
        )
      })}
    </div>
  )
}

export default memo(TurnQueue)
