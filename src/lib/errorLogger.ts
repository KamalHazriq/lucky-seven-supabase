/**
 * Lightweight client-side error logger — sends errors to Supabase.
 *
 * - Fire-and-forget: never blocks UI or re-throws
 * - Deduplicates identical errors within a 10s window
 * - Cooldown: max 10 errors per minute to prevent flood
 * - Uses current session if available (no forced auth)
 */
import { callRpc } from './supabaseRpc'
import { getSessionStorageItem } from './browserStorage'

// ─── Dedup + rate-limit state ────────────────────────────────
const recentErrors = new Map<string, number>()
const DEDUP_MS = 10_000
let errorCountThisMinute = 0
let minuteResetTimer: ReturnType<typeof setTimeout> | null = null
const MAX_PER_MINUTE = 10
const globalFlags = globalThis as typeof globalThis & {
  __lucky7ErrorHandlersInstalled?: boolean
}

// ─── Helpers ─────────────────────────────────────────────────
function getSessionId(): string {
  return getSessionStorageItem('lucky7_session_id') ?? 'unknown'
}

function getDeviceType(): string {
  if (typeof window === 'undefined') return 'unknown'
  const w = window.innerWidth
  if (w < 768) return 'mobile'
  if (w < 1024) return 'tablet'
  return 'desktop'
}

function getRoute(): string {
  if (typeof window === 'undefined') return '/'
  return window.location.hash.replace('#', '') || '/'
}

function getAppVersion(): string {
  return import.meta.env.VITE_APP_VERSION ?? '1.0.0'
}

// ─── Public API ──────────────────────────────────────────────

/**
 * Log a client error to Supabase. Fire-and-forget.
 * @param error  - The Error object (or anything thrown)
 * @param context - Where it happened, e.g. 'ErrorBoundary', 'useGameActions'
 */
export function logClientError(error: unknown, context?: string): void {
  try {
    const err = error instanceof Error ? error : new Error(String(error))
    const key = `${err.name}:${err.message}:${context ?? ''}`

    // Dedup: skip if same error logged recently
    const now = Date.now()
    const last = recentErrors.get(key)
    if (last && now - last < DEDUP_MS) return
    recentErrors.set(key, now)

    // Clean old entries
    if (recentErrors.size > 30) {
      for (const [k, t] of recentErrors) {
        if (now - t > 30_000) recentErrors.delete(k)
      }
    }

    // Rate limit: max errors per minute
    if (errorCountThisMinute >= MAX_PER_MINUTE) return
    errorCountThisMinute++
    if (!minuteResetTimer) {
      minuteResetTimer = setTimeout(() => {
        errorCountThisMinute = 0
        minuteResetTimer = null
      }, 60_000)
    }

    void _sendError(err, context)
  } catch {
    // Logger must never throw
  }
}

async function _sendError(err: Error, context?: string): Promise<void> {
  try {
    await callRpc('log_client_error', {
      p_session_id: getSessionId(),
      p_error_name: err.name.slice(0, 200),
      p_message: err.message.slice(0, 2000),
      p_stack: err.stack?.slice(0, 4000) ?? null,
      p_context: context?.slice(0, 200) ?? null,
      p_route: getRoute(),
      p_device_type: getDeviceType(),
      p_user_agent: navigator.userAgent.slice(0, 500),
      p_app_version: getAppVersion(),
    })
  } catch {
    // Logging should never break the app
  }
}

/**
 * Install global unhandled error + rejection listeners.
 * Call once at app startup.
 */
export function installGlobalErrorHandlers(): void {
  if (typeof window === 'undefined') return
  if (globalFlags.__lucky7ErrorHandlersInstalled) return
  globalFlags.__lucky7ErrorHandlersInstalled = true

  window.addEventListener('error', (e) => {
    logClientError(e.error ?? e.message, 'window.onerror')
  })
  window.addEventListener('unhandledrejection', (e) => {
    logClientError(e.reason, 'unhandledrejection')
  })
}
