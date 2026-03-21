import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'
import { useAuth } from '../hooks/useAuth'
import { useGame } from '../hooks/useGame'
import { revealHand, subscribeReveals } from '../lib/supabaseGameService'
import { writeGameSummary, playAgain, joinGame } from '../lib/supabaseGameService'
import CardView from '../components/CardView'
import VersionLabel from '../components/VersionLabel'
import { GameErrorScreen, GameLoadingScreen } from '../components/GameStatusScreen'
import { playSfx, vibrate } from '../lib/sfx'
import { trackEvent } from '../lib/analytics'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import type { PlayerScore } from '../lib/types'

// ─── Confetti (lightweight, no external deps) ──────────────────
interface Particle {
  x: number; y: number; vx: number; vy: number
  color: string; size: number; rotation: number; rv: number
  opacity: number
}

function useConfetti(trigger: boolean) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  const fire = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = window.innerWidth
    canvas.height = window.innerHeight

    const colors = ['#fbbf24', '#f59e0b', '#ef4444', '#10b981', '#6366f1', '#ec4899', '#8b5cf6', '#14b8a6']
    const particles: Particle[] = []

    // Spawn two bursts from left and right
    for (let burst = 0; burst < 2; burst++) {
      const originX = burst === 0 ? canvas.width * 0.25 : canvas.width * 0.75
      const originY = canvas.height * 0.35
      for (let i = 0; i < 80; i++) {
        const angle = (Math.random() - 0.5) * Math.PI * 1.2 - Math.PI / 2
        const speed = 4 + Math.random() * 8
        particles.push({
          x: originX,
          y: originY,
          vx: Math.cos(angle) * speed * (burst === 0 ? 1 : -1) * (0.3 + Math.random()),
          vy: Math.sin(angle) * speed - 2,
          color: colors[Math.floor(Math.random() * colors.length)],
          size: 3 + Math.random() * 5,
          rotation: Math.random() * 360,
          rv: (Math.random() - 0.5) * 12,
          opacity: 1,
        })
      }
    }

    let animId: number
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      let alive = false
      for (const p of particles) {
        p.vy += 0.15 // gravity
        p.x += p.vx
        p.y += p.vy
        p.vx *= 0.99
        p.rotation += p.rv
        p.opacity -= 0.006
        if (p.opacity <= 0) continue
        alive = true
        ctx.save()
        ctx.globalAlpha = p.opacity
        ctx.translate(p.x, p.y)
        ctx.rotate((p.rotation * Math.PI) / 180)
        ctx.fillStyle = p.color
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6)
        ctx.restore()
      }
      if (alive) {
        animId = requestAnimationFrame(animate)
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height)
      }
    }
    animId = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(animId)
  }, [])

  useEffect(() => {
    if (trigger) {
      const cleanup = fire()
      return cleanup
    }
  }, [trigger, fire])

  return canvasRef
}

