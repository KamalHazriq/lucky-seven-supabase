import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { getSeatColor } from '../lib/playerColors'
import { getLocalStorageJson, setLocalStorageJson } from '../lib/browserStorage'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import type { ChatMessage } from '../lib/types'

const QUICK_EMOJIS = ['\u{1F44D}', '\u{1F44E}', '\u{1F602}', '\u{1F631}', '\u{1F525}', '\u{1F389}', '\u{1F60E}', '\u{1F914}']

const CHAT_POS_KEY = 'lucky7_chat_pos'

/** Pixels from bottom within which we consider the user "at bottom" */
const NEAR_BOTTOM_PX = 60

function loadChatPos(): { x: number; y: number } | null {
  return getLocalStorageJson(
    CHAT_POS_KEY,
    (value): value is { x: number; y: number } =>
      typeof value === 'object'
      && value !== null
      && typeof (value as { x?: unknown }).x === 'number'
      && typeof (value as { y?: unknown }).y === 'number',
  )
}

function saveChatPos(x: number, y: number) {
  setLocalStorageJson(CHAT_POS_KEY, { x, y })
}

interface ChatPanelProps {
  open: boolean
  messages: ChatMessage[]
  localUserId: string
  onSend: (text: string) => void
  onClose: () => void
  isDesktop?: boolean
}

