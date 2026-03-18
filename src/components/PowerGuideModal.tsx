import type { PowerAssignments, PowerRankKey, PowerEffectType } from '../lib/types'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'

interface PowerGuideModalProps {
  open: boolean
  onClose: () => void
  powerAssignments: PowerAssignments
}

const RANK_LABELS: Record<PowerRankKey, string> = {
  '10': '10',
  J: 'Jack',
  Q: 'Queen',
  K: 'King',
  JOKER: 'Joker',
}

const RANK_COLORS: Record<PowerRankKey, string> = {
  '10': '#06b6d4',
  J: '#fbbf24',
  Q: '#a855f7',
  K: '#ef4444',
  JOKER: '#d946ef',
}

const EFFECT_FRIENDLY: Record<PowerEffectType, string> = {
  peek_one_of_your_cards: 'Peek 1 of your cards',
  peek_all_three_of_your_cards: 'Peek all 3 cards (locked hidden)',
  swap_one_to_one: 'Swap 1:1 cards between any players',
  lock_one_card: 'Lock 1 card (prevents swapping)',
  unlock_one_locked_card: 'Unlock 1 locked card',
  rearrange_cards: "Rearrange opponent's cards randomly",
}

const RANK_ORDER: PowerRankKey[] = ['10', 'J', 'Q', 'K', 'JOKER']

export default function PowerGuideModal({ open, onClose, powerAssignments }: PowerGuideModalProps) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader className="px-5 pt-5 pb-0">
          <div className="flex items-center justify-center gap-2">
            <span className="text-base">&#x2728;</span>
            <DialogTitle>Power Guide</DialogTitle>
          </div>
          <DialogDescription className="text-center">
            Draw a power card to use its ability instead of swapping
          </DialogDescription>
        </DialogHeader>

        <Separator className="mt-3" />

        <div className="px-5 py-4 space-y-2">
          {RANK_ORDER.map((rankKey) => {
            const effect = powerAssignments[rankKey]
            return (
              <Card key={rankKey} className="flex items-center gap-3 p-3">
                <Badge
                  variant="outline"
                  className="text-sm font-bold w-14 justify-center shrink-0 border-border-subtle py-1"
                  style={{ color: RANK_COLORS[rankKey] }}
                >
                  {RANK_LABELS[rankKey]}
                </Badge>
                <span className="text-xs text-foreground leading-snug">
                  {EFFECT_FRIENDLY[effect]}
                </span>
              </Card>
            )
          })}
        </div>

        {/* Tip */}
        <div className="mx-5 mb-1 p-2.5 rounded-xl border border-primary/25 bg-amber-950/20">
          <p className="text-[11px] text-primary/80 font-medium text-center">
            Powers are consumed on use — the card is discarded after activating.
          </p>
        </div>

        <Separator />

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
