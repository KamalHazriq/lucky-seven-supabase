type StorageAreaName = 'local' | 'session'

function getStorage(area: StorageAreaName): Storage | null {
  if (typeof window === 'undefined') return null
  try {
    return area === 'local' ? window.localStorage : window.sessionStorage
  } catch {
    return null
  }
}

function getItem(area: StorageAreaName, key: string): string | null {
  return getStorage(area)?.getItem(key) ?? null
}

function setItem(area: StorageAreaName, key: string, value: string): boolean {
  const storage = getStorage(area)
  if (!storage) return false
  try {
    storage.setItem(key, value)
    return true
  } catch {
    return false
  }
}

function removeItem(area: StorageAreaName, key: string): boolean {
  const storage = getStorage(area)
  if (!storage) return false
  try {
    storage.removeItem(key)
    return true
  } catch {
    return false
  }
}

export function getLocalStorageItem(key: string): string | null {
  return getItem('local', key)
}

export function setLocalStorageItem(key: string, value: string): boolean {
  return setItem('local', key, value)
}

export function removeLocalStorageItem(key: string): boolean {
  return removeItem('local', key)
}

export function getSessionStorageItem(key: string): string | null {
  return getItem('session', key)
}

export function setSessionStorageItem(key: string, value: string): boolean {
  return setItem('session', key, value)
}

export function removeSessionStorageItem(key: string): boolean {
  return removeItem('session', key)
}

export function getLocalStorageJson<T>(
  key: string,
  validate: (value: unknown) => value is T,
): T | null {
  const raw = getLocalStorageItem(key)
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as unknown
    return validate(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function setLocalStorageJson(key: string, value: unknown): boolean {
  try {
    return setLocalStorageItem(key, JSON.stringify(value))
  } catch {
    return false
  }
}
