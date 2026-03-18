import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import { useAuth } from '../hooks/useAuth'
import { useGame } from '../hooks/useGame'
import { startGame, updatePlayerProfile, leaveLobby, updateGameSettings } from '../lib/supabaseGameService'
import type { TurnSeconds, PowerRankKey, PowerEffectType } from '../lib/types'
import { ALL_EFFECT_TYPES } from '../lib/types'
import VersionLabel from '../components/VersionLabel'
import FeedbackModal from '../components/FeedbackModal'
import PatchNotesModal from '../components/PatchNotesModal'
import ChatPanel from '../components/ChatPanel'
import { useChat } from '../hooks/useChat'
import { getJoinLink, getInviteMessage, copyToClipboard } from '../lib/share'
import { LOBBY_COLORS } from '../lib/playerColors'
import type { PlayerDoc } from '../lib/types'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'

const springEntry = { type: 'spring' as const, stiffness: 300, damping: 24, mass: 0.7 }
const springBounce = { type: 'spring' as const, stiffness: 400, damping: 20 }

const RANK_ROWS: { key: PowerRankKey; label: string; color: string }[] = [
  { key: '10',    label: '10',    color: 'text-cyan-300' },
  { key: 'J',     label: 'Jack',  color: 'text-amber-300' },
  { key: 'Q',     label: 'Queen', color: 'text-purple-300' },
  { key: 'K',     label: 'King',  color: 'text-red-300' },
  { key: 'JOKER', label: 'Joker', color: 'text-fuchsia-300' },
]

const staggerContainer = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06, delayChildren: 0.1 },
  },
}
const staggerItem = {
  hidden: { opacity: 0, x: -20, scale: 0.95 },
  show: { opacity: 1, x: 0, scale: 1, transition: springEntry },
}

