# Lucky Seven<sup>TM</sup> - Online Multiplayer Card Game

A real-time multiplayer card game for 2-8 players, built by Kamal Hazriq. Hosted on GitHub Pages at [luckyseven.site](https://luckyseven.site) with Supabase as the backend. Lowest score wins, and Sevens are worth zero.

## Live App

- Production: [https://luckyseven.site](https://luckyseven.site)
- GitHub Pages: [https://kamalhazriq.github.io/lucky-seven-supabase/](https://kamalhazriq.github.io/lucky-seven-supabase/)

## Game Rules

- **Deck**: 52 standard cards + Jokers
- **Deal**: 3 cards face-down per player
- **Goal**: Get the lowest total score
- **Special rule**: 7s are worth 0

### Turn Flow

1. Draw from the draw pile or take the top discard card.
2. Swap the drawn card with one of your 3 face-down cards, discard it, or use its power.

### Base Scoring

- Ace = 1
- 2-10 = face value
- 7 = 0
- J/Q/K/Joker = 10

### Default Power Cards

| Card | Power | Effect |
|---|---|---|
| Jack | Peek All | Look at all 3 of your face-down cards |
| Queen | Swap | Swap any two unlocked cards between players |
| King | Lock | Lock any unlocked card so it cannot be swapped |
| 10 | Unlock | Unlock a locked card |
| Joker | Chaos | Shuffle another player's unlocked cards |

Power assignments are configurable per game, so these defaults can be changed in the lobby setup.

### Lock Mechanics

- Locked cards cannot be swapped by normal play or swap powers.
- Chaos only affects unlocked cards.
- Unlock powers can remove a lock from any locked card.

### Ending the Game

The game ends when the draw pile is exhausted. Players reveal their hands, scores are calculated, and the lowest score wins. Ties are broken by most 7s.

## Tech Stack

- **Frontend**: React 19 + TypeScript + Vite + Tailwind CSS v4
- **Backend**: Supabase (PostgreSQL + Row Level Security + Realtime + Anonymous Auth)
- **Animations**: Framer Motion / Motion
- **Hosting**: GitHub Pages with a custom domain

## Setup

### 1. Create a Supabase Project

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Create a new project
3. Go to **Authentication > Providers** and ensure **Anonymous Sign-ins** is enabled
4. Copy your project URL and anon key from **Settings > API**

### 2. Run Database Migrations

Apply the SQL migrations from the `supabase/migrations/` directory:

```bash
supabase link --project-ref your-project-ref
supabase db push
```

Or manually run each migration in order from `00001_create_tables.sql` through `00017_client_error_logs.sql` in the Supabase SQL Editor.

### 3. Seed Dev Config (Optional)

If you want dev mode access, insert a row into `dev_config`:

```sql
INSERT INTO dev_config (id, code, owner_code)
VALUES (1, 'your-shared-code', 'your-owner-code');
```

### 4. Configure Environment Variables

```bash
cp .env.example .env
```

Fill in:

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### 5. Run Locally

```bash
npm install
npm run dev
```

Open [http://localhost:5173/](http://localhost:5173/).

### 6. Deploy to GitHub Pages / Custom Domain

Deployment is automated through GitHub Actions. Every push to `main` builds and deploys the site.

**One-time setup:**

1. In GitHub, open **Settings > Pages**
2. Set **Source** to **GitHub Actions**
3. In **Settings > Secrets and variables > Actions**, add:

| Secret Name | Value |
|---|---|
| `VITE_SUPABASE_URL` | `https://your-project.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | your Supabase anon key |

The repo includes `public/CNAME` so the custom domain stays attached across deploys:

```txt
luckyseven.site
```

The app uses `HashRouter`, so routes work correctly on GitHub Pages without a custom `404.html` fallback. URLs look like:

```txt
https://luckyseven.site/#/game/abc123
```

## Project Structure

```txt
src/
|-- lib/
|   |-- supabase.ts             # Supabase client + anonymous auth
|   |-- supabaseGameService.ts  # RPC wrappers for gameplay, chat, stats, rematch
|   |-- supabaseMappers.ts      # snake_case <-> camelCase mapping
|   |-- types.ts                # Shared game/settings types
|   |-- deck.ts                 # Card generation, shuffle, scoring logic
|   |-- analytics.ts            # Lightweight client analytics
|   |-- errorLogger.ts          # Client-side crash/error logging
|   |-- share.ts                # Shareable join/lobby links
|   `-- sfx.ts                  # WebAudio sound effects
|-- hooks/
|   |-- useAuth.ts              # Supabase anonymous auth hook
|   |-- useGame.ts              # Real-time game state subscriptions
|   |-- useGameActions.ts       # Turn actions and power flows
|   |-- useChat.ts              # Realtime chat
|   |-- useDevMode.ts           # Dev mode access/subscriptions
|   |-- useGameHistory.ts       # Paginated game history
|   |-- useGlobalStats.ts       # Global stats and visits
|   |-- useTurnTimer.ts         # Turn timer / AFK handling
|   `-- ...                     # Animation, layout, and UI hooks
|-- components/
|   |-- ActionBar.tsx           # Main turn controls
|   |-- ChatPanel.tsx           # In-game chat
|   |-- DevPanel.tsx            # Dev tools / inspection UI
|   |-- DrawnCardModal.tsx      # Draw action modal
|   |-- ErrorBoundary.tsx       # Crash guard UI
|   |-- GameLog.tsx             # Action log feed
|   |-- GameModals.tsx          # Power/action modal orchestration
|   |-- PlayerPanel.tsx         # Player card area
|   |-- TurnQueue.tsx           # Turn order display
|   |-- TurnTimer.tsx           # Turn countdown UI
|   |-- VoteKickModal.tsx       # Vote-kick flow
|   `-- ui/                     # Reusable UI primitives
|-- pages/
|   |-- Home.tsx                # Create or join game
|   |-- Join.tsx                # Join by code / auto-join link
|   |-- Lobby.tsx               # Waiting room
|   |-- Game.tsx                # Main game board
|   `-- Results.tsx             # Scores, reveals, rematch
|-- App.tsx                     # Router
|-- main.tsx                    # Entry point + providers
`-- index.css                   # Tailwind + theme variables
public/
`-- CNAME                       # GitHub Pages custom domain
supabase/
|-- functions/
|   `-- maintenance/            # Edge function for scheduled maintenance
`-- migrations/                 # SQL migrations (00001-00017)
.github/
`-- workflows/
    |-- deploy.yml              # Build + deploy to GitHub Pages
    `-- maintenance.yml         # Scheduled maintenance trigger
```

## Database Architecture

All game state is stored in PostgreSQL via Supabase with Row Level Security (RLS) enforcing access control.

### Core Tables

| Table | Purpose |
|---|---|
| `games` | Game metadata, turn state, settings |
| `game_players` | Player info, seat, lock state, connectivity |
| `game_private_state` | Secret hand data, drawn card, known cards |
| `game_internal` | Draw pile and internal-only game state |
| `game_reveals` | End-game hand reveals |
| `game_history` | Action log entries |
| `game_chat` | Chat messages |
| `game_summary` | Post-game scores and stats |
| `game_dev_access` | Dev mode access grants |
| `dev_config` | Dev access codes |
| `feedback` | User feedback submissions |
| `global_stats` | Games played / visits counters |
| `analytics_events` | Lightweight event tracking |
| `client_error_logs` | Client-side crash/error reports |

### Security Model

- **Anonymous Auth**: Players sign in automatically with no account required
- **SECURITY DEFINER RPCs**: Write operations run server-side in Postgres
- **Row Level Security**: Private hand data is only readable by the owning player
- **Pessimistic locking**: RPCs use database locking to prevent race conditions
- **Action versioning**: Every action increments `action_version` to prevent double-applies
- **No card leaking**: Public clients only see allowed public state
- **Reveal pattern**: End-game hands are written to `game_reveals` so results can be shown safely

## Additional Features

- Realtime lobby and gameplay updates
- In-game chat
- Configurable power assignments and deck settings
- Turn timer with AFK protection
- Vote kick flow
- Rematch lobby flow
- Global stats and lightweight analytics
- Client error logging
- Dev mode for inspection/testing
- Scheduled maintenance and archival support

## Multi-Game Concurrency

Multiple games can run simultaneously without interfering with one another:

- **Game isolation**: All state is scoped by `game_id`
- **Scoped subscriptions**: Clients subscribe only to the game they are viewing
- **Unique join codes**: Lobby codes are generated and checked for collisions
- **Anonymous auth per session**: Each tab can join independently
- **Realtime sync**: Updates use Supabase Realtime instead of polling

## License

This project is licensed under the Creative Commons Attribution-NonCommercial 4.0 International License.

You may view, study, and modify the code for personal or educational use.

Commercial use, redistribution for profit, or selling derivative works based on this project is prohibited without permission from the author.
