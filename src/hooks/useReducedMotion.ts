import { useState, useEffect, useSyncExternalStore, useCallback } from 'react'
import { getLocalStorageItem, setLocalStorageItem } from '../lib/browserStorage'

const STORAGE_KEY = 'lucky7_reduced_motion' // "system" | "on" | "off"
type Pref = 'system' | 'on' | 'off'

function getStoredPref(): Pref {
  const v = getLocalStorageItem(STORAGE_KEY)
  if (v === 'on' || v === 'off') return v
  return 'system'
}

function getOSPrefersReduced(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

// Subscribe to OS media query changes
function subscribeOS(cb: () => void) {
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}

export function useReducedMotion() {
  const [pref, setPref] = useState<Pref>(getStoredPref)
  const osReduced = useSyncExternalStore(subscribeOS, getOSPrefersReduced, () => false)

  const reduced = pref === 'on' ? true : pref === 'off' ? false : osReduced

  const setPrefAndStore = useCallback((p: Pref) => {
    setLocalStorageItem(STORAGE_KEY, p)
    setPref(p)
  }, [])

  // Cycle: system → on → off → system
  const cycle = useCallback(() => {
    setPrefAndStore(pref === 'system' ? 'on' : pref === 'on' ? 'off' : 'system')
  }, [pref, setPrefAndStore])

  // Listen for storage changes from other tabs
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setPref(getStoredPref())
    }
    window.addEventListener('storage', handler)
    return () => window.removeEventListener('storage', handler)
  }, [])

  return { reduced, pref, cycle }
}
