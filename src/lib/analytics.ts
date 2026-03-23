/**
 * Lightweight analytics helper — fire-and-forget event tracking.
 *
 * DESIGN:
 * - Never blocks UI or breaks the app
 * - Deduplicates events within 2s to prevent React re-render spam
 * - Uses current session (no forced auth)
 * - Tracks only meaningful events (see TRACKED_EVENTS below)
 *
 * TRACKED EVENTS:
 * - page_view         — once per session (Home page)
 * - create_game       — game created
 * - join_game         — joined via code or invite link
 * - game_finished     — game completed (host fires once)
 * - rematch_clicked   — Play Again clicked
 * - feedback_submitted — feedback form submitted
 */
import { callRpc } from './supabaseRpc'
import { getSessionStorageItem, setSessionStorageItem } from './browserStorage'
import type { Json } from './supabaseDatabase.generated'

// ─── Session ID — stable per tab/session ─────────────────────
let sessionId: string | null = null

function getSessionId(): string {
  if (!sessionId) {
    sessionId = getSessionStorageItem('lucky7_session_id')
    if (!sessionId) {
      sessionId = crypto.randomUUID()
      setSessionStorageItem('lucky7_session_id', sessionId)
    }
  }
  return sessionId
}

// ─── Device/context helpers ──────────────────────────────────
function getDeviceType(): string {
  if (typeof window === 'undefined') return 'unknown'
  const w = window.innerWidth
  if (w < 768) return 'mobile'
  if (w < 1024) return 'tablet'
  return 'desktop'
}

function getTheme(): string {
  if (typeof document === 'undefined') return 'blue'
  return document.documentElement.getAttribute('data-theme') ?? 'blue'
}

function getRoute(): string {
  if (typeof window === 'undefined') return '/'
  return window.location.hash.replace('#', '') || '/'
}

// ─── Dedup guard — prevents duplicate events from re-renders ─
const recentEvents = new Map<string, number>()
const DEDUP_MS = 2000

/**
 * Track an analytics event. Fire-and-forget — never blocks UI.
 * Deduplicates same event+gameId combos within 2 seconds.
 */
export function trackEvent(
  eventName: string,
  metadata?: Record<string, unknown>,
  gameId?: string,
): void {
  const key = `${eventName}:${gameId ?? ''}`
  const now = Date.now()
  const last = recentEvents.get(key)
  if (last && now - last < DEDUP_MS) return
  recentEvents.set(key, now)

  // Clean old entries periodically
  if (recentEvents.size > 50) {
    for (const [k, t] of recentEvents) {
      if (now - t > 10000) recentEvents.delete(k)
    }
  }

  void _sendEvent(eventName, metadata, gameId)
}

async function _sendEvent(
  eventName: string,
  metadata?: Record<string, unknown>,
  gameId?: string,
): Promise<void> {
  try {
    await callRpc('track_event', {
      p_event_name: eventName,
      p_game_id: gameId ?? null,
      p_session_id: getSessionId(),
      p_route: getRoute(),
      p_device_type: getDeviceType(),
      p_screen_width: typeof window === 'undefined' ? 0 : window.innerWidth,
      p_theme: getTheme(),
      p_metadata: (metadata ?? {}) as Json,
    })
  } catch {
    // Analytics should never break the app — silently drop
  }
}
