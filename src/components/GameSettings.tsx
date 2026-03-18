import { useState, useEffect, useCallback } from 'react'
import Tooltip from './Tooltip'
import { isSfxEnabled, setSfxEnabled, isHapticEnabled, setHapticEnabled } from '../lib/sfx'
import { useReducedMotion } from '../hooks/useReducedMotion'
import { useTheme, type Theme } from '../hooks/useTheme'

export default function GameSettings() {
  const [sfx, setSfxState] = useState(isSfxEnabled)
  const [haptic, setHapticState] = useState(isHapticEnabled)
  const { reduced, pref, cycle } = useReducedMotion()
  const { theme, setTheme } = useTheme()
  const hasVibrate = typeof navigator !== 'undefined' && 'vibrate' in navigator
  const syncStoredPreferences = useCallback(() => {
    setSfxState(isSfxEnabled())
    setHapticState(isHapticEnabled())
  }, [])

  // Sync local state
  useEffect(() => {
    syncStoredPreferences()
  }, [syncStoredPreferences])

  const toggleSfx = () => {
    const next = !sfx
    setSfxEnabled(next)
    setSfxState(next)
  }

  const toggleHaptic = () => {
    const next = !haptic
    setHapticEnabled(next)
    setHapticState(next)
  }

  const motionLabel = pref === 'system' ? 'Sys' : pref === 'on' ? 'Low' : 'Full'
  const motionTooltip = pref === 'system'
    ? `Motion: System (follows device setting \u2014 currently ${reduced ? 'reduced' : 'full'})`
    : pref === 'on'
      ? 'Motion: Reduced (fewer animations)'
      : 'Motion: Full (all animations)'

  return (
    <div className="flex items-center gap-1">
      {/* Theme dropdown */}
      <select
        value={theme}
        onChange={(e) => setTheme(e.target.value as Theme)}
        className="min-h-[44px] px-2 rounded-lg text-xs font-medium cursor-pointer bg-slate-800/60 border border-slate-700/40 text-slate-300 focus:outline-none focus:border-amber-500 transition-colors appearance-none"
        style={{ backgroundImage: 'none' }}
        aria-label="Select theme"
      >
        <option value="blue">{'\u{1F30A}'} Blue</option>
        <option value="dark">{'\u{1F311}'} Dark</option>
        <option value="light">{'\u2600'} Light</option>
      </select>

      {/* Sound toggle */}
      <Tooltip text={sfx ? 'Sound effects are ON. Tap to mute.' : 'Sound effects are OFF. Tap to enable.'} position="bottom">
        <button
          onClick={toggleSfx}
          className={`min-w-[44px] min-h-[44px] flex items-center justify-center gap-1 px-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
            sfx
              ? 'bg-emerald-900/40 border border-emerald-600/40 text-emerald-400'
              : 'bg-slate-800/60 border border-slate-700/40 text-slate-500'
          }`}
          aria-label={sfx ? 'Sound effects on — tap to mute' : 'Sound effects off — tap to enable'}
          aria-pressed={sfx}
        >
          <span className="text-sm" aria-hidden="true">{sfx ? '\u{1F50A}' : '\u{1F507}'}</span>
          <span className="hidden sm:inline">{sfx ? 'On' : 'Off'}</span>
        </button>
      </Tooltip>

      {/* Haptics toggle */}
      {hasVibrate && (
        <Tooltip text={haptic ? 'Vibration is ON. Tap to disable.' : 'Vibration is OFF. Tap to enable.'} position="bottom">
          <button
            onClick={toggleHaptic}
            className={`min-w-[44px] min-h-[44px] flex items-center justify-center gap-1 px-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              haptic
                ? 'bg-purple-900/40 border border-purple-600/40 text-purple-400'
                : 'bg-slate-800/60 border border-slate-700/40 text-slate-500'
            }`}
            aria-label={haptic ? 'Vibration on — tap to disable' : 'Vibration off — tap to enable'}
            aria-pressed={haptic}
          >
            <span className="text-sm" aria-hidden="true">{haptic ? '\u{1F4F3}' : '\u{1F4F4}'}</span>
            <span className="hidden sm:inline">{haptic ? 'On' : 'Off'}</span>
          </button>
        </Tooltip>
      )}

      {/* Reduced motion toggle */}
      <Tooltip text={motionTooltip} position="bottom">
        <button
          onClick={cycle}
          className={`min-w-[44px] min-h-[44px] flex items-center justify-center gap-1 px-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
            reduced
              ? 'bg-amber-900/40 border border-amber-600/40 text-amber-400'
              : 'bg-slate-800/60 border border-slate-700/40 text-slate-500'
          }`}
          aria-label={`${motionTooltip}. Tap to cycle.`}
        >
          <span className="text-sm" aria-hidden="true">{reduced ? '\u{23F8}' : '\u{25B6}'}</span>
          <span className="hidden sm:inline">{motionLabel}</span>
        </button>
      </Tooltip>
    </div>
  )
}
