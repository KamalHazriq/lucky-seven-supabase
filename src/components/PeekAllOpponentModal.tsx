import { motion, AnimatePresence } from 'framer-motion'
import CardView from './CardView'
import type { Card } from '../lib/types'

interface PeekAllOpponentModalProps {
  open: boolean
  revealedCards: Record<number, Card>
  locks: [boolean, boolean, boolean]
  playerName: string
  onClose: () => void
}

export default function PeekAllOpponentModal({
  open,
  revealedCards,
  locks,
  playerName,
  onClose,
}: PeekAllOpponentModalProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <motion.div
            initial={{ scale: 0.85, y: 30, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.88, y: 20, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 24, mass: 0.7 }}
            className="bg-slate-800 border border-indigo-500/50 rounded-2xl p-6 max-w-md w-full shadow-2xl text-center"
          >
            <h3 className="text-lg font-semibold text-indigo-300 mb-2">
              Peek: {playerName}&apos;s Cards!
            </h3>
            <p className="text-sm text-slate-400 mb-5">
              Only you can see these. Remember them!
            </p>

            <div className="flex gap-3 justify-center mb-6">
              {[0, 1, 2].map((i) => {
                const card = revealedCards[i]
                const isLocked = locks[i]

                if (isLocked) {
                  return (
                    <div
                      key={i}
                      className="w-20 h-28 rounded-xl bg-slate-700/50 border-2 border-red-700/50 flex flex-col items-center justify-center opacity-60"
                    >
                      <span className="text-lg">🔒</span>
                      <span className="text-[10px] text-red-400 mt-1">Locked</span>
                      <span className="text-[9px] text-slate-500">Can't peek</span>
                    </div>
                  )
                }

                if (card) {
                  return (
                    <div key={i} className="flex flex-col items-center gap-1">
                      <CardView card={card} faceUp size="md" />
                      <span className="text-[10px] text-indigo-300/70">#{i + 1}</span>
                    </div>
                  )
                }

                return (
                  <div
                    key={i}
                    className="w-20 h-28 rounded-xl bg-slate-700/50 border-2 border-slate-600 flex items-center justify-center"
                  >
                    <span className="text-slate-500 text-xs">#{i + 1}</span>
                  </div>
                )
              })}
            </div>

            <button
              onClick={onClose}
              className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium transition-colors cursor-pointer"
            >
              Got it!
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
