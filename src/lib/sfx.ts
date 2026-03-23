/**
 * WebAudio oscillator-based sound effects — no external audio files needed.
 *
 * File-based override (future): place .mp3/.ogg files in /public/sfx/<name>.mp3
 * and swap beep() calls for new Audio('/sfx/<name>.mp3').play().
 * Key names match SFX object keys: draw, take, swap, discard, lock, unlock,
 *   peek, peekAll, chaos, kick, endGame, error.
 */
import { getLocalStorageItem, setLocalStorageItem } from './browserStorage'

let ctx: AudioContext | null = null

function getCtx(): AudioContext | null {
  if (!ctx) {
    try {
      if (typeof window === 'undefined') return null
      const AudioContextCtor = window.AudioContext
        ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!AudioContextCtor) return null
      ctx = new AudioContextCtor()
    } catch {
      return null
    }
  }
  // Resume after browser autoplay suspension (requires prior user interaction)
  if (ctx.state === 'suspended') void ctx.resume().catch(() => {})
  return ctx
}

function beep(freq: number, duration: number, type: OscillatorType = 'sine', volume = 0.08) {
  const c = getCtx()
  if (!c) return
  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.type = type
  osc.frequency.value = freq
  gain.gain.value = volume * getSfxVolume()
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration)
  osc.connect(gain)
  gain.connect(c.destination)
  osc.start()
  osc.stop(c.currentTime + duration)
}

export const SFX = {
  /** Draw from pile — bright short tick */
  draw:    () => beep(660, 0.08, 'sine', 0.06),

  /** Take from discard — warmer double-blip, distinct from draw */
  take:    () => { beep(520, 0.06, 'sine', 0.06); setTimeout(() => beep(640, 0.08, 'sine', 0.05), 50) },

  /** Swap card into a slot — two-tone square blip */
  swap:    () => { beep(440, 0.06, 'square', 0.04); setTimeout(() => beep(550, 0.06, 'square', 0.04), 60) },

  /** Discard drawn card */
  discard: () => beep(330, 0.1, 'triangle', 0.05),

  /** Lock a card */
  lock:    () => { beep(220, 0.1, 'sawtooth', 0.04); setTimeout(() => beep(180, 0.15, 'sawtooth', 0.03), 80) },

  /** Unlock a card */
  unlock:  () => { beep(440, 0.06, 'sine', 0.05); setTimeout(() => beep(660, 0.08, 'sine', 0.05), 70) },

  /** Peek at one card — soft high curiosity tone */
  peek:    () => { beep(900, 0.05, 'sine', 0.04); setTimeout(() => beep(1100, 0.07, 'sine', 0.035), 65) },

  /** Peek at all three cards — ascending triple chime */
  peekAll: () => {
    beep(880, 0.05, 'sine', 0.04)
    setTimeout(() => beep(1100, 0.05, 'sine', 0.04), 65)
    setTimeout(() => beep(1320, 0.08, 'sine', 0.04), 130)
  },

  /** Chaos / rearrange power — rapid descending scramble */
  chaos:   () => {
    beep(660, 0.04, 'square', 0.04)
    setTimeout(() => beep(550, 0.04, 'square', 0.04), 55)
    setTimeout(() => beep(440, 0.04, 'square', 0.04), 110)
    setTimeout(() => beep(330, 0.07, 'square', 0.03), 165)
  },

  /** Shuffle — rapid card-riffle effect for chaos animation */
  shuffle: () => {
    const steps = 8
    for (let i = 0; i < steps; i++) {
      const freq = 300 + Math.random() * 400
      const delay = i * 90 + Math.random() * 30
      setTimeout(() => beep(freq, 0.03, 'triangle', 0.03), delay)
    }
    // Settle tone
    setTimeout(() => beep(440, 0.1, 'sine', 0.04), steps * 90 + 40)
  },

  /** Player kicked or left the game */
  kick:    () => { beep(440, 0.1, 'triangle', 0.05); setTimeout(() => beep(330, 0.14, 'triangle', 0.04), 110) },

  /** End of round fanfare */
  endGame: () => {
    beep(523, 0.12, 'sine', 0.06)
    setTimeout(() => beep(659, 0.12, 'sine', 0.06), 120)
    setTimeout(() => beep(784, 0.2, 'sine', 0.06), 240)
  },

  /** Victory celebration — longer ascending fanfare with harmonics */
  celebrate: () => {
    beep(523, 0.14, 'sine', 0.07)
    setTimeout(() => beep(659, 0.14, 'sine', 0.07), 130)
    setTimeout(() => beep(784, 0.14, 'sine', 0.07), 260)
    setTimeout(() => beep(1047, 0.25, 'sine', 0.08), 400)
    setTimeout(() => beep(1047, 0.12, 'triangle', 0.04), 420)
    setTimeout(() => beep(1319, 0.3, 'sine', 0.06), 560)
  },

  /** Error / invalid action */
  error:   () => { beep(200, 0.1, 'square', 0.05); setTimeout(() => beep(160, 0.15, 'square', 0.04), 100) },
}

// ─── Persistence ────────────────────────────────────────────
const SFX_KEY    = 'lucky7_sfx_enabled'
const HAPTIC_KEY = 'lucky7_haptic_enabled'
const PERF_KEY   = 'lucky7_perf_mode'
const VOL_KEY    = 'lucky7_sfx_volume'

export function isSfxEnabled(): boolean {
  return getLocalStorageItem(SFX_KEY) === 'true'
}

export function setSfxEnabled(v: boolean) {
  setLocalStorageItem(SFX_KEY, v ? 'true' : 'false')
}

/** Volume 0–1, default 0.7 */
export function getSfxVolume(): number {
  const raw = getLocalStorageItem(VOL_KEY)
  if (raw === null) return 0.7
  const n = parseFloat(raw)
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0.7
}

export function setSfxVolume(v: number) {
  setLocalStorageItem(VOL_KEY, String(Math.max(0, Math.min(1, v))))
}

export function isHapticEnabled(): boolean {
  return getLocalStorageItem(HAPTIC_KEY) === 'true'
}

export function setHapticEnabled(v: boolean) {
  setLocalStorageItem(HAPTIC_KEY, v ? 'true' : 'false')
}

export function playSfx(name: keyof typeof SFX) {
  if (!isSfxEnabled()) return
  SFX[name]()
}

export function vibrate(ms = 30) {
  if (!isHapticEnabled()) return
  navigator.vibrate?.(ms)
}

export function isPerformanceModeEnabled(): boolean {
  return getLocalStorageItem(PERF_KEY) === 'true'
}

export function setPerformanceModeEnabled(v: boolean) {
  setLocalStorageItem(PERF_KEY, v ? 'true' : 'false')
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('lucky7_perf_change'))
  }
}
