import { motion, AnimatePresence } from 'framer-motion'

interface PeekModalProps {
  open: boolean
  onSelect: (slotIndex: number) => void
  onCancel: () => void
}

export default function PeekModal({ open, onSelect, onCancel }: PeekModalProps) {
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
            className="bg-slate-800 border border-slate-600 rounded-2xl p-6 max-w-sm w-full shadow-2xl"
          >
            <h3 className="text-center text-lg font-semibold text-amber-300 mb-2">
              Peek Power
            </h3>
            <p className="text-sm text-slate-400 text-center mb-6">
              Choose which of your cards to peek at:
            </p>

            <div className="flex gap-3 justify-center mb-4">
              {[0, 1, 2].map((i) => (
                <button
                  key={i}
                  onClick={() => onSelect(i)}
                  className="w-20 h-28 rounded-xl bg-gradient-to-br from-blue-900 via-blue-800 to-blue-950 border-2 border-amber-500/50 hover:border-amber-400 flex items-center justify-center text-amber-300 font-bold text-lg transition-colors cursor-pointer"
                >
                  #{i + 1}
                </button>
              ))}
            </div>

            <button
              onClick={onCancel}
              className="w-full py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm transition-colors"
            >
              Back
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
