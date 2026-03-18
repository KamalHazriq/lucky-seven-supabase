import { motion, AnimatePresence } from 'framer-motion'
import type { PlayerDoc } from '../lib/types'

interface PeekAllOpponentPickerModalProps {
  open: boolean
  players: Record<string, PlayerDoc>
  playerOrder: string[]
  localPlayerId: string
  onSelect: (targetPlayerId: string) => void
  onCancel: () => void
}

export default function PeekAllOpponentPickerModal({
  open,
  players,
  playerOrder,
  localPlayerId,
  onSelect,
  onCancel,
}: PeekAllOpponentPickerModalProps) {
  const others = playerOrder.filter((pid) => pid !== localPlayerId)

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
            className="bg-slate-800 border border-indigo-500/50 rounded-2xl p-5 max-w-sm w-full shadow-2xl"
          >
            <h3 className="text-center text-lg font-semibold text-indigo-300 mb-1">
              Peek: All 3 Cards
            </h3>
            <p className="text-xs text-slate-400 text-center mb-4">
              Choose a player to peek at all 3 of their cards.
            </p>

            <div className="space-y-2 mb-4">
              {others.map((pid) => {
                const pd = players[pid]
                if (!pd) return null
                return (
                  <button
                    key={pid}
                    onClick={() => onSelect(pid)}
                    className="w-full py-3 px-4 bg-slate-900/60 hover:bg-indigo-900/30 border border-slate-600 hover:border-indigo-400 rounded-xl text-left transition-all cursor-pointer flex items-center justify-between"
                  >
                    <span className="text-slate-200 font-medium">{pd.displayName}</span>
                    <span className="text-xs text-slate-500">3 cards</span>
                  </button>
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
