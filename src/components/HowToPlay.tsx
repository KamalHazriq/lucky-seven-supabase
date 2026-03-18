import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog'
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'

export default function HowToPlay({ variant = 'link' }: { variant?: 'link' | 'large' }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      {variant === 'large' ? (
        <motion.button
          whileHover={{ scale: 1.02, y: -2 }}
          whileTap={{ scale: 0.98 }}
          transition={{ type: 'spring', stiffness: 400, damping: 20 }}
          onClick={() => setOpen(true)}
          className="w-full py-3.5 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-white rounded-xl font-semibold text-lg transition-all shadow-lg shadow-amber-600/20 cursor-pointer flex items-center justify-center gap-2"
        >
          <span className="text-xl">{'\u{1F4D6}'}</span>
          How to Play
        </motion.button>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 cursor-pointer transition-colors"
        >
          How to Play
        </button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-4xl max-h-[88vh] flex flex-col overflow-hidden">
          <DialogHeader className="px-5 pt-5 pb-0">
            <DialogTitle className="text-xl sm:text-2xl text-center sm:text-left">
              Lucky Seven Rulebook
            </DialogTitle>
            <DialogDescription className="sm:text-left">
              Everything you need to know to play and win
            </DialogDescription>
          </DialogHeader>

          <Separator className="mt-3" />

          <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="px-5 py-4 space-y-4 text-sm text-muted-foreground">
              {/* Top 2-col: Overview + Basic Gameplay */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Card className="p-4 space-y-2">
                  <h3 className="font-bold text-emerald-400 text-base">Game Overview</h3>
                  <p>Lucky Seven is a strategic card game where players aim for the <span className="text-primary font-medium">lowest score</span>.</p>
                  <ul className="space-y-1">
                    <li><span className="text-foreground font-medium">Players:</span> 2–8 players</li>
                    <li><span className="text-foreground font-medium">Objective:</span> Lowest total score wins</li>
                    <li><span className="text-foreground font-medium">Hand:</span> 3 face-down cards each</li>
                    <li><span className="text-foreground font-medium">End:</span> Draw pile runs out</li>
                  </ul>
                </Card>

                <Card className="p-4 space-y-3">
                  <h3 className="font-bold text-emerald-400 text-base">Basic Gameplay</h3>
                  <div>
                    <p className="text-foreground font-medium mb-1.5">Turn Structure:</p>
                    <ol className="list-decimal list-inside space-y-1 ml-1">
                      <li>Draw from pile <span className="text-muted-foreground/60">OR</span> take discard</li>
                      <li>Choose: <span className="text-foreground">Swap</span>, <span className="text-foreground">Discard</span>, or <span className="text-foreground">Use Power</span></li>
                      <li>Old card goes to discard pile</li>
                      <li>Turn passes to next player</li>
                    </ol>
                  </div>
                  <Separator />
                  <div>
                    <p className="text-foreground font-medium mb-1">Card Values:</p>
                    <ul className="space-y-0.5 ml-1 text-xs">
                      <li><span className="text-primary font-medium">7 = 0 pts</span> (best card!)</li>
                      <li>A = 1, 2–6 &amp; 8–9 = face value</li>
                      <li>10, J, Q, K, Joker = 10 pts (with powers)</li>
                    </ul>
                  </div>
                </Card>
              </div>

              {/* Power Cards */}
              <div>
                <h3 className="font-bold text-emerald-400 text-base mb-2">Power Cards</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {([
                    { rank: 'Jack', power: 'Peek All', desc: 'View all 3 of your face-down cards', color: 'amber', border: 'border-l-amber-400' },
                    { rank: 'Queen', power: 'Swap', desc: 'Swap any two unlocked cards between players', color: 'purple', border: 'border-l-purple-400' },
                    { rank: 'King', power: 'Lock', desc: 'Lock any card — prevents swapping', color: 'red', border: 'border-l-red-400' },
                    { rank: '10', power: 'Unlock', desc: 'Unlock a previously locked card', color: 'cyan', border: 'border-l-cyan-400' },
                    { rank: 'Joker', power: 'Chaos', desc: "Randomly shuffle an opponent's unlocked cards", color: 'fuchsia', border: 'border-l-fuchsia-400', span: true },
                  ] satisfies { rank: string; power: string; desc: string; color: string; border: string; span?: boolean }[]).map((card) => (
                    <Card
                      key={card.rank}
                      className={`p-3 border-l-[3px] ${card.border} ${card.span ? 'sm:col-span-2' : ''}`}
                    >
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className={`font-bold text-${card.color}-400`}>{card.rank}</span>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-border-subtle text-muted-foreground">
                          {card.power}
                        </Badge>
                      </div>
                      <p className="text-xs">{card.desc}</p>
                    </Card>
                  ))}
                </div>
              </div>

              {/* Accordion sections for deeper content */}
              <Accordion type="multiple" className="rounded-xl border border-border-subtle bg-surface-panel overflow-hidden">
                <AccordionItem value="locked" className="border-border-subtle px-4">
                  <AccordionTrigger className="text-foreground hover:no-underline">
                    <div className="flex items-center gap-2">
                      <span className="text-red-400 text-base">&#x1F512;</span>
                      Locked Cards
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <ul className="space-y-1.5 text-muted-foreground">
                      <li>Locked cards can't be swapped or peeked</li>
                      <li>Shows a <span className="text-red-400 font-medium">lock icon</span> overlay</li>
                      <li>Use a <span className="text-cyan-400 font-medium">10</span> to unlock them</li>
                      <li>Hover or long-press to see who locked it</li>
                    </ul>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="strategy" className="border-border-subtle px-4">
                  <AccordionTrigger className="text-foreground hover:no-underline">
                    <div className="flex items-center gap-2">
                      <span className="text-emerald-400 text-base">&#x1F9E0;</span>
                      Strategy Tips
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <ul className="space-y-1.5 list-disc list-inside text-muted-foreground">
                      <li>Track which cards you've peeked</li>
                      <li><span className="text-primary font-medium">7s = 0 pts</span> — lock them!</li>
                      <li>Queen swap to give opponents high cards</li>
                      <li>Joker chaos disrupts peeked knowledge</li>
                      <li>Sometimes discarding a power is better</li>
                    </ul>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>

              {/* How to Win — highlighted card */}
              <Card className="p-4 border-primary/25 bg-amber-950/20">
                <h3 className="font-bold text-primary text-base mb-1.5">How to Win</h3>
                <ul className="space-y-1 text-amber-200/80">
                  <li>Have the <span className="text-amber-200 font-medium">lowest total score</span> when the draw pile runs out</li>
                  <li><span className="text-amber-200 font-medium">7s</span> are your best friend (0 points each)</li>
                  <li>Strategic use of powers gives you the edge</li>
                </ul>
              </Card>
            </div>
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
    </>
  )
}
