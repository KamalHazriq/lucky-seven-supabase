export const CURRENT_VERSION = 'v1.0.3'

export interface ReleaseNote {
  version: string
  title: string
  date: string
  sections: { heading: string; items: string[] }[]
}

// ─── Official releases (v1.x.x) ─────────────────────────────
export const RELEASES: ReleaseNote[] = [
  {
    version: 'v1.0.3',
    title: 'Stability Sweep',
    date: '22 March 2026',
    sections: [
      {
        heading: 'Session Safety',
        items: [
          'Lobby, game, and results screens now remount cleanly when the room changes so redirects, rematches, and manual room switches cannot carry stale state forward',
          'Game session loading now fully resets public and private state before refetching, and private hand state is cleared immediately if the backing row disappears',
        ],
      },
      {
        heading: 'Performance',
        items: [
          'Home, join, lobby, game, and results routes now lazy-load so the app no longer ships one oversized initial bundle to every player',
          'The production build no longer emits the previous large-chunk warning, improving first-load resilience on slower devices',
        ],
      },
      {
        heading: 'Release Notes',
        items: [
          'Landing-page patch notes, in-app version labels, and the GitHub README are now aligned for this release',
          'No gameplay rules, scoring, card mechanics, or balance changes in this patch',
        ],
      },
    ],
  },
  {
    version: 'v1.0.2',
    title: 'Reliability & Recovery Pass',
    date: '21 March 2026',
    sections: [
      {
        heading: 'Backend Safety',
        items: [
          'Added Docker-backed backend integration coverage for core draw, discard, swap, power, AFK, vote-kick, rematch, and reveal-score flows',
          'Structured action events now cover more lobby, rematch, vote-kick, and reveal history so the client no longer has to rely on brittle English log parsing',
          'Backend reveal scoring now matches the documented rules: Jokers score as 10 during hand reveals',
        ],
      },
      {
        heading: 'Recovery UX',
        items: [
          'Lobby reconnect state now surfaces clearer live-update failures with a retry action instead of silently stalling',
          'Error boundaries now offer in-place retry, reload, and go-home recovery paths',
          'History loading now exposes retryable failures instead of failing quietly',
        ],
      },
      {
        heading: 'Maintainability',
        items: [
          'Supabase service code was split into focused modules with stronger generated database typing for rows, JSON payloads, and RPC contracts',
          'Gameplay action state and page chrome were broken into smaller hooks/components for easier maintenance',
          'CI now validates migration ordering, backend SQL tests, frontend tests, and build safety before deploys',
        ],
      },
    ],
  },
  {
    version: 'v1.0.1',
    title: 'Sync & Stability Fixes',
    date: '19 March 2026',
    sections: [
      {
        heading: 'Multiplayer Stability',
        items: [
          'Fixed opponent peek knowledge getting lost after realtime state syncs',
          'Fixed lock, selection, highlight, and remote animation handling for both 3-card and 4-card games',
        ],
      },
      {
        heading: 'Flow Fixes',
        items: [
          'Retry on the join screen now properly re-runs room resolution',
          'Discard-take fallback flow now restores staging correctly when reduced-motion or no-animation paths are active',
        ],
      },
      {
        heading: 'Reliability',
        items: [
          'Results celebration and timer-related state handling were hardened to avoid unsafe React update patterns',
          'Global stats now guard against invalid aggregate values instead of showing broken totals',
          'No gameplay rules, scoring, card mechanics, or balance changes in this patch',
        ],
      },
    ],
  },
  {
    version: 'v1.0.0',
    title: 'Official Launch',
    date: '18 March 2026',
    sections: [
      {
        heading: 'Launch',
        items: [
          'Lucky Seven is now officially live at luckyseven.site',
          'After extensive beta testing, the game is stable and ready for public play',
          'Real-time multiplayer for 2–8 players, no account needed',
          'Power cards, turn timer, vote-kick, AFK system, and full mobile support',
        ],
      },
    ],
  },
]

