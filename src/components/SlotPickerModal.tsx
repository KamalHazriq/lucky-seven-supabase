import { motion, AnimatePresence } from 'framer-motion'
import CardView from './CardView'
import type { Card, PlayerDoc } from '../lib/types'

interface SlotPickerModalProps {
  open: boolean
  title: string
  subtitle: string
  accentColor: string // tailwind color prefix e.g. 'amber', 'red', 'cyan'
  players: Record<string, PlayerDoc>
  playerOrder: string[]
  localPlayerId: string
  /** Viewer's known cards map (slot index string → Card) — only local player's known slots */
  knownCards?: Record<string, Card>
  /** Filter function to determine which slots are selectable */
  slotFilter: (playerId: string, slotIndex: number, pd: PlayerDoc) => boolean
  onSelect: (playerId: string, slotIndex: number) => void
  onCancel: () => void
  /** Optional highlighted message shown when no valid targets exist */
  noTargetsMessage?: string
}

const colorMap: Record<string, { bg: string; border: string; text: string; hover: string; btn: string; btnHover: string }> = {
  amber: { bg: 'bg-amber-700/50', border: 'border-amber-400', text: 'text-amber-300', hover: 'hover:border-amber-400', btn: 'bg-amber-600', btnHover: 'hover:bg-amber-500' },
  red: { bg: 'bg-red-700/50', border: 'border-red-400', text: 'text-red-300', hover: 'hover:border-red-400', btn: 'bg-red-600', btnHover: 'hover:bg-red-500' },
  cyan: { bg: 'bg-cyan-700/50', border: 'border-cyan-400', text: 'text-cyan-300', hover: 'hover:border-cyan-400', btn: 'bg-cyan-600', btnHover: 'hover:bg-cyan-500' },
  rose: { bg: 'bg-rose-700/50', border: 'border-rose-400', text: 'text-rose-300', hover: 'hover:border-rose-400', btn: 'bg-rose-600', btnHover: 'hover:bg-rose-500' },
}

export default function SlotPickerModal({
  open,
  title,
  subtitle,
  accentColor,
  players,
  playerOrder,
  localPlayerId,
  knownCards,
  slotFilter,
  onSelect,
  onCancel,
  noTargetsMessage,
}: SlotPickerModalProps) {
  const colors = colorMap[accentColor] ?? colorMap['amber']

  const hasAnySelectable = playerOrder.some((pid) => {
    const pd = players[pid]
    if (!pd) return false
    return [0, 1, 2].some((i) => slotFilter(pid, i, pd))
  })

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <motion.div
            initial={{ scale: 0.85, y: 30, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.88, y: 20, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 24, mass: 0.7 }}
            className={`bg-slate-800 border ${colors.border} rounded-2xl p-5 max-w-lg w-full shadow-2xl max-h-[80vh] overflow-y-auto`}
          >
            <h3 className={`text-center text-lg font-semibold ${colors.text} mb-1`}>
              {title}
            </h3>
            <p className="text-xs text-slate-400 text-center mb-4">
              {subtitle}
            </p>

            {!hasAnySelectable && (
              <div className={`text-center mb-4 rounded-lg px-4 py-3 ${
                noTargetsMessage
                  ? `${colors.bg} border ${colors.border}`
                  : ''
              }`}>
                <p className={`text-sm font-medium ${noTargetsMessage ? colors.text : 'text-slate-500'}`}>
                  {noTargetsMessage ?? 'No valid targets available.'}
                </p>
              </div>
            )}

            <div className="space-y-3 mb-4">
              {playerOrder.map((pid) => {
                const pd = players[pid]
                if (!pd) return null
                const isLocal = pid === localPlayerId
                return (
                  <div key={pid} className={`rounded-xl p-3 ${isLocal ? 'bg-amber-900/20 border border-amber-500/30' : 'bg-slate-900/50'}`}>
                    <p className={`text-xs font-medium mb-2 ${isLocal ? 'text-amber-300' : 'text-slate-300'}`}>
                      {pd.displayName}
                      {isLocal && (
                        <span className="ml-1.5 inline-block px-1.5 py-0.5 bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[10px] font-bold rounded-md">
                          YOU
                        </span>
                      )}
                    </p>
                    <div className="flex gap-2 justify-center">
                      {[0, 1, 2].map((i) => {
                        const selectable = slotFilter(pid, i, pd)
                        const knownCard = isLocal ? knownCards?.[String(i)] : undefined

                        if (knownCard) {
                          return (
                            <div
                              key={i}
                              onClick={() => selectable && onSelect(pid, i)}
                              className={`relative cursor-pointer ${!selectable ? 'opacity-40 cursor-not-allowed' : ''}`}
                            >
                              <CardView
                                card={knownCard}
                                faceUp
                                known
                                locked={pd.locks[i]}
                                size="sm"
                                highlight={selectable}
                              />
                              <span className={`absolute -bottom-4 left-1/2 -translate-x-1/2 text-[9px] ${selectable ? colors.text : 'text-slate-500'}`}>
                                #{i + 1}
                              </span>
                            </div>
                          )
                        }

                        return (
                          <button
                            key={i}
                            onClick={() => selectable && onSelect(pid, i)}
                            disabled={!selectable}
                            className={`
                              w-14 h-20 rounded-xl border-2 flex flex-col items-center justify-center text-xs font-medium transition-all cursor-pointer
                              ${!selectable
                                ? 'bg-slate-700/50 border-slate-700 opacity-40 cursor-not-allowed'
                                : `bg-slate-800 border-slate-600 ${colors.hover}`
                              }
                            `}
                          >
                            {pd.locks[i] && <span>🔒</span>}
                            <span className={selectable ? colors.text : 'text-slate-500'}>
                              #{i + 1}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>

            <button
              onClick={onCancel}
              className="w-full py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-sm transition-colors cursor-pointer"
            >
              Back
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
