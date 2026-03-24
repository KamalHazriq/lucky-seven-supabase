import { useEffect, useRef, useMemo, memo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { LogEntry, PlayerDoc } from '../lib/types'
import { renderLogMessage } from '../lib/logRenderer'
import type { LogPosition } from '../hooks/useLogPosition'

interface GameLogProps {
  log: LogEntry[]
  players: Record<string, PlayerDoc>
  /** Display mode — 'bottom' (default) or 'left' (sidebar) */
  position?: LogPosition
}

function formatTimestamp(ts: number): string {
  const d = new Date(ts)
  const h = d.getHours().toString().padStart(2, '0')
  const m = d.getMinutes().toString().padStart(2, '0')
  return `${h}:${m}`
}

function GameLog({ log, players, position = 'bottom' }: GameLogProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  const lastLogKey = log.length > 0 ? `${log[log.length - 1].ts}-${log[log.length - 1].msg.slice(0, 24)}` : ''

  useEffect(() => {
    if (document.hidden) return
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [lastLogKey])

  const playerInfos = useMemo(
    () =>
      Object.entries(players).map(([playerId, player]) => ({
        playerId,
        displayName: player.displayName,
        seatIndex: player.seatIndex,
        colorKey: player.colorKey,
      })),
    [players],
  )

  const isLeft = position === 'left'
  // Show all available entries (server now keeps up to 100)
  const entries = log.slice(-100)
  const totalEntries = entries.length

  return (
    <div
      className={`rounded-xl border flex flex-col overflow-hidden ${isLeft ? 'h-full' : 'max-h-40 sm:max-h-48'}`}
      style={{ background: 'var(--panel)', borderColor: 'var(--border)' }}
    >
      {/* Sticky header */}
      <div
        className="shrink-0 px-3 py-1.5 flex items-center gap-2 border-b"
        style={{ background: 'var(--panel)', borderColor: 'var(--border)' }}
      >
        <h3 className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-dim)' }}>
          Game Log
        </h3>
        <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
        <span className="text-[9px] font-mono" style={{ color: 'var(--text-dim)' }}>{totalEntries}</span>
      </div>

      {/* Scrollable entries */}
      <div ref={scrollRef} className={`overflow-y-auto flex-1 ${isLeft ? 'p-2' : 'p-2'}`}>
        <div className="flex flex-col">
          <AnimatePresence initial={false}>
            {entries.map((entry, i) => {
              const key = `${entry.ts}-${entry.msg.slice(0, 24)}`
              const recency = totalEntries - i
              const opacity = recency <= 3 ? 1 : recency <= 8 ? 0.75 : 0.5
              const isNewest = recency <= 1

              return (
                <motion.div
                  key={key}
                  initial={{ x: -6, scale: 0.98 }}
                  animate={{ x: 0, scale: 1 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 30, mass: 0.4 }}
                  style={{
                    opacity,
                    transition: 'opacity 0.4s ease',
                    ...(isNewest ? { background: 'var(--surface, rgba(30,41,59,0.2))' } : {}),
                  }}
                  className="flex items-start gap-1.5 min-h-[22px] px-1.5 py-0.5 rounded-md"
                >
                  <span
                    className="text-[9px] font-mono shrink-0 mt-px"
                    style={{ color: 'var(--text-dim)', opacity: 0.6 }}
                  >
                    {formatTimestamp(entry.ts)}
                  </span>
                  <div className="flex-1 min-w-0 text-[11px] leading-snug flex flex-wrap items-center gap-0.5" style={{ color: 'var(--text-muted)' }}>
                    {renderLogMessage(entry, playerInfos)}
                  </div>
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}

export default memo(GameLog)
