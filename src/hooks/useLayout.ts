import { useState, useCallback, useSyncExternalStore } from 'react'
import { getLocalStorageItem, setLocalStorageItem } from '../lib/browserStorage'

const STORAGE_KEY = 'lucky7_layout'
export type LayoutMode = 'classic' | 'table'

function getStoredLayout(): LayoutMode {
  const v = getLocalStorageItem(STORAGE_KEY)
  if (v === 'table') return 'table'
  return 'classic'
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

export function useLayout() {
  const [stored, setStoredState] = useState<LayoutMode>(getStoredLayout)
  const isDesktop = useSyncExternalStore(subscribeViewport, getIsDesktop, () => true)

  // Force classic on mobile regardless of stored preference
  const layout: LayoutMode = isDesktop ? stored : 'classic'
  const isMobile = !isDesktop

  const setLayout = useCallback((mode: LayoutMode) => {
    setLocalStorageItem(STORAGE_KEY, mode)
    setStoredState(mode)
  }, [])

  const toggle = useCallback(() => {
    if (!isDesktop) return // no-op on mobile
    setLayout(stored === 'classic' ? 'table' : 'classic')
  }, [stored, setLayout, isDesktop])

  return { layout, setLayout, toggle, isMobile }
}
