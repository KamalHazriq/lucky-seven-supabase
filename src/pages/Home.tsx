import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import { createGame, joinGame, findGameByCode } from '../lib/supabaseGameService'
import { useAuth } from '../hooks/useAuth'
import HowToPlay from '../components/HowToPlay'
import FeedbackModal from '../components/FeedbackModal'
import VersionLabel from '../components/VersionLabel'
import PatchNotesModal from '../components/PatchNotesModal'
import GameStats from '../components/GameStats'
import StrategyTips from '../components/StrategyTips'
import { trackEvent } from '../lib/analytics'
import type { PowerAssignments, PowerEffectType, PowerRankKey, DeckSize, TurnSeconds } from '../lib/types'
import { DEFAULT_GAME_SETTINGS, ALL_EFFECT_TYPES, DEFAULT_POWER_ASSIGNMENTS } from '../lib/types'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'

const RANK_ROWS: { key: PowerRankKey; label: string; color: string }[] = [
  { key: '10', label: '10', color: 'text-cyan-300' },
  { key: 'J', label: 'Jack', color: 'text-amber-300' },
  { key: 'Q', label: 'Queen', color: 'text-purple-300' },
  { key: 'K', label: 'King', color: 'text-red-300' },
  { key: 'JOKER', label: 'Joker', color: 'text-fuchsia-300' },
]

/** Floating card suits — decorative background elements */
const FLOATING_SUITS = [
  // Large accent pieces
  { emoji: '\u2660', x: '10%', y: '15%', delay: 0, dur: 6, size: 'text-4xl' },
  { emoji: '\u2665', x: '85%', y: '20%', delay: 1.4, dur: 7, size: 'text-4xl' },
  { emoji: '7', x: '18%', y: '82%', delay: 2.5, dur: 8, size: 'text-5xl font-bold' },
  { emoji: '\u2666', x: '78%', y: '78%', delay: 0.6, dur: 6.5, size: 'text-4xl' },
  // Medium scattered
  { emoji: '\u2663', x: '5%', y: '48%', delay: 1.0, dur: 5.5, size: 'text-3xl' },
  { emoji: '\u2660', x: '92%', y: '45%', delay: 2.2, dur: 6.2, size: 'text-3xl' },
  { emoji: '\u2665', x: '45%', y: '6%', delay: 3.0, dur: 7.5, size: 'text-2xl' },
  { emoji: '\u2666', x: '55%', y: '92%', delay: 0.4, dur: 5.8, size: 'text-2xl' },
  { emoji: '7', x: '88%', y: '8%', delay: 1.8, dur: 6.8, size: 'text-3xl font-bold' },
  // Small accents
  { emoji: '\u2663', x: '30%', y: '30%', delay: 3.5, dur: 5, size: 'text-xl' },
  { emoji: '\u2665', x: '70%', y: '55%', delay: 0.2, dur: 6.5, size: 'text-xl' },
  { emoji: '\u2660', x: '25%', y: '60%', delay: 2.8, dur: 5.3, size: 'text-lg' },
  { emoji: '\u2666', x: '65%', y: '35%', delay: 1.6, dur: 5.8, size: 'text-lg' },
  { emoji: '7', x: '50%', y: '50%', delay: 4.0, dur: 9, size: 'text-6xl font-bold' },
]

const springEntry = { type: 'spring' as const, stiffness: 300, damping: 24, mass: 0.7 }
const staggerContainer = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.15 },
  },
}
const staggerItem = {
  hidden: { opacity: 0, y: 16, scale: 0.95 },
  show: { opacity: 1, y: 0, scale: 1, transition: springEntry },
}

