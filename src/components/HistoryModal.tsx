import { useEffect, useRef, useMemo } from 'react'
import { renderLogMessage } from '../lib/logRenderer'
import type { PlayerDoc } from '../lib/types'
import type { GameHistoryState } from '../hooks/useGameHistory'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'

interface HistoryModalProps {
  open: boolean
  onClose: () => void
  gameId: string | undefined
  players: Record<string, PlayerDoc>
  history: GameHistoryState
}

export default function HistoryModal({ open, onClose, gameId, players, history }: HistoryModalProps) {
  const { entries, loading, error, hasMore, load, reset, retry } = history
  const loadedRef = useRef(false)

  const playerInfos = useMemo(
    () => Object.entries(players).map(([playerId, player]) => ({
      playerId,
      displayName: player.displayName,
      seatIndex: player.seatIndex,
      colorKey: player.colorKey,
    })),
    [players],
  )

  // Load fresh data each time modal opens
  useEffect(() => {
    if (open && gameId && !loadedRef.current) {
      loadedRef.current = true
      reset()
      load(true)
    }
    if (!open) {
      loadedRef.current = false
    }
  }, [open, gameId, load, reset])

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-md max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <DialogHeader className="px-5 pt-5 pb-0">
          <div className="flex items-center justify-center gap-2">
            <span className="text-base">&#128336;</span>
            <DialogTitle>Full Game History</DialogTitle>
            {entries.length > 0 && (
              <Badge
                variant="outline"
                className="font-mono text-[10px] border-border-subtle bg-surface-panel text-muted-foreground px-1.5 py-0"
              >
                {entries.length} events
              </Badge>
            )}
          </div>
          <DialogDescription className="text-center">
            Chronological log of all game events
          </DialogDescription>
        </DialogHeader>

        <Separator className="mt-3" />

        {/* Scrollable entries — newest first */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="px-4 py-3 space-y-1">
            {loading && entries.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-8">Loading history...</p>
            )}
            {error && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-3 text-center">
                <p className="text-xs text-amber-200 mb-2">{error}</p>
                <Button variant="outline" size="sm" onClick={() => void retry()} className="h-8 text-xs">
                  Retry
                </Button>
              </div>
            )}
            {!loading && !error && entries.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-8">No history yet.</p>
            )}

            {entries.map((entry, i) => (
              <div
                key={`${entry.ts}-${i}`}
                className="flex items-start gap-2.5 px-2 py-2 rounded-xl hover:bg-surface-panel transition-colors"
              >
                <span className="text-[10px] text-muted-foreground/60 font-mono flex-shrink-0 mt-0.5 tabular-nums">
                  {new Date(entry.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
                <div className="flex-1 min-w-0 text-[11px] leading-relaxed flex flex-wrap items-center gap-0.5 text-muted-foreground">
                  {renderLogMessage(entry, playerInfos)}
                </div>
              </div>
            ))}

            {/* Load more */}
            {(hasMore || loading) && entries.length > 0 && (
              <div className="flex justify-center pt-3 pb-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => load(false)}
                  disabled={loading}
                  className="text-xs h-8 px-5"
                >
                  {loading ? 'Loading...' : 'Load more'}
                </Button>
              </div>
            )}

            {!hasMore && entries.length > 0 && (
              <p className="text-[10px] text-muted-foreground/40 text-center py-2">
                — Beginning of game history —
              </p>
            )}
          </div>
        </ScrollArea>

        <Separator />

        {/* Footer */}
        <DialogFooter className="px-5 py-3 shrink-0 justify-center sm:justify-center">
          <DialogClose asChild>
            <Button variant="outline" className="h-10 px-8 rounded-xl">
              Close
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
