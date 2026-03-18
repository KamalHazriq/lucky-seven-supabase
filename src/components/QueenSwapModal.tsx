import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import CardView from './CardView'
import type { Card, PlayerDoc } from '../lib/types'

interface QueenSwapModalProps {
  open: boolean
  players: Record<string, PlayerDoc>
  playerOrder: string[]
  localPlayerId: string
  /** Viewer's known cards map (slot index string → Card) — only local player's known slots */
  knownCards?: Record<string, Card>
  onConfirm: (
    targetA: { playerId: string; slotIndex: number },
    targetB: { playerId: string; slotIndex: number },
  ) => void
  onCancel: () => void
}

interface SlotSelection {
  playerId: string
  slotIndex: number
  playerName: string
}

export default function QueenSwapModal({
  open,
  players,
  playerOrder,
  localPlayerId,
  knownCards,
  onConfirm,
  onCancel,
}: QueenSwapModalProps) {
  const [selA, setSelA] = useState<SlotSelection | null>(null)
  const [selB, setSelB] = useState<SlotSelection | null>(null)

  const handleSlotClick = (playerId: string, slotIndex: number) => {
    const pd = players[playerId]
    if (!pd) return
    if (pd.locks[slotIndex]) return // Can't select locked

    const sel: SlotSelection = {
      playerId,
      slotIndex,
      playerName: pd.displayName,
    }

    if (!selA) {
      setSelA(sel)
    } else if (!selB) {
      if (selA.playerId === playerId && selA.slotIndex === slotIndex) {
        setSelA(null)
        return
      }
      setSelB(sel)
    } else {
      setSelA(sel)
      setSelB(null)
    }
  }

  const handleConfirm = () => {
    if (!selA || !selB) return
    onConfirm(
      { playerId: selA.playerId, slotIndex: selA.slotIndex },
      { playerId: selB.playerId, slotIndex: selB.slotIndex },
    )
    setSelA(null)
    setSelB(null)
  }

  const handleCancel = () => {
    setSelA(null)
    setSelB(null)
    onCancel()
  }

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
            className="bg-slate-800 border border-purple-500/50 rounded-2xl p-5 max-w-lg w-full shadow-2xl max-h-[80vh] overflow-y-auto"
          >
            <h3 className="text-center text-lg font-semibold text-purple-300 mb-1">
              Power: Swap Cards
            </h3>
            <p className="text-xs text-slate-400 text-center mb-4">
              Select two cards to swap (from any players). Locked cards cannot be swapped.
            </p>

            {selA && (
              <p className="text-xs text-center text-purple-300 mb-2">
                Card 1: {selA.playerName} #{selA.slotIndex + 1}
                {selB && ` \u2194 Card 2: ${selB.playerName} #${selB.slotIndex + 1}`}
              </p>
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
                        const isLocked = pd.locks[i]
                        const isSelectedA = selA?.playerId === pid && selA?.slotIndex === i
                        const isSelectedB = selB?.playerId === pid && selB?.slotIndex === i
                        const isSelected = isSelectedA || isSelectedB
                        const knownCard = isLocal ? knownCards?.[String(i)] : undefined

                        if (knownCard && !isLocked) {
                          return (
                            <div
                              key={i}
                              onClick={() => handleSlotClick(pid, i)}
                              className={`relative cursor-pointer ${
                                isSelected ? 'ring-2 ring-purple-400 rounded-xl shadow-lg shadow-purple-500/20' : ''
                              }`}
                            >
                              <CardView
                                card={knownCard}
                                faceUp
                                known
                                size="sm"
                                highlight={isSelected}
                              />
                              <span className="absolute -bottom-4 left-1/2 -translate-x-1/2 text-[9px] text-purple-300">
                                #{i + 1}
                                {isSelectedA && ' 1st'}
                                {isSelectedB && ' 2nd'}
                              </span>
                            </div>
                          )
                        }

                        return (
                          <button
                            key={i}
                            onClick={() => handleSlotClick(pid, i)}
                            disabled={isLocked}
                            className={`
                              w-14 h-20 rounded-xl border-2 flex flex-col items-center justify-center text-xs font-medium transition-all cursor-pointer
                              ${isLocked
                                ? 'bg-slate-700/50 border-red-700/50 opacity-50 cursor-not-allowed'
                                : isSelected
                                  ? 'bg-purple-700/50 border-purple-400 shadow-lg shadow-purple-500/20'
                                  : 'bg-slate-800 border-slate-600 hover:border-purple-400'
                              }
                            `}
                          >
                            {isLocked && <span>🔒</span>}
                            <span className={isSelected ? 'text-purple-300' : 'text-slate-400'}>
                              #{i + 1}
                            </span>
                            {isSelectedA && <span className="text-[9px] text-purple-300">1st</span>}
                            {isSelectedB && <span className="text-[9px] text-purple-300">2nd</span>}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleConfirm}
                disabled={!selA || !selB}
                className="flex-1 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors cursor-pointer"
              >
                Swap Cards
              </button>
              <button
                onClick={handleCancel}
                className="flex-1 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-sm transition-colors cursor-pointer"
              >
                Back
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
