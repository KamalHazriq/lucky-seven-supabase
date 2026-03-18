import { useState, useEffect, useCallback, useRef } from 'react'
import toast from 'react-hot-toast'
import { supabase, ensureAuth } from '../lib/supabase'
import { sendChatMessage } from '../lib/supabaseGameService'
import { mapChatRow } from '../lib/supabaseMappers'
import type { ChatMessage } from '../lib/types'

const STORAGE_KEY = 'lucky7_chat_open'
const CHAT_MAX = 50
const CHAT_THROTTLE_MS = 500

function getIsMobile(): boolean {
  return window.innerWidth < 768
}

function getStoredPref(): boolean | null {
  const v = localStorage.getItem(STORAGE_KEY)
  if (v === 'true') return true
  if (v === 'false') return false
  return null
}

/**
 * Chat hook with Supabase Postgres Changes for realtime delivery.
 *
 * Subscription rules (same as before):
 * - Desktop: stays subscribed while chat is open (default open). Closing on desktop
 *   keeps the subscription alive so chat bubbles + unread counts still work.
 * - Mobile: subscribes only while chat is open. Closing tears down the listener
 *   to save resources. Bubbles use the last-known messages array.
 */
export function useChat(
  gameId: string | undefined,
  _displayName: string,
  _seatIndex: number,
) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [unreadCount, setUnreadCount] = useState(0)

  const [isOpen, setIsOpen] = useState(() => {
    const stored = getStoredPref()
    if (stored !== null) return stored
    return !getIsMobile()
  })

  const [subscribed, setSubscribed] = useState(isOpen)
  const isOpenRef = useRef(isOpen)
  const lastSendRef = useRef(0)

  isOpenRef.current = isOpen

  // ─── Supabase subscription (Postgres Changes) ─────────────────
  useEffect(() => {
    if (!gameId || !subscribed) return
    let cancelled = false

    const channel = supabase
      .channel(`chat:${gameId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'game_chat_messages',
          filter: `game_id=eq.${gameId}`,
        },
        (payload) => {
          if (cancelled) return
          const msg = mapChatRow(payload.new)
          setMessages((prev) => {
            const next = [...prev, msg]
            if (next.length > CHAT_MAX) next.splice(0, next.length - CHAT_MAX)
            return next
          })
          // Track unread only when chat is closed and tab visible
          if (!isOpenRef.current && !document.hidden) {
            setUnreadCount((c) => c + 1)
          }
        },
      )

    ensureAuth().then(() => {
      if (cancelled) return

      channel.subscribe()

      // Initial fetch (newest 50, reversed for chronological display)
      supabase
        .from('game_chat_messages')
        .select('*')
        .eq('game_id', gameId)
        .order('ts', { ascending: false })
        .limit(CHAT_MAX)
        .then(({ data }) => {
          if (cancelled || !data) return
          const msgs = data.map(mapChatRow).reverse()
          setMessages(msgs)
        })
    })

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [gameId, subscribed])

  const openChat = useCallback(() => {
    setSubscribed(true)
    setIsOpen(true)
    setUnreadCount(0)
    localStorage.setItem(STORAGE_KEY, 'true')
  }, [])

  const closeChat = useCallback(() => {
    setIsOpen(false)
    localStorage.setItem(STORAGE_KEY, 'false')
    if (getIsMobile()) {
      setSubscribed(false)
    }
  }, [])

  const toggleChat = useCallback(() => {
    if (isOpenRef.current) {
      closeChat()
    } else {
      openChat()
    }
  }, [openChat, closeChat])

  const send = useCallback(
    (text: string) => {
      if (!gameId || !text.trim()) return
      const now = Date.now()
      if (now - lastSendRef.current < CHAT_THROTTLE_MS) return
      lastSendRef.current = now

      sendChatMessage(gameId, text.trim()).catch((e) => {
        toast.error(`Chat failed: ${(e as Error).message}`)
      })
    },
    [gameId],
  )

  return {
    messages,
    unreadCount,
    isOpen,
    openChat,
    closeChat,
    toggleChat,
    send,
  }
}
