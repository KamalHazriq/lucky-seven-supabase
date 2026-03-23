import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import CardView from './CardView'
import { getLocalStorageJson, setLocalStorageJson } from '../lib/browserStorage'
import type { DevPrivileges, PrivatePlayerDoc, Card, GameDoc, PlayerDoc } from '../lib/types'
import { getPlayerColor } from '../lib/playerColors'

const STORAGE_KEY = 'lucky7_devpanel_pos'

function getDefaultPos() {
  const width = typeof window === 'undefined' ? 1280 : window.innerWidth
  return { x: Math.max(0, width - 376), y: 80 }
}

function clampPos(x: number, y: number, w = 360, h = 500) {
  return {
    x: Math.max(0, Math.min(x, window.innerWidth - w)),
    y: Math.max(0, Math.min(y, window.innerHeight - h)),
  }
}

function loadPos() {
  const stored = getLocalStorageJson(
    STORAGE_KEY,
    (value): value is { x: number; y: number } =>
      typeof value === 'object'
      && value !== null
      && typeof (value as { x?: unknown }).x === 'number'
      && typeof (value as { y?: unknown }).y === 'number',
  )
  return stored ? clampPos(stored.x, stored.y) : getDefaultPos()
}

interface DevPanelProps {
  open: boolean
  onClose: () => void
  privileges: DevPrivileges
  allPlayerHands: Record<string, PrivatePlayerDoc>
  drawPileCards: Card[]
  players: Record<string, PlayerDoc>
  game: GameDoc | null
  onDeactivate: () => void
  onOpenReorder?: () => void
}

type Section = 'visibility' | 'state' | 'session'

