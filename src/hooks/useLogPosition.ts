import { useState, useCallback, useSyncExternalStore } from 'react'
import { getLocalStorageItem, setLocalStorageItem } from '../lib/browserStorage'

const STORAGE_KEY = 'lucky7_log_position'
export type LogPosition = 'bottom' | 'left'

function getStored(): LogPosition {
  const v = getLocalStorageItem(STORAGE_KEY)
  if (v === 'left') return 'left'
  return 'bottom'
}

/** Subscribe to viewport width for mobile detection */
function subscribeViewport(cb: () => void) {
  const mq = window.matchMedia('(min-width: 1024px)')
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}

function getCanUseSidebar(): boolean {
  return window.matchMedia('(min-width: 1024px)').matches
}

/**
 * useLogPosition — toggle between bottom (default) and left sidebar.
 * Forces bottom on screens < 1024px.
 */
export function useLogPosition() {
  const [stored, setStored] = useState<LogPosition>(getStored)
  const canSidebar = useSyncExternalStore(subscribeViewport, getCanUseSidebar, () => false)

  // Force bottom on narrow screens
  const position: LogPosition = canSidebar ? stored : 'bottom'

  const toggle = useCallback(() => {
    if (!canSidebar) return
    const next = stored === 'bottom' ? 'left' : 'bottom'
    setLocalStorageItem(STORAGE_KEY, next)
    setStored(next)
  }, [stored, canSidebar])

  return { position, toggle, canSidebar }
}
