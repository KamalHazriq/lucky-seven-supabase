import { useState, useCallback, useSyncExternalStore } from 'react'
import { getLocalStorageItem, setLocalStorageItem } from '../lib/browserStorage'

const STORAGE_KEY = 'lucky7_ui_mode'
export type UiMode = 'modal' | 'actionbar'

function getStoredMode(): UiMode {
  const v = getLocalStorageItem(STORAGE_KEY)
  if (v === 'actionbar') return 'actionbar'
  return 'modal'
}

/** Subscribe to viewport width changes for mobile detection */
function subscribeViewport(cb: () => void) {
  const mq = window.matchMedia('(min-width: 768px)')
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}

function getIsDesktop(): boolean {
  return window.matchMedia('(min-width: 768px)').matches
}

/**
 * UI mode hook: "modal" (classic modal) or "actionbar" (inline action bar).
 * Default: actionbar on desktop, modal on mobile.
 * Persisted in localStorage.
 */
export function useUiMode() {
  const isDesktop = useSyncExternalStore(subscribeViewport, getIsDesktop, () => true)

  const [stored, setStoredState] = useState<UiMode>(() => {
    const s = getStoredMode()
    // If no preference stored, default based on viewport
    if (!getLocalStorageItem(STORAGE_KEY)) return isDesktop ? 'actionbar' : 'modal'
    return s
  })

  // On mobile, force modal mode for compactness
  const uiMode: UiMode = isDesktop ? stored : 'modal'

  const setMode = useCallback((mode: UiMode) => {
    setLocalStorageItem(STORAGE_KEY, mode)
    setStoredState(mode)
  }, [])

  const toggleMode = useCallback(() => {
    const next = stored === 'modal' ? 'actionbar' : 'modal'
    setMode(next)
  }, [stored, setMode])

  return { uiMode, setMode, toggleMode, isDesktop }
}