export default function DevPanel({
  open,
  onClose,
  privileges,
  allPlayerHands,
  drawPileCards,
  players,
  game,
  onDeactivate,
  onOpenReorder,
}: DevPanelProps) {
  const [activeSection, setActiveSection] = useState<Section>('visibility')
  const [expandedCards, setExpandedCards] = useState(false)
  const [expandedPile, setExpandedPile] = useState(false)
  const [pos, setPos] = useState(loadPos)
  const panelRef = useRef<HTMLDivElement>(null)
  const dragState = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null)

  // ESC to close
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  // Focus panel on open
  useEffect(() => {
    if (open && panelRef.current) panelRef.current.focus()
  }, [open])

  // Drag handlers
  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragState.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y }

    const onMove = (me: MouseEvent) => {
      if (!dragState.current) return
      const dx = me.clientX - dragState.current.startX
      const dy = me.clientY - dragState.current.startY
      setPos(clampPos(dragState.current.origX + dx, dragState.current.origY + dy))
    }

    const onUp = () => {
      setPos((p) => {
        const clamped = clampPos(p.x, p.y)
        setLocalStorageJson(STORAGE_KEY, clamped)
        return clamped
      })
      dragState.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [pos.x, pos.y])

  const sections: { key: Section; label: string; icon: string }[] = [
    { key: 'visibility', label: 'Visibility', icon: '👁' },
    { key: 'state', label: 'State', icon: '🧭' },
    { key: 'session', label: 'Session', icon: '🧪' },
  ]

  const turnInfo = useMemo(() => {
    if (!game) return null
    const currentPlayer = game.currentTurnPlayerId
    const currentName = currentPlayer ? players[currentPlayer]?.displayName ?? '?' : 'None'
    const phase = game.turnPhase ?? 'idle'
    return { currentName, phase }
  }, [game, players])

  const cardDistribution = useMemo(() => {
    if (!game) return null
    return {
      drawPile: drawPileCards.length,
      discardTop: game.discardTop ? 1 : 0,
      inHands: Object.values(allPlayerHands).reduce((sum, p) => sum + p.hand.filter(Boolean).length + (p.drawnCard ? 1 : 0), 0),
      players: game.playerOrder.length,
    }
  }, [game, drawPileCards, allPlayerHands])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={panelRef}
          tabIndex={-1}
          initial={{ scale: 0.92, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.92, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 380, damping: 28, mass: 0.5 }}
          className="fixed z-[46] w-[360px] max-w-[92vw] max-h-[80vh] bg-slate-900/98 backdrop-blur-xl border border-slate-700/40 shadow-2xl rounded-2xl flex flex-col outline-none overflow-hidden"
          style={{ left: pos.x, top: pos.y }}
        >
          {/* ─── Header (drag handle) ─── */}
          <div
            className="px-4 py-3 border-b border-slate-800/80 shrink-0 cursor-grab active:cursor-grabbing select-none"
            onMouseDown={onDragStart}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                {/* Drag indicator dots */}
                <div className="flex flex-col gap-[3px] opacity-30 mr-0.5">
                  {[0,1,2].map((r) => (
                    <div key={r} className="flex gap-[3px]">
                      {[0,1].map((c) => <div key={c} className="w-[3px] h-[3px] rounded-full bg-slate-400" />)}
                    </div>
                  ))}
                </div>
                <div className="w-7 h-7 rounded-lg bg-emerald-900/40 border border-emerald-600/30 flex items-center justify-center">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-400">
                    <rect x="2" y="3" width="20" height="14" rx="2" />
                    <line x1="8" y1="21" x2="16" y2="21" />
                    <line x1="12" y1="17" x2="12" y2="21" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-100 tracking-tight">Game Monitor</h2>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-[9px] text-emerald-400/80 font-medium tracking-wide uppercase">Monitor Active</span>
                  </div>
                </div>
              </div>
              <button
                onMouseDown={(e) => e.stopPropagation()}
                onClick={onClose}
                className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-800/60 hover:bg-slate-700 text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
                aria-label="Close monitor"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>

          {/* ─── Section tabs ─── */}
          <div className="flex px-3 pt-2 pb-0 gap-1 shrink-0">
            {sections.map((s) => (
              <button
                key={s.key}
                onClick={() => setActiveSection(s.key)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-t-lg text-[10px] font-semibold transition-all cursor-pointer ${
                  activeSection === s.key
                    ? 'text-slate-100 bg-slate-800/80 border border-slate-700/50 border-b-transparent'
                    : 'text-slate-500 hover:text-slate-400 bg-transparent border border-transparent'
                }`}
              >
                <span>{s.icon}</span>
                {s.label}
              </button>
            ))}
          </div>

          {/* ─── Content ─── */}
          <div className="flex-1 overflow-y-auto px-3 pb-3 min-h-0">
            <div className="bg-slate-800/50 rounded-b-xl rounded-tr-xl border border-slate-700/40 border-t-0 p-3">
              <AnimatePresence mode="wait">
                {/* ══════ VISIBILITY ══════ */}
                {activeSection === 'visibility' && (
                  <motion.div key="vis" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-2">

                    {privileges.canSeeAllCards && (
                      <ToolCard
                        icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-400"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>}
                        title="Inspect Player Cards"
                        desc="View all players' current hands"
                        expanded={expandedCards}
                        onToggle={() => setExpandedCards(!expandedCards)}
                      >
                        <div className="space-y-2.5 pt-1">
                          {Object.entries(allPlayerHands).map(([pid, priv]) => {
                            const player = players[pid]
                            if (!player) return null
                            const color = getPlayerColor(player.seatIndex, player.colorKey)
                            return (
                              <div key={pid}>
                                <div className="flex items-center gap-1.5 mb-1">
                                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color.solid }} />
                                  <span className="text-[10px] font-semibold" style={{ color: color.text }}>{player.displayName}</span>
                                  {player.connected ? (
                                    <span className="text-[8px] text-emerald-500">online</span>
                                  ) : (
                                    <span className="text-[8px] text-red-500">offline</span>
                                  )}
                                </div>
                                <div className="flex gap-1.5 pl-3.5">
                                  {priv.hand.map((card, i) => (
                                    <CardView key={card?.id ?? i} card={card} faceUp size="sm" label={`#${i + 1}`} />
                                  ))}
                                  {priv.drawnCard && (
                                    <div className="relative">
                                      <CardView card={priv.drawnCard} faceUp size="sm" label="Drawn" />
                                      <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-amber-500 rounded-full flex items-center justify-center text-[7px] font-bold text-white">D</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                          {Object.keys(allPlayerHands).length === 0 && (
                            <p className="text-[10px] text-slate-500 text-center py-2">No player data available.</p>
                          )}
                        </div>
                      </ToolCard>
                    )}

                    {privileges.canPeekDrawPile && (
                      <ToolCard
                        icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-400"><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 3H8l-2 4h12l-2-4z"/></svg>}
                        title="Inspect Draw Stack"
                        desc={`${drawPileCards.length} cards remaining`}
                        expanded={expandedPile}
                        onToggle={() => setExpandedPile(!expandedPile)}
                      >
                        <div className="space-y-0.5 pt-1">
                          {drawPileCards.slice(0, 12).map((card, i) => (
                            <div key={card.id} className={`flex items-center gap-2 px-2 py-1 rounded-lg ${i === 0 ? 'bg-amber-900/15 border border-amber-700/20' : 'bg-slate-900/20'}`}>
                              <span className="text-[9px] text-slate-500 w-4 text-right font-mono">{i + 1}.</span>
                              <CardView card={card} faceUp size="sm" />
                              <span className="text-[10px] text-slate-400 flex-1">{card.isJoker ? 'Joker' : `${card.rank} of ${card.suit}`}</span>
                              {i === 0 && <span className="text-[7px] px-1.5 py-0.5 bg-amber-600/25 text-amber-300 rounded-full font-bold">NEXT</span>}
                            </div>
                          ))}
                          {drawPileCards.length > 12 && (
                            <p className="text-[9px] text-slate-500 text-center pt-1">...and {drawPileCards.length - 12} more</p>
                          )}
                          {drawPileCards.length === 0 && (
                            <p className="text-[10px] text-slate-500 text-center py-2">Stack is empty.</p>
                          )}
                        </div>
                      </ToolCard>
                    )}

                    {!privileges.canSeeAllCards && !privileges.canPeekDrawPile && (
                      <p className="text-[10px] text-slate-500 text-center py-6">No visibility tools available.</p>
                    )}
                  </motion.div>
                )}

                {/* ══════ STATE ══════ */}
                {activeSection === 'state' && (
                  <motion.div key="state" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-2">

                    {turnInfo && (
                      <div className="rounded-xl bg-slate-900/40 border border-slate-700/30 p-3">
                        <p className="text-[9px] text-slate-500 uppercase tracking-wider font-semibold mb-2">Current Turn</p>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-slate-200 font-medium">{turnInfo.currentName}</span>
                          <span className="text-[9px] px-2 py-0.5 rounded-full bg-slate-700/60 text-slate-400 font-mono">{turnInfo.phase}</span>
                        </div>
                      </div>
                    )}

                    {cardDistribution && (
                      <div className="rounded-xl bg-slate-900/40 border border-slate-700/30 p-3">
                        <p className="text-[9px] text-slate-500 uppercase tracking-wider font-semibold mb-2">Card Distribution</p>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                          <StatRow label="Draw stack" value={cardDistribution.drawPile} />
                          <StatRow label="Discard top" value={cardDistribution.discardTop} />
                          <StatRow label="In hands" value={cardDistribution.inHands} />
                          <StatRow label="Players" value={cardDistribution.players} />
                        </div>
                      </div>
                    )}

                    {privileges.canReorderDiscardPile && onOpenReorder && (
                      <button
                        onClick={() => { onOpenReorder(); onClose() }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-amber-900/10 border border-amber-700/20 hover:bg-amber-900/20 transition-colors cursor-pointer group"
                      >
                        <div className="w-7 h-7 rounded-lg bg-amber-900/30 border border-amber-600/20 flex items-center justify-center shrink-0">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-400">
                            <polyline points="7 13 12 18 17 13"/><polyline points="7 6 12 11 17 6"/>
                          </svg>
                        </div>
                        <div className="text-left">
                          <span className="text-[11px] font-semibold text-amber-300 block">Reorder Draw Stack</span>
                          <span className="text-[9px] text-amber-500/50">Rearrange card positions</span>
                        </div>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-600 group-hover:text-amber-400 ml-auto transition-colors shrink-0">
                          <polyline points="9 18 15 12 9 6"/>
                        </svg>
                      </button>
                    )}
                  </motion.div>
                )}

                {/* ══════ SESSION ══════ */}
                {activeSection === 'session' && (
                  <motion.div key="session" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-2.5">

                    <div className="rounded-xl bg-slate-900/40 border border-slate-700/30 p-3">
                      <p className="text-[9px] text-slate-500 uppercase tracking-wider font-semibold mb-2.5">Active Permissions</p>
                      <div className="flex flex-wrap gap-1.5">
                        {privileges.canSeeAllCards && <PermBadge label="Inspect Cards" />}
                        {privileges.canPeekDrawPile && <PermBadge label="Draw Stack" />}
                        {privileges.canInspectGameState && <PermBadge label="Game State" />}
                        {privileges.canUseCheatActions && <PermBadge label="Actions" />}
                        {privileges.canReorderDiscardPile && <PermBadge label="Reorder" highlight />}
                      </div>
                    </div>

                    <div className="rounded-xl bg-slate-900/40 border border-slate-700/30 p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="w-2 h-2 rounded-full bg-emerald-400" />
                        <span className="text-[11px] font-semibold text-emerald-300">Session Active</span>
                      </div>
                      <p className="text-[9px] text-slate-500 pl-4">
                        Monitor mode is bound to this game session.
                      </p>
                    </div>

                    <button
                      onClick={() => { onDeactivate(); onClose() }}
                      className="w-full py-2.5 rounded-xl bg-red-950/30 border border-red-800/25 hover:bg-red-950/50 text-red-400 text-[11px] font-semibold transition-colors cursor-pointer"
                    >
                      Disable Monitor Mode
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/* ─── Reusable sub-components ─── */

function ToolCard({ icon, title, desc, expanded, onToggle, children }: {
  icon: React.ReactNode
  title: string
  desc: string
  expanded: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-slate-700/30 overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2.5 px-3 py-2 bg-slate-900/30 hover:bg-slate-900/60 transition-colors cursor-pointer"
      >
        <div className="w-7 h-7 rounded-lg bg-slate-800/80 border border-slate-700/40 flex items-center justify-center shrink-0">
          {icon}
        </div>
        <div className="text-left flex-1 min-w-0">
          <span className="text-[11px] font-semibold text-slate-200 block">{title}</span>
          <span className="text-[9px] text-slate-500">{desc}</span>
        </div>
        <svg
          width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          className={`text-slate-500 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`}
        >
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30, mass: 0.4 }}
            className="overflow-hidden"
          >
            <div className="px-3 py-2 border-t border-slate-700/20">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function StatRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[10px] text-slate-500">{label}</span>
      <span className="text-[10px] text-slate-300 font-mono font-medium">{value}</span>
    </div>
  )
}

function PermBadge({ label, highlight }: { label: string; highlight?: boolean }) {
  return (
    <span className={`text-[9px] px-2 py-0.5 rounded-full font-medium ${
      highlight
        ? 'bg-amber-900/30 text-amber-300 border border-amber-700/30'
        : 'bg-slate-800/80 text-slate-400 border border-slate-700/30'
    }`}>
      {label}
    </span>
  )
}
