import { motion } from 'framer-motion'
import TurnQueue from './TurnQueue'
import type { PlayerDoc } from '../lib/types'

interface GameTopBarProps {
  gameJoinCode: string
  drawPileCount: number
  isSpectator: boolean
  isDevMode: boolean
  unreadCount: number
  playerOrder: string[]
  players: Record<string, PlayerDoc>
  currentTurnPlayerId: string | null
  localPlayerId: string
  onCopyCode: () => void
  onOpenMonitor: () => void
  onOpenSettings: () => void
  onOpenPowerGuide: () => void
  onToggleChat: () => void
}

export default function GameTopBar({
  gameJoinCode,
  drawPileCount,
  isSpectator,
  isDevMode,
  unreadCount,
  playerOrder,
  players,
  currentTurnPlayerId,
  localPlayerId,
  onCopyCode,
  onOpenMonitor,
  onOpenSettings,
  onOpenPowerGuide,
  onToggleChat,
}: GameTopBarProps) {
  return (
    <div
      className="sticky top-0 z-50 w-full backdrop-blur-lg border-b"
      style={{
        paddingTop: 'env(safe-area-inset-top, 0px)',
        background: 'color-mix(in srgb, var(--surface-solid) 90%, transparent)',
        borderColor: 'var(--border)',
      }}
    >
      <div className="mx-auto flex max-w-6xl flex-col px-3 py-2 md:px-5 xl:max-w-7xl">
        <div className="flex flex-wrap items-start gap-2 md:min-h-[52px] md:flex-nowrap md:items-center md:gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-1.5 sm:gap-2">
            <h1 className="hidden whitespace-nowrap text-base leading-none font-bold text-amber-300 sm:block">Lucky Seven™</h1>
            <h1 className="whitespace-nowrap text-base leading-none font-bold text-amber-300 sm:hidden">L7</h1>
            <button
              onClick={onCopyCode}
              className="group relative flex min-w-0 items-center gap-1.5 rounded-lg border px-2 py-1 transition-colors hover:border-emerald-500/40 cursor-pointer"
              style={{ background: 'var(--panel)', borderColor: 'var(--border)' }}
              aria-label={`Copy room code ${gameJoinCode}`}
              title="Click to copy room code"
            >
              <span className="min-w-0 text-[10px] font-mono font-bold tracking-[0.24em] text-emerald-400 sm:text-[11px]">
                {gameJoinCode}
              </span>
              <svg className="h-3 w-3 text-slate-500 transition-colors group-hover:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              <span className="toolbar-tooltip">Copy Code</span>
            </button>
            <div className="hidden items-center gap-2 md:flex">
              <span className="text-[10px] font-medium whitespace-nowrap" style={{ color: 'var(--text-dim)' }}>
                {drawPileCount} left
              </span>
              {drawPileCount <= 3 && drawPileCount > 0 && (
                <span className="rounded-md border border-amber-600/50 bg-amber-900/40 px-1.5 py-0.5 text-[9px] font-bold whitespace-nowrap text-amber-300 animate-pulse">
                  FINAL
                </span>
              )}
              {drawPileCount === 0 && (
                <span className="rounded-md border border-red-600/50 bg-red-900/40 px-1.5 py-0.5 text-[9px] font-bold whitespace-nowrap text-red-300 animate-pulse">
                  LAST TURN
                </span>
              )}
            </div>
          </div>

          <div className="hidden min-w-0 flex-1 justify-center md:flex">
            <TurnQueue
              playerOrder={playerOrder}
              players={players}
              currentTurnPlayerId={currentTurnPlayerId}
              localPlayerId={localPlayerId}
              compact
            />
          </div>

          <div className="flex shrink-0 items-center gap-1 self-start sm:gap-1.5 md:self-auto">
            {isSpectator && (
              <span className="hidden rounded-md border border-violet-500/40 bg-violet-900/40 px-2 py-0.5 text-[10px] font-bold text-violet-300 md:inline-flex">
                SPECTATING
              </span>
            )}
            {isDevMode && (
              <motion.button
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.92 }}
                transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                onClick={onOpenMonitor}
                className="topbar-btn group relative bg-emerald-900/25 border-emerald-600/30 text-emerald-400 hover:bg-emerald-900/40"
                aria-label="Game Monitor"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="3" width="20" height="14" rx="2" />
                  <line x1="8" y1="21" x2="16" y2="21" />
                  <line x1="12" y1="17" x2="12" y2="21" />
                </svg>
                <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="toolbar-tooltip">Game Monitor</span>
              </motion.button>
            )}

            <motion.button
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.92 }}
              transition={{ type: 'spring', stiffness: 400, damping: 20 }}
              onClick={onOpenSettings}
              className="topbar-btn group relative"
              aria-label="Open settings"
            >
              {'\u2699\uFE0F'}
              <span className="toolbar-tooltip">Settings</span>
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.92 }}
              transition={{ type: 'spring', stiffness: 400, damping: 20 }}
              onClick={onOpenPowerGuide}
              className="topbar-btn group relative bg-amber-900/30 border-amber-600/40 text-amber-400 hover:bg-amber-900/50"
              aria-label="Power guide — view card power instructions"
            >
              ?
              <span className="toolbar-tooltip">Powers</span>
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.92 }}
              transition={{ type: 'spring', stiffness: 400, damping: 20 }}
              onClick={onToggleChat}
              className="topbar-btn group relative bg-indigo-900/30 border-indigo-600/40 text-indigo-400 hover:bg-indigo-900/50"
              aria-label="Open chat"
            >
              {'\u{1F4AC}'}
              {unreadCount > 0 && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 20 }}
                  className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white"
                >
                  {unreadCount > 9 ? '9+' : unreadCount}
                </motion.span>
              )}
              <span className="toolbar-tooltip">Chat</span>
            </motion.button>
          </div>
        </div>

        <div className="mt-2 flex items-center gap-2 overflow-x-auto pb-0.5 md:hidden">
          <span
            className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-1 text-[10px] font-semibold"
            style={{ background: 'var(--panel)', borderColor: 'var(--border)', color: 'var(--text-dim)' }}
          >
            <span className="font-mono text-[11px] text-emerald-400">{drawPileCount}</span>
            left
          </span>
          {drawPileCount <= 3 && drawPileCount > 0 && (
            <span className="whitespace-nowrap rounded-full border border-amber-600/50 bg-amber-900/40 px-2 py-1 text-[10px] font-bold text-amber-300 animate-pulse">
              FINAL
            </span>
          )}
          {drawPileCount === 0 && (
            <span className="whitespace-nowrap rounded-full border border-red-600/50 bg-red-900/40 px-2 py-1 text-[10px] font-bold text-red-300 animate-pulse">
              LAST TURN
            </span>
          )}
          {isSpectator && (
            <span className="whitespace-nowrap rounded-full border border-violet-500/40 bg-violet-900/40 px-2 py-1 text-[10px] font-bold text-violet-300">
              SPECTATING
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
