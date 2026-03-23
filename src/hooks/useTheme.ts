import { useState, useEffect, useCallback } from 'react'
import { getLocalStorageItem, setLocalStorageItem } from '../lib/browserStorage'

export type Theme = 'blue' | 'dark' | 'light'

const STORAGE_KEY = 'lucky7_theme'
const VALID_THEMES: Theme[] = ['blue', 'dark', 'light']

function getStoredTheme(): Theme {
  const stored = getLocalStorageItem(STORAGE_KEY)
  if (stored && VALID_THEMES.includes(stored as Theme)) return stored as Theme
  return 'blue'
}

function applyTheme(theme: Theme) {
  const root = document.documentElement
  if (theme === 'blue') {
    root.removeAttribute('data-theme')
  } else {
    root.setAttribute('data-theme', theme)
  }
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(getStoredTheme)

  // Apply theme on mount
  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  const setTheme = useCallback((t: Theme) => {
    setLocalStorageItem(STORAGE_KEY, t)
    setThemeState(t)
  }, [])

  // Cycle: blue → dark → light → blue
  const cycle = useCallback(() => {
    setTheme(theme === 'blue' ? 'dark' : theme === 'dark' ? 'light' : 'blue')
  }, [theme, setTheme])

  // Listen for storage changes from other tabs
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        const t = getStoredTheme()
        setThemeState(t)
        applyTheme(t)
      }
    }
    window.addEventListener('storage', handler)
    return () => window.removeEventListener('storage', handler)
  }, [])

  return { theme, setTheme, cycle }
}