// ─── Beta history (v0.x.x) ──────────────────────────────────
// All pre-launch development versions. Grouped under "Beta History" in the UI.
export const BETA_RELEASES: ReleaseNote[] = [
  {
    version: 'v0.10.0',
    title: 'Jack Rework & Dev Tools',
    date: '16 March 2026',
    sections: [
      {
        heading: 'Gameplay',
        items: [
          'Jack power rework: peek all 3 cards of a selected opponent',
          'Player selection step added when using Jack with Peek Opponent enabled',
        ],
      },
      {
        heading: 'UI / UX',
        items: [
          'Dev tools panel redesigned with grouped sections: Visibility, State, Session',
          'Feedback button added to Patch Notes modal footer',
        ],
      },
    ],
  },
  {
    version: 'v0.9.1',
    title: 'Card Polish & Chaos Animation',
    date: '15 March 2026',
    sections: [
      {
        heading: 'Card Redesign',
        items: [
          'Premium tabletop card style: large centered suit icon with rank below',
          'Mirrored corner indicators (rank + suit), clean white background',
        ],
      },
      {
        heading: 'Chaos Animation',
        items: [
          'Cards lift, rotate, and shuffle before settling (~900ms) when chaos is used',
          'New shuffle sound effect with card-riffle tone',
        ],
      },
    ],
  },
  {
    version: 'v0.9.0',
    title: 'Premium UI Redesign',
    date: '15 March 2026',
    sections: [
      {
        heading: 'Visual Overhaul',
        items: [
          'Premium felt-table aesthetic with themed CSS variables across all 3 themes',
          'Subtler animations, softer glow, gentler shimmer',
          'All modals themed consistently using CSS variables',
        ],
      },
      {
        heading: 'Layout Stability',
        items: [
          'Seat positions inset for 5–7 players to prevent edge clipping',
          'Table zone height constraints refined to prevent action bar overlap',
        ],
      },
    ],
  },
  {
    version: 'v0.8.7',
    title: 'Card Overflow, Timer & Celebration',
    date: '15 March 2026',
    sections: [
      {
        heading: 'Bug Fixes',
        items: [
          'Fixed 7-player card overflow — cards now shrink-to-fit in narrow panels',
          'Fixed game log not auto-scrolling after bounded log replacement',
          'Fixed timer randomly skipping players due to stale expiry values',
        ],
      },
      {
        heading: 'Results Celebration',
        items: [
          'Canvas confetti burst when all players reveal — two bursts from left/right',
          'New celebrate SFX: ascending 5-tone fanfare',
          'Tiebreaker: most sevens wins; if still tied, shared win',
        ],
      },
    ],
  },
  {
    version: 'v0.8.6',
    title: 'Lobby Color Instant Feedback',
    date: '14 March 2026',
    sections: [
      {
        heading: 'Lobby',
        items: [
          'Color picker shows ring highlight and avatar color instantly on pick',
          'Optimistic state: updates UI immediately, reverted on conflict',
        ],
      },
    ],
  },
  {
    version: 'v0.8.5',
    title: 'Log, Swap Highlight & Lock Blur',
    date: '13 March 2026',
    sections: [
      {
        heading: 'Bug Fixes',
        items: [
          'Fixed game log entries being invisible due to framer-motion opacity conflict',
          'Fixed locked face-up cards being unreadable — now show small corner badge',
        ],
      },
      {
        heading: 'Swap Selection',
        items: [
          'Both swap targets highlighted: amber "1" badge and emerald "2" badge',
          'Non-selectable slots dimmed during selection mode',
        ],
      },
    ],
  },
  {
    version: 'v0.8.4',
    title: 'Vote Kick Rework & Per-Player Timer',
    date: '12 March 2026',
    sections: [
      {
        heading: 'Vote Kick',
        items: [
          'Vote kick requires 3+ players — hidden for 2-player games',
          'Timer pauses during active vote kick, resumes with remaining time',
          'Kicked player sees a dedicated screen',
        ],
      },
      {
        heading: 'Timer',
        items: [
          'Timer shown per-player under each panel instead of a global bar',
          'Skip guard prevents auto-skip during active vote kick',
        ],
      },
    ],
  },
  {
    version: 'v0.8.3',
    title: 'Vote Kick, Staging & Settings Fixes',
    date: '12 March 2026',
    sections: [
      {
        heading: 'Bug Fixes',
        items: [
          'Fixed vote kick auto-kicking in 2-player games',
          'Fixed staging animation inconsistency',
          'Fixed lobby settings not syncing between host and players',
        ],
      },
    ],
  },
  {
    version: 'v0.8.2',
    title: 'Rematch, AFK & Color Fixes',
    date: '11 March 2026',
    sections: [
      {
        heading: 'Play Again',
        items: [
          'All players auto-redirect to the new lobby when anyone clicks Play Again',
        ],
      },
      {
        heading: 'AFK & Lobby',
        items: [
          'Fixed AFK timer firing twice per turn',
          'Taken colors now show a ✕ overlay in the color picker',
        ],
      },
    ],
  },
  {
    version: 'v0.8.1',
    title: 'Turn Timer & Moderation',
    date: '11 March 2026',
    sections: [
      {
        heading: 'Turn Timer',
        items: [
          'Configurable turn timer: Off, 30s, 60s, 90s, or 120s',
          'Live countdown bar: green → amber → red with critical pulse at ≤5s',
        ],
      },
      {
        heading: 'AFK & Vote-Kick',
        items: [
          'Auto-skip on timer expiry with AFK strike system (2 strikes = kick)',
          'Vote-kick: any player can initiate, majority required, voting No cancels',
        ],
      },
    ],
  },
  {
    version: 'v0.8.0',
    title: 'Identity & Lobby',
    date: '11 March 2026',
    sections: [
      {
        heading: 'Player Identity',
        items: [
          '16 unique lobby colors — no two players share the same color',
          'No duplicate names allowed (case-insensitive)',
          'Invite link shows name + color picker before joining',
        ],
      },
    ],
  },
  {
    version: 'v0.7.0',
    title: 'Premium Polish',
    date: '11 March 2026',
    sections: [
      {
        heading: 'Animations & Feel',
        items: [
          'Slower, floaty flying card arcs (1.4–1.7s) for a luxurious feel',
          'Leave Game button in Settings — exit mid-game with confirmation',
          'Game ends automatically when the draw pile is empty',
        ],
      },
      {
        heading: 'Home Screen',
        items: [
          'Game Statistics section: Games Played and Total Visits',
        ],
      },
    ],
  },
  {
    version: 'v0.6.0',
    title: 'Production Readiness',
    date: '10 March 2026',
    sections: [
      {
        heading: 'UI & Layout',
        items: [
          'Professional 3-zone top bar: game info, turn strip, controls',
          'Table layout engine rewritten with pile-zone avoidance',
          'Mobile forces classic layout, desktop uses poker table by default',
        ],
      },
      {
        heading: 'Performance',
        items: [
          'Game log bounded at 50 entries, chat limited to 50 messages',
          'Presence writes throttled to once per 60 seconds',
        ],
      },
    ],
  },
  {
    version: 'v0.5.3',
    title: 'UI Stabilization',
    date: '10 March 2026',
    sections: [
      {
        heading: 'Fixes',
        items: [
          'Wider seat spacing for 5–7 player games',
          'All toolbar buttons show descriptive tooltips',
          'Sub-versions grouped under v0.5 tab in patch notes',
        ],
      },
    ],
  },
  {
    version: 'v0.5.2',
    title: 'Premium Choreography',
    date: '10 March 2026',
    sections: [
      {
        heading: 'Animations',
        items: [
          'Floaty flying card motion — 1.4–1.8s gentle arcs with subtle rotation',
          'New "In play" staging slot between Draw and Discard piles',
          '3D discard flip animation when a card becomes the discard top',
        ],
      },
    ],
  },
  {
    version: 'v0.5.1',
    title: 'Premium Polish',
    date: '10 March 2026',
    sections: [
      {
        heading: 'Fixes & Polish',
        items: [
          'Smoother flying card animation with enhanced easing curve',
          'Power names displayed as bold uppercase badges in game log',
          'Log position toggle: Bottom or Left sidebar (persists in localStorage)',
        ],
      },
    ],
  },
  {
    version: 'v0.5.0',
    title: 'Action Bar & Choreography',
    date: '10 March 2026',
    sections: [
      {
        heading: 'Action Bar',
        items: [
          'Inline Action Bar — swap, discard, and use powers without leaving the board',
          'Keyboard hints [1][2][3] and [Esc] on desktop',
          'Selection mode: power flows work inline with slot highlighting',
        ],
      },
    ],
  },
  {
    version: 'v0.4.0',
    title: 'Table & Effects Update',
    date: '10 March 2026',
    sections: [
      {
        heading: 'Layout & Visual',
        items: [
          'New poker-table layout: players in circular formation, toggle with classic',
          'Slot-level effect overlays: swapped, locked, and unlocked cards pulse briefly',
          'Pile draws can be dismissed — resume via banner',
        ],
      },
    ],
  },
  {
    version: 'v0.3.0',
    title: 'Polish & Presence Update',
    date: '10 March 2026',
    sections: [
      {
        heading: 'Chat & Social',
        items: [
          'Chat bubbles float above player panels, auto-fade after 4 seconds',
          'Queue numbers shown beside each player\'s name',
        ],
      },
    ],
  },
  {
    version: 'v0.2.0',
    title: 'Signal & Flow Update',
    date: '10 March 2026',
    sections: [
      {
        heading: 'Gameplay',
        items: [
          'Support for 5–8 players with deck multiplier (1x, 1.5x, 2x)',
          'Player colors — unique color per seat shown on cards, panels, and log',
          'In-game chat with quick emoji buttons',
        ],
      },
    ],
  },
  {
    version: 'v0.1.0',
    title: 'Lucky Seven — First Build',
    date: '9 March 2026',
    sections: [
      {
        heading: 'Core Game',
        items: [
          'Draw from pile or discard, swap with hand, or discard to end turn',
          '6 customizable power cards: Peek, Peek All, Swap, Lock, Unlock, Rearrange',
          'Real-time multiplayer, 2–8 players, lobby with 6-character join codes',
          'Three themes: Blue, Dark, Light. Mobile-first design.',
        ],
      },
    ],
  },
]
