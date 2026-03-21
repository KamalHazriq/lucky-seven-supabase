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
      <div className="flex items-center px-3 md:px-5 py-2 min-h-[52px] max-w-5xl mx-auto gap-3">
        <div className="flex items-center gap-2 shrink-0 min-w-0">
          <h1 className="text-base font-bold text-amber-300 leading-none whitespace-nowrap hidden sm:block">Lucky Seven™</h1>
          <h1 className="text-base font-bold text-amber-300 leading-none whitespace-nowrap sm:hidden">L7</h1>
          <button
            onClick={onCopyCode}
            className="group relative flex items-center gap-1.5 px-2 py-1 rounded-lg border hover:border-emerald-500/40 transition-colors cursor-pointer"
            style={{ background: 'var(--panel)', borderColor: 'var(--border)' }}
            aria-label={`Copy room code ${gameJoinCode}`}
            title="Click to copy room code"
          >
            <span className="text-[11px] font-mono font-bold tracking-widest text-emerald-400">{gameJoinCode}</span>
            <svg className="w-3 h-3 text-slate-500 group-hover:text-emerald-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            <span className="toolbar-tooltip">Copy Code</span>
          </button>
          <span className="text-[10px] font-medium whitespace-nowrap" style={{ color: 'var(--text-dim)' }}>
            {drawPileCount} left
          </span>
          {drawPileCount <= 3 && drawPileCount > 0 && (
            <span className="px-1.5 py-0.5 bg-amber-900/40 border border-amber-600/50 text-amber-300 rounded-md text-[9px] font-bold animate-pulse whitespace-nowrap">
              FINAL
            </span>
          )}
          {drawPileCount === 0 && (
            <span className="px-1.5 py-0.5 bg-red-900/40 border border-red-600/50 text-red-300 rounded-md text-[9px] font-bold animate-pulse whitespace-nowrap">
              LAST TURN
            </span>
          )}
        </div>

        <div className="flex-1 min-w-0 hidden md:flex justify-center">
          <TurnQueue
            playerOrder={playerOrder}
            players={players}
            currentTurnPlayerId={currentTurnPlayerId}
            localPlayerId={localPlayerId}
            compact
          />
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {isSpectator && (
            <span className="px-2 py-0.5 bg-violet-900/40 border border-violet-500/40 text-violet-300 text-[10px] font-bold rounded-md">
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
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
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
                className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center"
              >
                {unreadCount > 9 ? '9+' : unreadCount}
              </motion.span>
            )}
            <span className="toolbar-tooltip">Chat</span>
          </motion.button>
        </div>
      </div>
    </div>
  )
}
