import { motion, AnimatePresence } from 'framer-motion'
import CardView from './CardView'
import type { Card } from '../lib/types'

interface PeekResultModalProps {
  card: Card | null
  slotIndex: number | null
  onClose: () => void
}

export default function PeekResultModal({ card, slotIndex, onClose }: PeekResultModalProps) {
  return (
    <AnimatePresence>
      {card && slotIndex !== null && (
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
            className="bg-slate-800 border border-slate-600 rounded-2xl p-6 max-w-sm w-full shadow-2xl text-center"
          >
            <h3 className="text-lg font-semibold text-amber-300 mb-2">
              Card #{slotIndex + 1} revealed!
            </h3>
            <p className="text-sm text-slate-400 mb-5">
              Only you can see this. Remember it!
            </p>

            <div className="flex justify-center mb-6">
              <CardView card={card} faceUp size="lg" />
            </div>

            <button
              onClick={onClose}
              className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium transition-colors"
            >
              Got it!
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
