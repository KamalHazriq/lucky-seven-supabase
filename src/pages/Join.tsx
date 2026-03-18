import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'
import { useAuth } from '../hooks/useAuth'
import { useGame } from '../hooks/useGame'
import { findGameByCode, joinGame } from '../lib/supabaseGameService'
import { LOBBY_COLORS } from '../lib/playerColors'
import { trackEvent } from '../lib/analytics'
import type { PlayerDoc } from '../lib/types'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'

const springEntry = { type: 'spring' as const, stiffness: 300, damping: 24, mass: 0.7 }

/**
 * /join?code=XXXXXX — invite link join page.
 * Shows a name + color picker modal BEFORE joining.
 * Validates uniqueness against existing lobby players.
 */
export default function Join() {
  const [searchParams] = useSearchParams()
  const code = searchParams.get('code')?.toUpperCase() ?? ''
  const { user, loading: authLoading } = useAuth()
  const navigate = useNavigate()

  const [error, setError] = useState<string | null>(() => (code ? null : 'No join code provided.'))
  const [gameId, setGameId] = useState<string | null>(null)
  const [resolving, setResolving] = useState(() => !!code)
  const [resolveAttempt, setResolveAttempt] = useState(0)
  const resolved = useRef(false)

  // Subscribe to lobby data once we have a gameId (to see taken names/colors)
  const { game, players } = useGame(gameId ?? undefined, undefined)

  // Form state
  const [name, setName] = useState(
    () => localStorage.getItem('lucky7_playerName') ?? '',
  )
  const [selectedColor, setSelectedColor] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const failResolve = useCallback((message: string) => {
    setError(message)
    setResolving(false)
  }, [])
  const completeResolve = useCallback((id: string) => {
    setGameId(id)
    setError(null)
    setResolving(false)
  }, [])

  // Step 1: Resolve join code → gameId
  useEffect(() => {
    if (!code || authLoading || !user) return
    if (resolved.current) return
    resolved.current = true

    ;(async () => {
      try {
        const id = await findGameByCode(code)
        if (!id) {
          failResolve('Game not found. The code may have expired or be incorrect.')
          return
        }
        completeResolve(id)
      } catch (e) {
        failResolve((e as Error).message)
      }
    })()
  }, [code, authLoading, user, resolveAttempt, completeResolve, failResolve])

  // If user is already in the game, go straight to lobby
  useEffect(() => {
    if (game && user && game.playerOrder.includes(user.uid)) {
      navigate(`/lobby/${gameId}`, { replace: true })
    }
  }, [game, user, gameId, navigate])

  // Build taken names/colors from lobby players
  const existingPlayers = Object.values(players) as PlayerDoc[]
  const takenNames = new Set(existingPlayers.map((p) => p.displayName.toLowerCase()))
  const takenColors = new Map<number, string>()
  existingPlayers.forEach((p) => {
    if (p.colorKey != null) takenColors.set(p.colorKey, p.displayName)
  })

  const nameConflict = name.trim().length > 0 && takenNames.has(name.trim().toLowerCase())
  const lobbyFull = game ? game.playerOrder.length >= game.maxPlayers : false
  const gameStarted = game ? game.status !== 'lobby' : false

  const handleJoin = async () => {
    if (!gameId || !name.trim() || busy) return
    if (nameConflict) return toast.error('Name already taken in this lobby')
    if (selectedColor != null && takenColors.has(selectedColor)) {
      return toast.error('Color already taken')
    }
    if (lobbyFull) return toast.error('Game is full')
    if (gameStarted) return toast.error('Game already started')

    setBusy(true)
    try {
      await joinGame(gameId, name.trim(), selectedColor ?? undefined)
      trackEvent('join_game', { invite_link: true }, gameId)
      localStorage.setItem('lucky7_playerName', name.trim())
      navigate(`/lobby/${gameId}`, { replace: true })
    } catch (e) {
      toast.error((e as Error).message)
      setBusy(false)
    }
  }

  // ─── No code ───
  if (!code) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="p-6 text-center max-w-xs border-border-subtle bg-surface-overlay rounded-2xl">
          <p className="text-muted-foreground text-lg mb-4">No join code in the link.</p>
          <Button variant="outline" onClick={() => navigate('/')} className="rounded-xl">
            Go Home
          </Button>
        </Card>
      </div>
    )
  }

  // ─── Error ───
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="p-6 text-center max-w-xs border-border-subtle bg-surface-overlay rounded-2xl">
          <p className="text-red-400 text-lg font-medium mb-2">Failed to join</p>
          <p className="text-muted-foreground text-sm mb-4">{error}</p>
          <div className="flex items-center justify-center gap-2">
            <Button
              onClick={() => {
                resolved.current = false
                setError(null)
                setResolving(true)
                setResolveAttempt((attempt) => attempt + 1)
              }}
              className="rounded-xl bg-indigo-600 hover:bg-indigo-500"
            >
              Retry
            </Button>
            <Button variant="outline" onClick={() => navigate('/')} className="rounded-xl">
              Go Home
            </Button>
          </div>
        </Card>
      </div>
    )
  }

  // ─── Loading ───
  if (resolving || authLoading || !game) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center"
        >
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            className="w-8 h-8 border-2 border-emerald-400 border-t-transparent rounded-full mx-auto mb-4"
          />
          <p className="text-foreground text-sm">
            {authLoading ? 'Authenticating...' : `Finding game ${code}...`}
          </p>
        </motion.div>
      </div>
    )
  }

  // ─── Name + Color modal ───
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={springEntry}
        className="w-full max-w-sm"
      >
        <Card className="p-6 border-border-subtle bg-surface-overlay backdrop-blur-sm shadow-2xl shadow-black/20 rounded-2xl">
          <div className="text-center mb-5">
            <h2 className="text-xl font-bold text-primary mb-1">Join Game</h2>
            <p className="text-xs text-muted-foreground">
              Room <Badge variant="outline" className="font-mono font-bold text-emerald-400 border-emerald-500/30 bg-emerald-500/10 ml-1 px-1.5 py-0">{code}</Badge>
              {' '}&middot; {game.playerOrder.length}/{game.maxPlayers} players
            </p>
          </div>

          {lobbyFull ? (
            <div className="text-center py-4">
              <p className="text-red-400 font-medium mb-3">This lobby is full.</p>
              <Button variant="outline" onClick={() => navigate('/')} className="rounded-xl">
                Go Home
              </Button>
            </div>
          ) : gameStarted ? (
            <div className="text-center py-4">
              <p className="text-red-400 font-medium mb-3">This game has already started.</p>
              <Button variant="outline" onClick={() => navigate('/')} className="rounded-xl">
                Go Home
              </Button>
            </div>
          ) : (
            <>
              {/* Name */}
              <div className="ls-form-group mb-4">
                <Label htmlFor="join-player-name" className="uppercase tracking-wider">
                  Your Name
                </Label>
                <Input
                  id="join-player-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value.slice(0, 12))}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleJoin() }}
                  maxLength={12}
                  placeholder="Enter your name"
                  className={nameConflict ? 'border-red-500/60 focus-visible:border-red-500 focus-visible:ring-red-500/20' : ''}
                  autoFocus
                />
                {nameConflict && (
                  <p className="text-red-400 text-[11px]">Name already taken in this lobby</p>
                )}
              </div>

              {/* Color Picker */}
              <div className="ls-form-group mb-5">
                <Label className="uppercase tracking-wider">Pick a Color</Label>
                <div className="grid grid-cols-8 gap-2">
                  {LOBBY_COLORS.map((lc, idx) => {
                    const isMine = selectedColor === idx
                    const takenBy = takenColors.get(idx)
                    const isTaken = !!takenBy
                    return (
                      <motion.button
                        key={idx}
                        whileHover={!isTaken ? { scale: 1.2 } : undefined}
                        whileTap={!isTaken ? { scale: 0.85 } : undefined}
                        onClick={() => !isTaken && setSelectedColor(idx)}
                        disabled={isTaken}
                        className={`relative w-8 h-8 rounded-full border-2 transition-all ${
                          isMine
                            ? 'border-white scale-110 ring-2 ring-white/30 cursor-pointer'
                            : isTaken
                              ? 'border-transparent opacity-50 cursor-not-allowed'
                              : 'border-transparent cursor-pointer hover:border-white/30'
                        }`}
                        style={{ backgroundColor: lc.hex }}
                        title={isTaken ? `Taken by ${takenBy}` : lc.name}
                      >
                        {isTaken && (
                          <span className="absolute inset-0 flex items-center justify-center text-white font-bold text-xs pointer-events-none" style={{ textShadow: '0 0 3px rgba(0,0,0,0.9)' }}>{'\u2715'}</span>
                        )}
                      </motion.button>
                    )
                  })}
                </div>
              </div>

              <Separator className="mb-4" />

              {/* Actions */}
              <div className="flex gap-2">
                <Button
                  variant="success"
                  onClick={handleJoin}
                  disabled={!name.trim() || nameConflict || busy}
                  className="flex-1 h-11 rounded-xl"
                >
                  {busy ? 'Joining...' : 'Join Game'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => navigate('/')}
                  className="h-11 rounded-xl px-5"
                >
                  Cancel
                </Button>
              </div>
            </>
          )}
        </Card>
      </motion.div>
    </div>
  )
}