export default function Lobby() {
  const { gameId } = useParams<{ gameId: string }>()
  const { user } = useAuth()
  const { game, players, loading } = useGame(gameId, user?.uid)
  const navigate = useNavigate()
  const [showFeedback, setShowFeedback] = useState(false)
  const [showPatchNotes, setShowPatchNotes] = useState(false)
  const [showPowerSettings, setShowPowerSettings] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState('')
  // Optimistic color key: updates instantly on pick, cleared once Supabase confirms.
  // Needed because runTransaction doesn't give a local-first onSnapshot update.
  const [pendingColorKey, setPendingColorKey] = useState<number | null>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const myPlayer = user ? players[user.uid] : null
  // Prefer Supabase truth once it arrives; fall back to pending optimistic value
  const displayedColorKey = myPlayer?.colorKey ?? pendingColorKey
  const chat = useChat(
    gameId,
    myPlayer?.displayName ?? 'Player',
    myPlayer?.seatIndex ?? 0,
  )

  // Redirect to game when it starts
  useEffect(() => {
    if (game?.status === 'active' || game?.status === 'ending') {
      navigate(`/game/${gameId}`, { replace: true })
    }
    if (game?.status === 'finished') {
      navigate(`/results/${gameId}`, { replace: true })
    }
  }, [game?.status, gameId, navigate])

  // Clear optimistic pending key once Supabase confirms the color
  useEffect(() => {
    if (myPlayer?.colorKey != null) setPendingColorKey(null)
  }, [myPlayer?.colorKey])

  // Auto-assign the first available color when player has none
  useEffect(() => {
    if (!gameId || !myPlayer || myPlayer.colorKey != null) return
    const taken = new Set(Object.values(players).map((p: PlayerDoc) => p.colorKey).filter((k) => k != null))
    const available = LOBBY_COLORS.findIndex((_, idx) => !taken.has(idx))
    if (available >= 0) {
      setPendingColorKey(available) // immediate visual feedback
      updatePlayerProfile(gameId, { colorKey: available }).catch(() => {
        setPendingColorKey(null) // revert if transaction fails (race condition)
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId, myPlayer?.colorKey])

  const isHost = user?.uid === game?.hostId
  const playerList = game?.playerOrder.map((pid) => ({
    id: pid,
    ...players[pid],
  })) ?? []

  const handleStart = async () => {
    if (!gameId) return
    try {
      await startGame(gameId)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const handleCopyCode = () => {
    if (game?.joinCode) {
      copyToClipboard(game.joinCode)
      toast.success('Code copied!')
    }
  }

  const handleCopyLink = () => {
    if (game?.joinCode) {
      copyToClipboard(getJoinLink(game.joinCode))
      toast.success('Room link copied!')
    }
  }

  const handleCopyInvite = () => {
    if (game?.joinCode && gameId) {
      copyToClipboard(getInviteMessage(game.joinCode, gameId))
      toast.success('Invite message copied!')
    }
  }

  const handleStartEditName = () => {
    setNameInput(myPlayer?.displayName ?? '')
    setEditingName(true)
    setTimeout(() => nameRef.current?.focus(), 50)
  }

  const handleSaveName = async () => {
    if (!gameId || !nameInput.trim()) return
    try {
      await updatePlayerProfile(gameId, { displayName: nameInput.trim() })
      toast.success('Name updated!')
      setEditingName(false)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const handlePickColor = async (colorIdx: number) => {
    if (!gameId) return
    setPendingColorKey(colorIdx) // immediate ring highlight before server round-trip
    try {
      await updatePlayerProfile(gameId, { colorKey: colorIdx })
    } catch (e) {
      setPendingColorKey(null) // revert ring on conflict
      toast.error((e as Error).message)
    }
  }

  const handleSetTurnSeconds = async (secs: TurnSeconds) => {
    if (!gameId) return
    try {
      await updateGameSettings(gameId, { turnSeconds: secs })
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const handleSetDeckSize = async (size: 1 | 1.5 | 2) => {
    if (!gameId) return
    try {
      await updateGameSettings(gameId, { deckSize: size })
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const handleSetJokerCount = async (count: number) => {
    if (!gameId) return
    try {
      await updateGameSettings(gameId, { jokerCount: count })
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const handleSetPowerAssignment = async (key: PowerRankKey, value: PowerEffectType) => {
    if (!gameId || !game?.settings) return
    try {
      await updateGameSettings(gameId, {
        powerAssignments: { ...game.settings.powerAssignments, [key]: value },
      })
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full"
        />
      </div>
    )
  }

  if (!game) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={springEntry}
          className="text-center"
        >
          <p className="text-muted-foreground text-lg mb-4">Game not found</p>
          <Button variant="ghost" onClick={() => navigate('/')} className="text-indigo-400 hover:text-indigo-300">
            Go Home
          </Button>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={springEntry}
        className="w-full max-w-md"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1, ...springEntry }}
          className="text-center mb-6"
        >
          <h1 className="text-3xl font-bold text-primary mb-1">Game Lobby</h1>
          <motion.p
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
            className="text-muted-foreground text-sm"
          >
            Waiting for players...
          </motion.p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, ...springEntry }}
        >
          <Card className="p-6 border-border-subtle bg-surface-overlay backdrop-blur-sm shadow-2xl shadow-black/20 rounded-2xl">
            {/* Join Code + Share */}
            <div className="text-center mb-5">
              <Label className="uppercase tracking-wider mb-1 justify-center">Join Code</Label>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                transition={springBounce}
                onClick={handleCopyCode}
                className="block mx-auto text-3xl font-mono font-bold text-emerald-400 tracking-[0.3em] hover:text-emerald-300 transition-colors cursor-pointer"
                title="Click to copy code"
              >
                {game.joinCode}
              </motion.button>
              <p className="text-[10px] text-muted-foreground mt-1">Click to copy code</p>

              {/* Share buttons */}
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3, ...springEntry }}
                className="flex items-center justify-center gap-2 mt-3"
              >
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopyLink}
                  className="text-xs border-indigo-600/40 text-indigo-400 hover:bg-indigo-900/30"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                  Copy Link
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopyInvite}
                  className="text-xs border-emerald-600/40 text-emerald-400 hover:bg-emerald-900/30"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                  Invite Friends
                </Button>
              </motion.div>
            </div>

            {/* Your Profile — name edit + color picker */}
            {myPlayer && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.25 }}
              >
                <Separator className="mb-4" />
                <div className="mb-4">
                  <Label className="uppercase tracking-wider mb-2 block">Your Profile</Label>
                  <div className="flex items-center gap-2 mb-2">
                    <AnimatePresence mode="wait">
                      {editingName ? (
                        <motion.div
                          key="editing"
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          transition={springEntry}
                          className="flex items-center gap-1.5 flex-1"
                        >
                          <Input
                            ref={nameRef}
                            type="text"
                            name="playerName"
                            autoComplete="off"
                            value={nameInput}
                            onChange={(e) => setNameInput(e.target.value.slice(0, 12))}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') setEditingName(false) }}
                            maxLength={12}
                            className="flex-1 h-8 text-sm"
                          />
                          <Button
                            variant="success"
                            size="sm"
                            onClick={handleSaveName}
                            disabled={!nameInput.trim()}
                            className="rounded-lg text-xs"
                          >
                            Save
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setEditingName(false)}
                            className="rounded-lg text-xs"
                          >
                            Cancel
                          </Button>
                        </motion.div>
                      ) : (
                        <motion.div
                          key="display"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="flex items-center gap-2"
                        >
                          <span className="font-medium text-foreground text-sm">{myPlayer.displayName}</span>
                          <Button
                            variant="ghost"
                            size="xs"
                            onClick={handleStartEditName}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            Edit
                          </Button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                  <div className="grid grid-cols-8 gap-1.5">
                    {LOBBY_COLORS.map((lc, idx) => {
                      const isMine = displayedColorKey === idx
                      const takenBy = !isMine
                        ? Object.values(players).find((p: PlayerDoc) => p.colorKey === idx)
                        : null
                      const isTaken = !!takenBy
                      return (
                        <motion.button
                          key={idx}
                          whileHover={!isTaken ? { scale: 1.2 } : undefined}
                          whileTap={!isTaken ? { scale: 0.85 } : undefined}
                          transition={springBounce}
                          onClick={() => !isTaken && handlePickColor(idx)}
                          disabled={isTaken}
                          className={`relative w-7 h-7 rounded-full border-2 transition-all ${
                            isMine
                              ? 'border-white scale-110 ring-2 ring-white/30 cursor-pointer'
                              : isTaken
                                ? 'border-transparent opacity-50 cursor-not-allowed'
                                : 'border-transparent cursor-pointer'
                          }`}
                          style={{ backgroundColor: lc.hex }}
                          title={isTaken ? `Taken by ${takenBy.displayName}` : lc.name}
                        >
                          {isTaken && (
                            <span className="absolute inset-0 flex items-center justify-center text-white font-bold text-xs pointer-events-none" style={{ textShadow: '0 0 3px rgba(0,0,0,0.9)' }}>{'\u2715'}</span>
                          )}
                        </motion.button>
                      )
                    })}
                  </div>
                </div>
              </motion.div>
            )}

            <Separator className="mb-4" />

            {/* Player List */}
            <div className="mb-4">
              <Label className="uppercase tracking-wider mb-3 block">
                Players ({playerList.length}/{game.maxPlayers})
              </Label>

              <motion.div
                variants={staggerContainer}
                initial="hidden"
                animate="show"
                className="space-y-2"
              >
                {playerList.map((p) => (
                  <motion.div
                    key={p.id}
                    variants={staggerItem}
                    layout
                    className="flex items-center gap-3 rounded-xl border border-border-subtle bg-surface-panel p-3"
                  >
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', stiffness: 500, damping: 25, delay: 0.1 }}
                      className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white shadow-md shrink-0"
                      style={{
                        // Use optimistic color for own avatar while Supabase confirms
                        backgroundColor: (() => {
                          const ck = p.id === user?.uid ? (displayedColorKey ?? p.colorKey) : p.colorKey
                          return ck != null && ck >= 0 && ck < LOBBY_COLORS.length
                            ? LOBBY_COLORS[ck].hex
                            : '#6366f1'
                        })(),
                      }}
                    >
                      {p.displayName?.[0]?.toUpperCase() ?? '?'}
                    </motion.div>
                    <span className="font-medium text-foreground">
                      {p.displayName ?? 'Unknown'}
                    </span>
                    {p.id === game.hostId && (
                      <Badge variant="outline" className="ml-auto border-amber-500/30 bg-amber-500/10 text-amber-400 text-[10px] px-1.5 py-0">
                        Host
                      </Badge>
                    )}
                    {p.id === user?.uid && p.id !== game.hostId && (
                      <Badge variant="outline" className="ml-auto border-indigo-500/30 bg-indigo-500/10 text-indigo-400 text-[10px] px-1.5 py-0">
                        You
                      </Badge>
                    )}
                  </motion.div>
                ))}

                {/* Empty seats — animated pulse */}
                {Array.from({ length: game.maxPlayers - playerList.length }).map((_, i) => (
                  <motion.div
                    key={`empty-${i}`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: playerList.length * 0.06 + i * 0.1 }}
                    className="flex items-center gap-3 rounded-xl border border-dashed border-border-subtle p-3"
                  >
                    <motion.div
                      animate={{ opacity: [0.3, 0.6, 0.3] }}
                      transition={{ duration: 2, repeat: Infinity, delay: i * 0.3 }}
                      className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center shrink-0"
                    >
                      <span className="text-muted-foreground text-sm">?</span>
                    </motion.div>
                    <motion.span
                      animate={{ opacity: [0.4, 0.7, 0.4] }}
                      transition={{ duration: 2, repeat: Infinity, delay: i * 0.3 }}
                      className="text-muted-foreground text-sm"
                    >
                      Waiting...
                    </motion.span>
                  </motion.div>
                ))}
              </motion.div>
            </div>

            {/* ─── Game Settings (host only) ─── */}
            {isHost && game.settings && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35, ...springEntry }}
              >
                <Separator className="mb-4" />
                <div className="mb-4">
                  <Label className="uppercase tracking-wider mb-3 block">Game Settings</Label>
                  <div className="space-y-3">

                    {/* Deck Size */}
                    <div className="ls-form-group">
                      <Label className="text-muted-foreground">Deck Size</Label>
                      <div className="flex gap-2">
                        {([1, 1.5, 2] as (1 | 1.5 | 2)[]).map((d) => (
                          <motion.button
                            key={d}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => handleSetDeckSize(d)}
                            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                              game.settings.deckSize === d
                                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                                : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                            }`}
                          >
                            {d === 1 ? '1\u00d7' : d === 1.5 ? '1.5\u00d7' : '2\u00d7'}
                          </motion.button>
                        ))}
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        {game.settings.deckSize === 1
                          ? '54 cards (standard)'
                          : game.settings.deckSize === 1.5
                            ? '~81 cards (1 full + 27 extra)'
                            : '~108 cards (double deck)'}
                      </p>
                    </div>

                    {/* Turn Timer */}
                    <div className="ls-form-group">
                      <Label className="text-muted-foreground">Turn Timer</Label>
                      <div className="flex gap-1.5">
                        {([0, 30, 60, 90, 120] as TurnSeconds[]).map((s) => (
                          <motion.button
                            key={s}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => handleSetTurnSeconds(s)}
                            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                              game.settings.turnSeconds === s
                                ? 'bg-amber-600 text-white shadow-md shadow-amber-600/30'
                                : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                            }`}
                          >
                            {s === 0 ? 'Off' : `${s}s`}
                          </motion.button>
                        ))}
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        {game.settings.turnSeconds === 0
                          ? 'No time limit per turn'
                          : `${game.settings.turnSeconds}s per turn — AFK players get auto-skipped, then kicked`}
                      </p>
                    </div>

                    {/* Power Settings accordion */}
                    <div className="rounded-xl border border-border-subtle overflow-hidden">
                      <motion.button
                        whileTap={{ scale: 0.99 }}
                        onClick={() => setShowPowerSettings(!showPowerSettings)}
                        className="w-full flex items-center justify-between px-4 py-2.5 bg-surface-panel hover:bg-secondary/80 transition-colors cursor-pointer"
                      >
                        <span className="text-xs font-medium text-foreground">Power Settings</span>
                        <motion.span
                          animate={{ rotate: showPowerSettings ? 180 : 0 }}
                          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                          className="text-muted-foreground text-xs"
                        >
                          {'\u25BC'}
                        </motion.span>
                      </motion.button>

                      <AnimatePresence initial={false}>
                        {showPowerSettings && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ type: 'spring', stiffness: 300, damping: 28, mass: 0.6 }}
                            className="overflow-hidden"
                          >
                            <Separator />
                            <div className="p-3 space-y-3">
                              {/* Per-rank power selects */}
                              {RANK_ROWS.map((row) => (
                                <div key={row.key} className="ls-form-group">
                                  <Label className={row.color}>
                                    {row.label} Power
                                  </Label>
                                  <Select
                                    value={game.settings.powerAssignments[row.key]}
                                    onValueChange={(v) =>
                                      handleSetPowerAssignment(row.key, v as PowerEffectType)
                                    }
                                  >
                                    <SelectTrigger className="h-9 text-xs">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {ALL_EFFECT_TYPES.map((o) => (
                                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              ))}

                              {/* Jokers in deck */}
                              <div className="ls-form-group">
                                <Label className="text-fuchsia-300">
                                  Jokers in Deck
                                </Label>
                                <div className="flex gap-2">
                                  {[1, 2, 3, 4].map((n) => (
                                    <motion.button
                                      key={n}
                                      whileHover={{ scale: 1.05 }}
                                      whileTap={{ scale: 0.95 }}
                                      onClick={() => handleSetJokerCount(n)}
                                      className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                                        game.settings.jokerCount === n
                                          ? 'bg-fuchsia-600 text-white'
                                          : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                                      }`}
                                    >
                                      {n}
                                    </motion.button>
                                  ))}
                                </div>
                                <p className="text-[10px] text-muted-foreground">Default: 2 (standard deck)</p>
                              </div>

                              <div className="bg-surface-panel rounded-lg p-2">
                                <p className="text-[10px] text-amber-400/80 font-medium">
                                  Powers trigger every time you draw that card rank. Any rank can have any effect!
                                </p>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                  </div>
                </div>
              </motion.div>
            )}

            {isHost && (
              <Button
                variant="success"
                onClick={handleStart}
                disabled={playerList.length < 2}
                className="w-full h-12 rounded-xl text-lg"
              >
                {playerList.length < 2 ? 'Need at least 2 players' : 'Start Game'}
              </Button>
            )}

            {!isHost && (
              <div className="text-center py-3">
                <motion.div
                  animate={{ opacity: [0.4, 1, 0.4] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="flex items-center justify-center gap-2"
                >
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                    className="w-4 h-4 border-2 border-muted-foreground border-t-transparent rounded-full"
                  />
                  <span className="text-muted-foreground text-sm">
                    Waiting for host to start the game...
                  </span>
                </motion.div>
              </div>
            )}
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="flex items-center justify-center gap-4 mt-4 flex-wrap"
        >
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              if (!confirm('Leave this lobby?')) return
              try {
                if (gameId) await leaveLobby(gameId)
              } catch (e) {
                console.error('Failed to leave lobby:', e)
              }
              navigate('/')
            }}
            className="text-red-400 hover:text-red-300 text-sm"
          >
            Leave Lobby
          </Button>
          <span className="text-border-subtle">|</span>
          <motion.button
            whileHover={{ scale: 1.05 }}
            onClick={chat.toggleChat}
            className="relative text-sm text-indigo-400 hover:text-indigo-300 cursor-pointer"
          >
            {'\u{1F4AC}'} Chat
            {chat.unreadCount > 0 && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="absolute -top-2 -right-3 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center"
              >
                {chat.unreadCount > 9 ? '9+' : chat.unreadCount}
              </motion.span>
            )}
          </motion.button>
          <span className="text-border-subtle">|</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowPatchNotes(true)}
            className="text-muted-foreground hover:text-foreground text-sm"
          >
            Patch Notes
          </Button>
          <span className="text-border-subtle">|</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowFeedback(true)}
            className="text-amber-600 hover:text-amber-400 text-sm"
          >
            Send Feedback
          </Button>
        </motion.div>
      </motion.div>

      <FeedbackModal open={showFeedback} onClose={() => setShowFeedback(false)} />
      <PatchNotesModal open={showPatchNotes} onClose={() => setShowPatchNotes(false)} />
      <ChatPanel
        open={chat.isOpen}
        messages={chat.messages}
        localUserId={user?.uid ?? ''}
        onSend={chat.send}
        onClose={chat.closeChat}
      />
      <VersionLabel />

      {/* Watermark */}
      <div className="fixed bottom-2 right-3 text-xs md:text-sm font-medium pointer-events-none select-none z-10" style={{ color: 'var(--watermark)' }}>
        Built by Kamal Hazriq
      </div>
    </div>
  )
}
