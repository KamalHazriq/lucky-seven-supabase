import { motion } from 'framer-motion'

interface LoadingScreenProps {
  message?: string
}

export function GameLoadingScreen({ message }: LoadingScreenProps) {
  return (
    <div className="min-h-dvh flex items-center justify-center">
      <div className="text-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full mx-auto mb-4"
        />
        {message && <p className="text-amber-300 font-medium">{message}</p>}
      </div>
    </div>
  )
}

interface KickedScreenProps {
  onGoHome: () => void
}

interface ErrorScreenProps {
  title?: string
  message: string
  onRetry?: () => void
  onGoHome: () => void
}

export function GameErrorScreen({ title = 'Could not load the game', message, onRetry, onGoHome }: ErrorScreenProps) {
  return (
    <div className="min-h-dvh flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 24 }}
        className="text-center max-w-sm p-6 rounded-2xl border backdrop-blur-sm"
        style={{ background: 'var(--surface-solid)', borderColor: 'var(--border)' }}
      >
        <h2 className="text-2xl font-bold text-foreground mb-2">{title}</h2>
        <p className="text-sm mb-5 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          {message}
        </p>
        <div className="flex flex-col gap-2">
          {onRetry && (
            <button
              onClick={onRetry}
              className="px-6 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-900 font-bold rounded-xl transition-colors"
            >
              Retry
            </button>
          )}
          <button
            onClick={onGoHome}
            className="px-6 py-2.5 rounded-xl border transition-colors"
            style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
          >
            Go Home
          </button>
        </div>
      </motion.div>
    </div>
  )
}

export function GameKickedScreen({ onGoHome }: KickedScreenProps) {
  return (
    <div
      className="min-h-dvh flex items-center justify-center p-4"
      style={{ background: 'radial-gradient(ellipse at center, rgba(220,38,38,0.12) 0%, transparent 70%)' }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 20 }}
        className="text-center max-w-sm p-8 rounded-2xl border backdrop-blur-sm"
        style={{ background: 'var(--surface-solid)', borderColor: 'rgba(220,38,38,0.3)' }}
      >
        <div className="text-7xl mb-4">😂</div>
        <h2 className="text-2xl font-bold text-red-400 mb-2">You've been kicked!</h2>
        <p className="text-sm mb-6 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          Welp... who knows what you did to deserve that 🤷<br />
          The game goes on without you!
        </p>
        <button
          onClick={onGoHome}
          className="px-6 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-900 font-bold rounded-xl transition-colors"
        >
          Go Home
        </button>
      </motion.div>
    </div>
  )
}