export default function Home() {
  const { user, loading: authLoading } = useAuth()
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [maxPlayers, setMaxPlayers] = useState(4)
  const [joinCode, setJoinCode] = useState('')
  const [mode, setMode] = useState<'menu' | 'create' | 'join'>('menu')
  const [busy, setBusy] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showFeedback, setShowFeedback] = useState(false)
  const [showPatchNotes, setShowPatchNotes] = useState(false)

  // Power settings state
  const [assignments, setAssignments] = useState<PowerAssignments>({ ...DEFAULT_POWER_ASSIGNMENTS })
  const [jokerCount, setJokerCount] = useState(DEFAULT_GAME_SETTINGS.jokerCount)
  const [deckSize, setDeckSize] = useState<DeckSize>(DEFAULT_GAME_SETTINGS.deckSize)
  const [turnSeconds, setTurnSeconds] = useState<TurnSeconds>(DEFAULT_GAME_SETTINGS.turnSeconds)
  const [peekAllowsOpponent, setPeekAllowsOpponent] = useState(DEFAULT_GAME_SETTINGS.peekAllowsOpponent)

  const updateAssignment = (key: PowerRankKey, value: PowerEffectType) => {
    setAssignments((prev) => ({ ...prev, [key]: value }))
  }

  const handleCreate = async () => {
    if (!name.trim()) return toast.error('Enter your name')
    if (!user) return toast.error('Authenticating...')
    setBusy(true)
    try {
      const gameId = await createGame(name.trim(), maxPlayers, {
        powerAssignments: assignments,
        jokerCount,
        deckSize,
        turnSeconds,
        peekAllowsOpponent,
      })
      trackEvent('create_game', { player_count: maxPlayers, deck_size: deckSize, turn_seconds: turnSeconds }, gameId)
      navigate(`/lobby/${gameId}`)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const handleJoin = async () => {
    if (!name.trim()) return toast.error('Enter your name')
    if (!joinCode.trim()) return toast.error('Enter a join code')
    if (!user) return toast.error('Authenticating...')
    setBusy(true)
    try {
      const gameId = await findGameByCode(joinCode.trim().toUpperCase())
      if (!gameId) {
        toast.error('Game not found. Check the code and try again.')
        setBusy(false)
        return
      }
      await joinGame(gameId, name.trim())
      trackEvent('join_game', { join_code_used: true }, gameId)
      navigate(`/lobby/${gameId}`)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (authLoading) {
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

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      {/* Floating decorative suits — gentle float animation */}
      {FLOATING_SUITS.map((suit, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{
            opacity: [0, 0.12, 0.18, 0.12, 0],
            scale: [0.8, 1, 1.08, 1, 0.8],
            y: [0, -20, -8, -25, 0],
            rotate: [0, 8, -5, 12, 0],
          }}
          transition={{
            duration: suit.dur,
            delay: suit.delay,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
          className={`fixed ${suit.size} text-muted-foreground/30 pointer-events-none select-none`}
          style={{ left: suit.x, top: suit.y }}
        >
          {suit.emoji}
        </motion.div>
      ))}

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={springEntry}
        className="w-full max-w-md relative z-10"
      >
        {/* Title with enhanced animation */}
        <div className="text-center mb-8">
          <motion.div
            initial={{ scale: 0.5, opacity: 0, rotateZ: -5 }}
            animate={{ scale: 1, opacity: 1, rotateZ: 0 }}
            transition={{ type: 'spring', stiffness: 200, damping: 15, mass: 0.8 }}
          >
            <h1 className="text-5xl font-bold bg-gradient-to-r from-amber-300 via-yellow-200 to-amber-400 bg-clip-text text-transparent mb-1 drop-shadow-sm">
              Lucky Seven{'\u2122'}
            </h1>
          </motion.div>
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, ...springEntry }}
            className="text-muted-foreground text-sm"
          >
            The card game where 7 means zero
          </motion.p>
          {/* Animated accent line */}
          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ delay: 0.5, type: 'spring', stiffness: 200, damping: 20 }}
            className="mx-auto mt-3 h-0.5 w-24 bg-gradient-to-r from-transparent via-amber-500/50 to-transparent"
          />
        </div>

        {/* Card container */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, ...springEntry }}
        >
          <Card className="p-6 border-border-subtle bg-surface-overlay backdrop-blur-sm shadow-2xl shadow-black/20 rounded-2xl">
            <AnimatePresence mode="wait">
              {mode === 'menu' && (
                <motion.div
                  key="menu"
                  variants={staggerContainer}
                  initial="hidden"
                  animate="show"
                  exit={{ opacity: 0, y: -10, transition: { duration: 0.15 } }}
                  className="space-y-3"
                >
                  <motion.div variants={staggerItem}>
                    <Button
                      onClick={() => setMode('create')}
                      variant="success"
                      className="w-full h-12 text-lg rounded-xl"
                    >
                      <span className="text-xl">{'\u{1F3B4}'}</span>
                      Create Game
                    </Button>
                  </motion.div>
                  <motion.div variants={staggerItem}>
                    <Button
                      onClick={() => setMode('join')}
                      className="w-full h-12 text-lg rounded-xl bg-indigo-600 hover:bg-indigo-500 shadow-lg shadow-indigo-600/15"
                    >
                      <span className="text-xl">{'\u{1F91D}'}</span>
                      Join Game
                    </Button>
                  </motion.div>
                  <motion.div variants={staggerItem}>
                    <HowToPlay variant="large" />
                  </motion.div>
                </motion.div>
              )}

              {mode === 'create' && (
                <motion.div
                  key="create"
                  initial={{ opacity: 0, x: 30 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -30, transition: { duration: 0.15 } }}
                  transition={springEntry}
                  className="space-y-4"
                >
                  <Button
                    variant="ghost"
                    onClick={() => setMode('menu')}
                    className="h-auto px-0 text-muted-foreground hover:text-foreground text-sm"
                  >
                    {'\u2190'} Back
                  </Button>

                  <div className="ls-form-group">
                    <Label htmlFor="create-name">Your Name</Label>
                    <Input
                      id="create-name"
                      type="text"
                      name="playerName"
                      autoComplete="off"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Enter your name"
                      maxLength={20}
                    />
                  </div>

                  <div className="ls-form-group">
                    <Label>Max Players</Label>
                    <div className="flex gap-1.5 flex-wrap">
                      {[2, 3, 4, 5, 6, 7, 8].map((n) => (
                        <motion.button
                          key={n}
                          whileHover={{ scale: 1.08 }}
                          whileTap={{ scale: 0.92 }}
                          onClick={() => {
                            setMaxPlayers(n)
                            if (n >= 7 && deckSize === 1) {
                              toast('Tip: 7+ players work best with 1.5\u00d7 or 2\u00d7 deck!', { icon: '\u{1F4A1}' })
                            } else if (n >= 5 && deckSize === 1) {
                              toast('Tip: 5+ players may run low on cards. Consider 1.5\u00d7 deck.', { icon: '\u{1F4A1}' })
                            }
                          }}
                          className={`flex-1 min-w-[40px] py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                            maxPlayers === n
                              ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                              : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                          }`}
                        >
                          {n}
                        </motion.button>
                      ))}
                    </div>
                  </div>

                  <div className="ls-form-group">
                    <Label>Deck Size</Label>
                    <div className="flex gap-2">
                      {([1, 1.5, 2] as DeckSize[]).map((ds) => (
                        <motion.button
                          key={ds}
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => setDeckSize(ds)}
                          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                            deckSize === ds
                              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                              : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                          }`}
                        >
                          {ds === 1 ? '1\u00d7' : ds === 1.5 ? '1.5\u00d7' : '2\u00d7'}
                        </motion.button>
                      ))}
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      {deckSize === 1 ? '54 cards (standard)' : deckSize === 1.5 ? '~81 cards (1 full + 27 extra)' : '~108 cards (double deck)'}
                    </p>
                  </div>

                  <div className="ls-form-group">
                    <Label>Turn Timer</Label>
                    <div className="flex gap-1.5">
                      {([0, 30, 60, 90, 120] as TurnSeconds[]).map((ts) => (
                        <motion.button
                          key={ts}
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => setTurnSeconds(ts)}
                          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                            turnSeconds === ts
                              ? 'bg-amber-600 text-white shadow-md shadow-amber-600/30'
                              : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                          }`}
                        >
                          {ts === 0 ? 'Off' : `${ts}s`}
                        </motion.button>
                      ))}
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      {turnSeconds === 0 ? 'No time limit per turn' : `${turnSeconds}s per turn — AFK players get auto-skipped, then kicked`}
                    </p>
                  </div>

                  {/* Power Settings accordion */}
                  <div className="rounded-xl border border-border-subtle overflow-hidden">
                    <motion.button
                      whileTap={{ scale: 0.99 }}
                      onClick={() => setShowSettings(!showSettings)}
                      className="w-full flex items-center justify-between px-4 py-2.5 bg-surface-panel hover:bg-secondary/80 transition-colors cursor-pointer"
                    >
                      <span className="text-sm font-medium text-foreground">Power Settings</span>
                      <motion.span
                        animate={{ rotate: showSettings ? 180 : 0 }}
                        transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                        className="text-muted-foreground"
                      >
                        {'\u25BC'}
                      </motion.span>
                    </motion.button>

                    <AnimatePresence initial={false}>
                      {showSettings && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ type: 'spring', stiffness: 300, damping: 28, mass: 0.6 }}
                          className="overflow-hidden"
                        >
                          <Separator />
                          <div className="p-4 space-y-3">
                            {RANK_ROWS.map((row) => (
                              <div key={row.key} className="ls-form-group">
                                <Label className={row.color}>
                                  {row.label} Power
                                </Label>
                                <Select
                                  value={assignments[row.key]}
                                  onValueChange={(v) => updateAssignment(row.key, v as PowerEffectType)}
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
                                    onClick={() => setJokerCount(n)}
                                    className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                                      jokerCount === n
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

                            <div className="ls-form-group">
                              <Label className="text-amber-300">
                                Peek Allows Opponent
                              </Label>
                              <div className="flex gap-2">
                                {([false, true] as const).map((val) => (
                                  <motion.button
                                    key={String(val)}
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                    onClick={() => setPeekAllowsOpponent(val)}
                                    className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                                      peekAllowsOpponent === val
                                        ? 'bg-amber-600 text-white'
                                        : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                                    }`}
                                  >
                                    {val ? 'Yes' : 'No'}
                                  </motion.button>
                                ))}
                              </div>
                              <p className="text-[10px] text-muted-foreground">
                                {peekAllowsOpponent ? 'Peek powers can target your cards OR opponent cards' : 'Peek powers only peek your own cards (default)'}
                              </p>
                            </div>

                            <div className="bg-surface-panel rounded-lg p-2">
                              <p className="text-[10px] text-amber-400/80 font-medium">
                                Powers can be used every time you draw that card type. Any rank can be assigned any effect!
                              </p>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  <Button
                    variant="success"
                    onClick={handleCreate}
                    disabled={busy}
                    className="w-full h-11 rounded-xl text-base"
                  >
                    {busy ? 'Creating...' : 'Create Game'}
                  </Button>
                </motion.div>
              )}

              {mode === 'join' && (
                <motion.div
                  key="join"
                  initial={{ opacity: 0, x: 30 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -30, transition: { duration: 0.15 } }}
                  transition={springEntry}
                  className="space-y-4"
                >
                  <Button
                    variant="ghost"
                    onClick={() => setMode('menu')}
                    className="h-auto px-0 text-muted-foreground hover:text-foreground text-sm"
                  >
                    {'\u2190'} Back
                  </Button>

                  <div className="ls-form-group">
                    <Label htmlFor="join-name">Your Name</Label>
                    <Input
                      id="join-name"
                      type="text"
                      name="playerName"
                      autoComplete="off"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Enter your name"
                      maxLength={20}
                    />
                  </div>

                  <div className="ls-form-group">
                    <Label htmlFor="join-code">Join Code</Label>
                    <Input
                      id="join-code"
                      type="text"
                      value={joinCode}
                      onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                      placeholder="e.g. ABC123"
                      maxLength={6}
                      className="uppercase tracking-widest text-center text-lg font-mono"
                    />
                  </div>

                  <Button
                    onClick={handleJoin}
                    disabled={busy}
                    className="w-full h-11 rounded-xl text-base bg-indigo-600 hover:bg-indigo-500 shadow-lg shadow-indigo-600/15"
                  >
                    {busy ? 'Joining...' : 'Join Game'}
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="text-center mt-6 space-y-1"
        >
          <p className="text-xs text-muted-foreground">
            2-8 players &middot; Lowest score wins &middot; Sevens are worth zero!
          </p>
          <div className="flex items-center justify-center gap-3">
            <motion.button
              whileHover={{ scale: 1.05 }}
              onClick={() => setShowPatchNotes(true)}
              className="text-xs text-indigo-400 hover:text-indigo-300 cursor-pointer"
            >
              Patch Notes
            </motion.button>
            <span className="text-border-subtle">|</span>
            <motion.button
              whileHover={{ scale: 1.05 }}
              onClick={() => setShowFeedback(true)}
              className="text-xs text-amber-600 hover:text-amber-400 cursor-pointer"
            >
              Send Feedback
            </motion.button>
          </div>
        </motion.div>

        {/* Game Statistics */}
        <GameStats />

        {/* Strategy Tips */}
        <StrategyTips />
      </motion.div>

      <FeedbackModal open={showFeedback} onClose={() => setShowFeedback(false)} />
      <PatchNotesModal open={showPatchNotes} onClose={() => setShowPatchNotes(false)} />
      <VersionLabel />

      {/* Watermark */}
      <div className="fixed bottom-2 right-3 text-xs md:text-sm font-medium pointer-events-none select-none z-10" style={{ color: 'var(--watermark)' }}>
        Built by Kamal Hazriq
      </div>
    </div>
  )
}
