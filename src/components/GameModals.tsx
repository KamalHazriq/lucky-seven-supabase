import { motion, AnimatePresence } from 'framer-motion'
import DrawnCardModal from './DrawnCardModal'
import PeekModal from './PeekModal'
import PeekResultModal from './PeekResultModal'
import PeekAllModal from './PeekAllModal'
import PeekAllOpponentPickerModal from './PeekAllOpponentPickerModal'
import PeekAllOpponentModal from './PeekAllOpponentModal'
import QueenSwapModal from './QueenSwapModal'
import SlotPickerModal from './SlotPickerModal'
import JokerChaosModal from './JokerChaosModal'
import PowerGuideModal from './PowerGuideModal'
import SettingsModal from './SettingsModal'
import DevModeModal from './DevModeModal'
import DevPanel from './DevPanel'
import type { ModalState } from '../hooks/useGameActions'
import type { Card, GameDoc, PlayerDoc, PowerEffectType, PowerRankKey, DrawnCardSource, DevPrivileges, PrivatePlayerDoc } from '../lib/types'
import type { DEFAULT_GAME_SETTINGS } from '../lib/types'

interface GameModalsProps {
  // Modal state
  modal: ModalState
  setModal: React.Dispatch<React.SetStateAction<ModalState>>

  // Game data
  game: GameDoc
  players: Record<string, PlayerDoc>
  localPlayerId: string
  modalPlayerOrder: string[]

  // Card/power data
  isMyTurn: boolean
  hasDrawnCard: boolean
  drawnCard: Card | null
  myLocks: [boolean, boolean, boolean]
  myKnown: Record<string, Card>
  powerAssignments: typeof DEFAULT_GAME_SETTINGS.powerAssignments
  spentPowerCardIds: Record<string, boolean>
  drawnCardSource: DrawnCardSource
  hasAnyLocks: boolean
  uiMode: 'modal' | 'actionbar'
  drawnCardDismissed: boolean

  // Handlers
  onSwap: (slotIndex: number) => void
  onDiscard: () => void
  onUsePower: (rankKey: PowerRankKey, effectType: PowerEffectType) => void
  onCancelDraw: () => void
  onDismissDrawn: () => void
  onPeekSelect: (slotIndex: number) => void
  onSwapConfirm: (a: { playerId: string; slotIndex: number }, b: { playerId: string; slotIndex: number }) => void
  onLockSelect: (playerId: string, slotIndex: number) => void
  onUnlockSelect: (playerId: string, slotIndex: number) => void
  onRearrangeSelect: (playerId: string) => void
  onPeekOpponentSelect: (playerId: string, slotIndex: number) => void
  onPeekAllOpponentSelect: (playerId: string) => void
  onPeekChoiceSelf: () => void
  onPeekChoiceOpponent: () => void
  onCancelPower: () => void

  // Power guide
  showPowerGuide: boolean
  onClosePowerGuide: () => void

  // Settings
  showSettings: boolean
  onCloseSettings: () => void
  layout: 'table' | 'classic'
  onToggleLayout: () => void
  uiModeValue: 'modal' | 'actionbar'
  onToggleUiMode: () => void
  logPosition: 'bottom' | 'left'
  onToggleLogPosition: () => void
  isMobile: boolean
  canLogSidebar: boolean
  otherPlayers: string[]
  voteKickActive: boolean
  onVoteKick: (targetId: string) => void
  onLeaveGame: () => void

  // Dev mode
  showDevModal: boolean
  onCloseDevModal: () => void
  devMode: {
    activate: (code: string) => Promise<void>
    loading: boolean
    error: string | null
    isDevMode: boolean
    privileges: DevPrivileges | null
    allPlayerHands: Record<string, PrivatePlayerDoc>
    drawPileCards: Card[]
    deactivate: () => Promise<void>
  }
  onOpenDiscardReorder?: () => void
  showMonitor: boolean
  onCloseMonitor: () => void
}