export default function ChatPanel({ open, messages, localUserId, onSend, onClose, isDesktop: isDesktopProp }: ChatPanelProps) {
  const [text, setText] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // Smart scroll state
  const [isNearBottom, setIsNearBottom] = useState(true)
  const [showNewPill, setShowNewPill] = useState(false)
  const prevMsgCountRef = useRef(messages.length)

  // Draggable position state (desktop only) — use prop if provided, else snapshot fallback
  const isDesktop = isDesktopProp ?? (typeof window !== 'undefined' && window.innerWidth >= 768)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(() => isDesktop ? loadChatPos() : null)
  // Keep a ref in sync so handlePointerUp can read the latest pos without being in deps
  const posRef = useRef(pos)
  posRef.current = pos
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null)

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (!isDesktop) return
    e.preventDefault()
    const el = panelRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const currentX = pos?.x ?? rect.left
    const currentY = pos?.y ?? rect.top
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: currentX, origY: currentY }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }, [isDesktop, pos])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return
    const dx = e.clientX - dragRef.current.startX
    const dy = e.clientY - dragRef.current.startY
    const newX = Math.max(0, Math.min(window.innerWidth - 320, dragRef.current.origX + dx))
    const newY = Math.max(0, Math.min(window.innerHeight - 100, dragRef.current.origY + dy))
    setPos({ x: newX, y: newY })
  }, [])

  const handlePointerUp = useCallback(() => {
    if (!dragRef.current) return
    dragRef.current = null
    const p = posRef.current
    if (p) saveChatPos(p.x, p.y)
  }, []) // posRef is always current — no stale closure

  // ─── Clamp chat position on window resize ────────────────────
  useEffect(() => {
    if (!isDesktop) return
    let rafId = 0
    const onResize = () => {
      cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(() => {
        setPos((p) => {
          if (!p) return p
          const clampedX = Math.max(0, Math.min(window.innerWidth - 320, p.x))
          const clampedY = Math.max(0, Math.min(window.innerHeight - 100, p.y))
          if (clampedX === p.x && clampedY === p.y) return p // stable ref if unchanged
          return { x: clampedX, y: clampedY }
        })
      })
    }
    window.addEventListener('resize', onResize, { passive: true })
    return () => {
      window.removeEventListener('resize', onResize)
      cancelAnimationFrame(rafId)
    }
  }, [isDesktop])

  // ─── Scroll position tracking ────────────────────────────────
  const checkNearBottom = useCallback(() => {
    const el = scrollRef.current
    if (!el) return true
    return el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX
  }, [])

  const handleScroll = useCallback(() => {
    const nearBottom = checkNearBottom()
    setIsNearBottom(nearBottom)
    if (nearBottom) setShowNewPill(false)
  }, [checkNearBottom])

  // ─── Smart auto-scroll on new messages ───────────────────────
  useEffect(() => {
    if (!open) return
    const hasNew = messages.length > prevMsgCountRef.current
    prevMsgCountRef.current = messages.length

    if (!hasNew) {
      // Initial load or no new messages — snap to bottom instantly
      bottomRef.current?.scrollIntoView({ behavior: 'instant' as ScrollBehavior })
      return
    }

    // New messages arrived
    if (isNearBottom) {
      // User was at bottom → smooth scroll to stay at bottom
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    } else {
      // User scrolled up → don't yank, show pill
      setShowNewPill(true)
    }
  }, [messages.length, open, isNearBottom])

  // Snap to bottom when first opened
  useEffect(() => {
    if (open) {
      // Reset state on open
      setShowNewPill(false)
      setIsNearBottom(true)
      prevMsgCountRef.current = messages.length
      // Snap to bottom after panel animates in
      requestAnimationFrame(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'instant' as ScrollBehavior })
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [open])

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    setShowNewPill(false)
    setIsNearBottom(true)
  }, [])

  const handleSend = () => {
    if (!text.trim()) return
    onSend(text.trim())
    setText('')
    // Always scroll to bottom after sending own message
    requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
      setIsNearBottom(true)
      setShowNewPill(false)
    })
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={panelRef}
          initial={{ opacity: 0, y: 20, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.96 }}
          transition={{ type: 'spring', stiffness: 350, damping: 26, mass: 0.6 }}
          className="fixed z-40 w-80 max-w-[calc(100vw-24px)] bg-surface-overlay backdrop-blur-md border border-border-subtle rounded-2xl shadow-2xl flex flex-col overflow-hidden"
          style={{
            maxHeight: 'min(420px, 60vh)',
            ...(isDesktop && pos
              ? { left: pos.x, top: pos.y, bottom: 'auto', right: 'auto' }
              : { bottom: 'calc(4.5rem + env(safe-area-inset-bottom, 0px))', right: '0.75rem' }),
          }}
        >
          {/* Header — draggable on desktop */}
          <div
            className={`flex items-center justify-between px-3 py-2 border-b border-border-subtle ${isDesktop ? 'cursor-grab active:cursor-grabbing' : ''}`}
            onPointerDown={isDesktop ? handlePointerDown : undefined}
            onPointerMove={isDesktop ? handlePointerMove : undefined}
            onPointerUp={isDesktop ? handlePointerUp : undefined}
            style={isDesktop ? { touchAction: 'none' } : undefined}
          >
            <h3 className="text-sm font-semibold text-primary select-none">Chat</h3>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={onClose}
              className="rounded-full text-muted-foreground hover:text-foreground"
            >
              &times;
            </Button>
          </div>

          {/* Messages */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto p-2 space-y-1.5 min-h-[120px] relative"
            onScroll={handleScroll}
          >
            {messages.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">No messages yet. Say hi!</p>
            )}
            {messages.map((msg) => {
              const isLocal = msg.userId === localUserId
              const color = getSeatColor(msg.seatIndex)
              const isEmoji = /^\p{Emoji_Presentation}+$/u.test(msg.text) && msg.text.length <= 8

              return (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.15 }}
                  className={`flex flex-col ${isLocal ? 'items-end' : 'items-start'}`}
                >
                  {/* Name label */}
                  {!isLocal && (
                    <span
                      className="text-[10px] font-medium ml-1 mb-0.5"
                      style={{ color: color.text }}
                    >
                      {msg.displayName}
                    </span>
                  )}

                  {/* Bubble */}
                  {isEmoji ? (
                    <span className="text-3xl leading-none px-1">{msg.text}</span>
                  ) : (
                    <div
                      className={`
                        max-w-[85%] px-3 py-1.5 rounded-2xl text-sm leading-snug break-words
                        ${isLocal
                          ? 'rounded-br-sm text-white'
                          : 'rounded-bl-sm text-foreground'
                        }
                      `}
                      style={{
                        backgroundColor: isLocal
                          ? color.solid
                          : 'rgba(51, 65, 85, 0.8)',
                        borderLeft: isLocal ? 'none' : `3px solid ${color.solid}`,
                      }}
                    >
                      {msg.text}
                    </div>
                  )}
                </motion.div>
              )
            })}
            <div ref={bottomRef} />
          </div>

          {/* "New messages" pill — shown when user scrolled up and new msgs arrived */}
          <AnimatePresence>
            {showNewPill && (
              <motion.button
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={{ duration: 0.18 }}
                onClick={scrollToBottom}
                className="absolute left-1/2 -translate-x-1/2 z-50 px-3 py-1 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold rounded-full shadow-lg cursor-pointer"
                style={{ bottom: '7.5rem' }}
              >
                New messages &darr;
              </motion.button>
            )}
          </AnimatePresence>

          {/* Quick emoji row */}
          <div className="flex gap-1 px-2 py-1.5 border-t border-border-subtle">
            {QUICK_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => onSend(emoji)}
                className="flex-1 text-center text-lg hover:scale-125 transition-transform cursor-pointer py-0.5"
              >
                {emoji}
              </button>
            ))}
          </div>

          {/* Input */}
          <div className="flex gap-2 px-2 pb-2">
            <Input
              ref={inputRef}
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message..."
              maxLength={300}
              className="flex-1 h-9 rounded-xl text-sm"
            />
            <Button
              onClick={handleSend}
              disabled={!text.trim()}
              size="sm"
              className="rounded-xl"
            >
              Send
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
