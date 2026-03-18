import { useState, useEffect, useRef } from 'react'
import type { ChatMessage } from '../lib/types'

const BUBBLE_DURATION_MS = 4000

/**
 * Derives per-player latest chat bubble from chat messages.
 * UI-only — auto-clears after 4 seconds. No database writes.
 *
 * Only shows bubbles for messages that arrive AFTER the component mounts
 * (skips initial snapshot). Bubbles appear for remote players only.
 */
export function useChatBubbles(
  messages: ChatMessage[],
  localUserId: string,
): Record<string, string | null> {
  const [bubbles, setBubbles] = useState<Record<string, string | null>>({})
  // -1 = awaiting first snapshot; any other value = count after snapshot
  const prevCountRef = useRef(-1)
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  useEffect(() => {
    // First snapshot: just record the baseline count. Even if 0, mark as initialized.
    if (prevCountRef.current === -1) {
      prevCountRef.current = messages.length
      return
    }

    // No new messages
    if (messages.length <= prevCountRef.current) {
      prevCountRef.current = messages.length
      return
    }

    // Only process truly new messages
    const newMsgs = messages.slice(prevCountRef.current)
    prevCountRef.current = messages.length

    for (const msg of newMsgs) {
      // Don't show bubbles for local user
      if (msg.userId === localUserId) continue

      const uid = msg.userId
      const text = msg.text.length > 140 ? msg.text.slice(0, 138) + '\u2026' : msg.text

      // Clear existing timer for this user
      if (timersRef.current[uid]) clearTimeout(timersRef.current[uid])

      setBubbles((prev) => ({ ...prev, [uid]: text }))

      // Auto-clear after duration
      timersRef.current[uid] = setTimeout(() => {
        setBubbles((prev) => ({ ...prev, [uid]: null }))
      }, BUBBLE_DURATION_MS)
    }
  }, [messages.length, messages, localUserId])

  // Cleanup all timers on unmount
  useEffect(() => {
    const timers = timersRef.current
    return () => {
      Object.values(timers).forEach(clearTimeout)
    }
  }, [])

  return bubbles
}