export default function GameModals({
  modal, setModal,
  game, players, localPlayerId, modalPlayerOrder,
  isMyTurn, hasDrawnCard, drawnCard,
  myLocks, myKnown, powerAssignments, spentPowerCardIds, drawnCardSource,
  hasAnyLocks, uiMode, drawnCardDismissed,
  onSwap, onDiscard, onUsePower, onCancelDraw, onDismissDrawn,
  onPeekSelect, onSwapConfirm, onLockSelect, onUnlockSelect, onRearrangeSelect, onPeekOpponentSelect, onPeekAllOpponentSelect,
  onPeekChoiceSelf, onPeekChoiceOpponent, onCancelPower,
  showPowerGuide, onClosePowerGuide,
  showSettings, onCloseSettings,
  layout, onToggleLayout, uiModeValue, onToggleUiMode,
  logPosition, onToggleLogPosition, isMobile, canLogSidebar,
  otherPlayers, voteKickActive, onVoteKick, onLeaveGame,
  showDevModal, onCloseDevModal, devMode, onOpenDiscardReorder,
  showMonitor, onCloseMonitor,
}: GameModalsProps) {
  return (
    <>
      {/* Drawn Card Modal (main action chooser) — only in modal UI mode */}
      <DrawnCardModal
        card={uiMode === 'modal' && isMyTurn && hasDrawnCard ? drawnCard : null}
        open={modal.type === 'none' && !drawnCardDismissed}
        locks={myLocks}
        powerAssignments={powerAssignments}
        spentPowerCardIds={spentPowerCardIds}
        knownCards={myKnown}
        drawnCardSource={drawnCardSource}
        onSwap={onSwap}
        onDiscard={onDiscard}
        onUsePower={onUsePower}
        onClose={onCancelDraw}
        onDismiss={onDismissDrawn}
        hasAnyLocks={hasAnyLocks}
      />

      <PeekModal
        open={modal.type === 'peekOne'}
        onSelect={onPeekSelect}
        onCancel={onCancelPower}
      />

      <PeekResultModal
        card={modal.type === 'peekResult' ? modal.card : null}
        slotIndex={modal.type === 'peekResult' ? modal.slot : null}
        onClose={() => setModal({ type: 'none' })}
      />

      <PeekAllModal
        open={modal.type === 'peekAll'}
        revealedCards={modal.type === 'peekAll' ? modal.cards : {}}
        locks={myLocks}
        onClose={() => setModal({ type: 'none' })}
      />

      {/* Peek Choice Modal — shown when peekAllowsOpponent is enabled */}
      <AnimatePresence>
        {modal.type === 'peekChoice' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={onCancelPower}
          >
            <motion.div
              initial={{ scale: 0.85, y: 30, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.88, y: 20, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 24, mass: 0.7 }}
              className="bg-slate-800 border border-slate-600 rounded-2xl p-5 max-w-xs w-full shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-bold text-amber-300 mb-1">Peek Power</h3>
              <p className="text-xs text-slate-400 mb-4">Choose whose card to peek at.</p>
              <div className="space-y-2">
                <button
                  onClick={onPeekChoiceSelf}
                  className="w-full py-2.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl font-semibold text-sm transition-colors cursor-pointer"
                >
                  Peek Your Card
                </button>
                <button
                  onClick={onPeekChoiceOpponent}
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-semibold text-sm transition-colors cursor-pointer"
                >
                  Peek Opponent's Card
                </button>
              </div>
              <button
                onClick={onCancelPower}
                className="w-full mt-2 py-2 text-slate-400 hover:text-slate-200 text-xs transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <QueenSwapModal
        open={modal.type === 'swap'}
        players={players}
        playerOrder={modalPlayerOrder}
        localPlayerId={localPlayerId}
        knownCards={myKnown}
        onConfirm={onSwapConfirm}
        onCancel={onCancelPower}
      />

      <SlotPickerModal
        open={modal.type === 'lock'}
        title="Power: Lock"
        subtitle="Choose an unlocked card to lock. Locked cards cannot be swapped."
        accentColor="red"
        players={players}
        playerOrder={modalPlayerOrder}
        localPlayerId={localPlayerId}
        knownCards={myKnown}
        slotFilter={(_pid: string, slotIndex: number, pd: PlayerDoc) => !pd.locks[slotIndex]}
        onSelect={onLockSelect}
        onCancel={onCancelPower}
      />

      <SlotPickerModal
        open={modal.type === 'unlock'}
        title="Power: Unlock"
        subtitle="Choose a locked card to unlock."
        accentColor="cyan"
        players={players}
        playerOrder={modalPlayerOrder}
        localPlayerId={localPlayerId}
        knownCards={myKnown}
        slotFilter={(_pid: string, slotIndex: number, pd: PlayerDoc) => pd.locks[slotIndex]}
        onSelect={onUnlockSelect}
        onCancel={onCancelPower}
        noTargetsMessage="No cards are locked."
      />

      <SlotPickerModal
        open={modal.type === 'peekOpponent'}
        title="Power: Peek Opponent"
        subtitle="Choose an opponent's card to peek."
        accentColor="amber"
        players={players}
        playerOrder={modalPlayerOrder}
        localPlayerId={localPlayerId}
        knownCards={myKnown}
        slotFilter={(pid: string, slotIndex: number, pd: PlayerDoc) => pid !== localPlayerId && !pd.locks[slotIndex]}
        onSelect={onPeekOpponentSelect}
        onCancel={onCancelPower}
        noTargetsMessage="No opponent cards available to peek."
      />

      <PeekResultModal
        card={modal.type === 'peekOpponentResult' ? modal.card : null}
        slotIndex={modal.type === 'peekOpponentResult' ? modal.slot : null}
        onClose={() => setModal({ type: 'none' })}
      />

      <PeekAllOpponentPickerModal
        open={modal.type === 'peekAllOpponent'}
        players={players}
        playerOrder={modalPlayerOrder}
        localPlayerId={localPlayerId}
        onSelect={onPeekAllOpponentSelect}
        onCancel={onCancelPower}
      />

      <PeekAllOpponentModal
        open={modal.type === 'peekAllOpponentResult'}
        revealedCards={modal.type === 'peekAllOpponentResult' ? modal.cards : {}}
        locks={modal.type === 'peekAllOpponentResult' ? modal.locks : [false, false, false]}
        playerName={modal.type === 'peekAllOpponentResult' ? modal.playerName : ''}
        onClose={() => setModal({ type: 'none' })}
      />

      <JokerChaosModal
        open={modal.type === 'rearrange'}
        players={players}
        playerOrder={modalPlayerOrder}
        localPlayerId={localPlayerId}
        onSelect={onRearrangeSelect}
        onCancel={onCancelPower}
      />

      <PowerGuideModal
        open={showPowerGuide}
        onClose={onClosePowerGuide}
        powerAssignments={powerAssignments}
      />

      <SettingsModal
        open={showSettings}
        onClose={onCloseSettings}
        layout={layout}
        onToggleLayout={onToggleLayout}
        uiMode={uiModeValue}
        onToggleUiMode={onToggleUiMode}
        logPosition={logPosition}
        onToggleLogPosition={onToggleLogPosition}
        showLayoutToggle={!isMobile}
        showUiModeToggle={!isMobile}
        showLogToggle={canLogSidebar}
        onVoteKick={onVoteKick}
        otherPlayers={otherPlayers.map((pid) => ({ id: pid, name: players[pid]?.displayName ?? 'Unknown' }))}
        voteKickActive={voteKickActive}
        onLeaveGame={onLeaveGame}
      />

      {/* Dev Mode Modal + Panel */}
      <DevModeModal
        open={showDevModal}
        onClose={onCloseDevModal}
        onActivate={devMode.activate}
        loading={devMode.loading}
        error={devMode.error}
      />
      {devMode.isDevMode && devMode.privileges && (
        <DevPanel
          open={showMonitor}
          onClose={onCloseMonitor}
          privileges={devMode.privileges}
          allPlayerHands={devMode.allPlayerHands}
          drawPileCards={devMode.drawPileCards}
          players={players}
          game={game}
          onDeactivate={devMode.deactivate}
          onOpenReorder={onOpenDiscardReorder}
        />
      )}
    </>
  )
}