// ─── Component ──────────────────────────────────────────────────
export default function Results() {
  const { gameId } = useParams<{ gameId: string }>()
  const { user } = useAuth()
  const { game, players, loading, error, retry } = useGame(gameId, user?.uid)
  const navigate = useNavigate()
  const [scores, setScores] = useState<PlayerScore[]>([])
  const [playAgainBusy, setPlayAgainBusy] = useState(false)
  const summaryWritten = useRef(false)
  const autoJoinedRef = useRef(false)
  const celebratedRef = useRef(false)

  // Compute derived state (safe before early return)
  const totalPlayers = game?.playerOrder?.length ?? 0
  const allRevealed = totalPlayers > 0 && scores.length >= totalPlayers

  // Confetti canvas — must be called before any early return (rules of hooks)
  const confettiRef = useConfetti(allRevealed)

  // Subscribe to reveals in real-time (players reveal asynchronously)
  useEffect(() => {
    if (!gameId) return
    const unsub = subscribeReveals(gameId, setScores)
    return unsub
  }, [gameId])

  // Also reveal own hand when landing on results page directly
  useEffect(() => {
    if (gameId && game?.status === 'finished') {
      revealHand(gameId).catch(console.error)
    }
  }, [gameId, game?.status])

  // Write game summary analytics once (host only, one write per game)
  useEffect(() => {
    if (!gameId || !game || !user || summaryWritten.current) return
    if (game.status !== 'finished') return
    if (game.hostId !== user.uid) return // only host writes summary
    if (scores.length < game.playerOrder.length) return // wait for all reveals
    summaryWritten.current = true
    writeGameSummary(gameId, scores, game)
    trackEvent('game_finished', { player_count: game.playerOrder.length, turns: game.actionVersion }, gameId)
  }, [gameId, game, user, scores])


  // Auto-redirect all players when someone initiates a rematch
  useEffect(() => {
    const rematchId = game?.rematchLobbyId
    if (!rematchId || !user || !gameId || autoJoinedRef.current) return
    autoJoinedRef.current = true
    const myPlayer = players[user.uid]
    const displayName = myPlayer?.displayName ?? 'Player'
    const colorKey = myPlayer?.colorKey
    setPlayAgainBusy(true)
    joinGame(rematchId, displayName, colorKey)
      .then(() => navigate(`/lobby/${rematchId}`))
      .catch(() => navigate(`/lobby/${rematchId}`))
  }, [game?.rematchLobbyId, user, gameId, players, navigate])

  useEffect(() => {
    if (!allRevealed || celebratedRef.current) return
    celebratedRef.current = true
    const timer = setTimeout(() => {
      playSfx('celebrate')
      vibrate(150)
    }, 400)
    return () => clearTimeout(timer)
  }, [allRevealed])

  if (loading) {
    return <GameLoadingScreen />
  }

  if (!game) {
    return (
      <GameErrorScreen
        title="Could not load results"
        message={error ?? 'The results screen is unavailable right now.'}
        onRetry={() => void retry()}
        onGoHome={() => navigate('/')}
      />
    )
  }

  // Multi-winner tie handling:
  // 1. Find minimum score
  // 2. If tied on score, use most sevens as tiebreaker
  // 3. If still tied, all are winners (shared win)
  const winnerIds = new Set<string>()
  if (allRevealed && scores.length > 0) {
    const minScore = scores[0].total
    const tiedPlayers = scores.filter((s) => s.total === minScore)
    if (tiedPlayers.length === 1) {
      winnerIds.add(tiedPlayers[0].playerId)
    } else {
      const maxSevens = Math.max(...tiedPlayers.map((s) => s.sevens))
      const sevensWinners = tiedPlayers.filter((s) => s.sevens === maxSevens)
      for (const w of sevensWinners) winnerIds.add(w.playerId)
    }
  }
  const isSharedWin = winnerIds.size > 1

  // Winner names for display
  const winnerNames = allRevealed
    ? Array.from(winnerIds).map((id) => {
        const s = scores.find((sc) => sc.playerId === id)
        return s?.displayName ?? 'Unknown'
      })
    : []

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative">
      {/* Confetti canvas — full viewport overlay */}
      <canvas
        ref={confettiRef}
        className="fixed inset-0 pointer-events-none z-50"
        style={{ width: '100vw', height: '100vh' }}
      />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-2xl relative z-10"
      >
        <div className="text-center mb-6">
          <motion.h1
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            className="text-4xl font-bold text-primary mb-2"
          >
            Game Over!
          </motion.h1>
          {!allRevealed && (
            <motion.p
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="text-muted-foreground text-sm"
            >
              Waiting for all players to reveal... ({scores.length}/{totalPlayers})
            </motion.p>
          )}
          {allRevealed && winnerNames.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              {isSharedWin ? (
                <p className="text-primary text-base font-semibold">
                  🏆 Shared Win! {winnerNames.join(' & ')} are the champions! 🏆
                </p>
              ) : (
                <p className="text-primary text-base font-semibold">
                  🏆 {winnerNames[0]} wins! 🏆
                </p>
              )}
            </motion.div>
          )}
          {allRevealed && game.endCalledBy && (
            <p className="text-muted-foreground text-sm mt-1">
              Game ended by {players[game.endCalledBy]?.displayName ?? 'a player'}
            </p>
          )}
        </div>

        <div className="space-y-4">
          {scores.map((score, rank) => {
            const isWinner = allRevealed && winnerIds.has(score.playerId)
            const isYou = score.playerId === user?.uid

            return (
              <motion.div
                key={score.playerId}
                initial={{ opacity: 0, x: -30 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: rank * 0.15 }}
                className={`
                  rounded-2xl p-4 border backdrop-blur-sm
                  ${isWinner
                    ? 'bg-amber-900/25 border-amber-500/40 shadow-lg shadow-amber-500/10'
                    : isYou
                      ? 'bg-amber-900/10 border-amber-500/25'
                      : 'bg-surface-panel border-border-subtle'
                  }
                `}
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className={`
                    w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold
                    ${isWinner
                      ? 'bg-gradient-to-br from-amber-400 to-amber-600 text-amber-900'
                      : 'bg-secondary text-muted-foreground'
                    }
                  `}>
                    {rank + 1}
                  </div>
                  <div>
                    <span className={`font-semibold ${isYou ? 'text-primary' : 'text-foreground'}`}>
                      {score.displayName}
                      {isYou && (
                        <Badge variant="outline" className="ml-1.5 px-1.5 py-0.5 bg-primary/20 border-primary/40 text-primary text-[10px] font-bold align-middle">
                          YOU
                        </Badge>
                      )}
                    </span>
                    {isWinner && (
                      <span className="block text-xs text-primary font-medium">
                        {isSharedWin ? 'Shared Win!' : 'Winner!'}
                      </span>
                    )}
                  </div>
                  <div className="ml-auto text-right">
                    <span className={`text-2xl font-bold ${isWinner ? 'text-primary' : 'text-foreground'}`}>
                      {score.total}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {score.sevens > 0 ? `${score.sevens} seven${score.sevens > 1 ? 's' : ''}` : 'no sevens'}
                    </span>
                  </div>
                </div>

                <div className="flex gap-2 justify-center">
                  {score.hand.map((card, i) => (
                    <CardView key={i} card={card} faceUp size="md" />
                  ))}
                </div>
              </motion.div>
            )
          })}
        </div>

        <Separator className="my-6" />

        <div className="flex items-center justify-center gap-3">
          <Button
            variant="success"
            onClick={async () => {
              if (playAgainBusy || !gameId) return
              setPlayAgainBusy(true)
              try {
                const myPlayer = players[user?.uid ?? '']
                const myName = myPlayer?.displayName ?? 'Player'
                const myColorKey = myPlayer?.colorKey
                const maxP = game?.maxPlayers ?? 4
                const targetId = await playAgain(gameId, myName, maxP, game?.settings ?? {}, myColorKey)
                trackEvent('rematch_clicked', {}, gameId)
                navigate(`/lobby/${targetId}`)
              } catch (e) {
                toast.error((e as Error).message)
                setPlayAgainBusy(false)
              }
            }}
            disabled={playAgainBusy}
            className="px-8 h-12 rounded-xl text-base"
          >
            {playAgainBusy ? 'Joining...' : 'Play Again'}
          </Button>
          <Button
            variant="outline"
            onClick={() => navigate('/')}
            className="px-6 h-12 rounded-xl text-base"
          >
            Home
          </Button>
        </div>
      </motion.div>

      <VersionLabel />

      {/* Watermark */}
      <div className="fixed bottom-2 right-3 text-xs md:text-sm font-medium pointer-events-none select-none z-10" style={{ color: 'var(--watermark)' }}>
        Built by Kamal Hazriq
      </div>

    </div>
  )
}
