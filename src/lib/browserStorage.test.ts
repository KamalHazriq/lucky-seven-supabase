import { afterEach, describe, expect, it } from 'vitest'
import {
  getLocalStorageItem,
  getLocalStorageJson,
  getSessionStorageItem,
  setLocalStorageItem,
  setLocalStorageJson,
  setSessionStorageItem,
} from './browserStorage'

interface StorageMock extends Storage {
  store: Map<string, string>
}

function createStorageMock(): StorageMock {
  const store = new Map<string, string>()
  return {
    store,
    get length() {
      return store.size
    },
    clear() {
      store.clear()
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key) ?? null : null
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null
    },
    removeItem(key: string) {
      store.delete(key)
    },
    setItem(key: string, value: string) {
      store.set(key, value)
    },
  }
}

const originalWindow = globalThis.window

function installWindow(localStorage = createStorageMock(), sessionStorage = createStorageMock()) {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      localStorage,
      sessionStorage,
    },
  })

  return { localStorage, sessionStorage }
}

afterEach(() => {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: originalWindow,
  })
})

describe('browserStorage', () => {
  it('reads and writes local/session storage when available', () => {
    installWindow()

    expect(setLocalStorageItem('theme', 'dark')).toBe(true)
    expect(setSessionStorageItem('sid', 'abc')).toBe(true)
    expect(getLocalStorageItem('theme')).toBe('dark')
    expect(getSessionStorageItem('sid')).toBe('abc')
  })

  it('returns safe fallbacks when storage is unavailable', () => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: undefined,
    })

    expect(setLocalStorageItem('theme', 'dark')).toBe(false)
    expect(setSessionStorageItem('sid', 'abc')).toBe(false)
    expect(getLocalStorageItem('theme')).toBeNull()
    expect(getSessionStorageItem('sid')).toBeNull()
  })

  it('parses validated json payloads and rejects malformed values', () => {
    const { localStorage } = installWindow()

    expect(setLocalStorageJson('panel', { x: 10, y: 20 })).toBe(true)
    expect(
      getLocalStorageJson(
        'panel',
        (value): value is { x: number; y: number } =>
          typeof value === 'object'
          && value !== null
          && typeof (value as { x?: unknown }).x === 'number'
          && typeof (value as { y?: unknown }).y === 'number',
      ),
    ).toEqual({ x: 10, y: 20 })

    localStorage.setItem('panel', '{"x":"bad"}')
    expect(
      getLocalStorageJson(
        'panel',
        (value): value is { x: number; y: number } =>
          typeof value === 'object'
          && value !== null
          && typeof (value as { x?: unknown }).x === 'number'
          && typeof (value as { y?: unknown }).y === 'number',
      ),
    ).toBeNull()
  })
})
