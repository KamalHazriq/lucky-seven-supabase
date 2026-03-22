import { Suspense, lazy } from 'react'
import { Routes, Route, useParams } from 'react-router-dom'

const Home = lazy(() => import('./pages/Home.tsx'))
const Lobby = lazy(() => import('./pages/Lobby.tsx'))
const Game = lazy(() => import('./pages/Game.tsx'))
const Results = lazy(() => import('./pages/Results.tsx'))
const Join = lazy(() => import('./pages/Join.tsx'))

function RouteLoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

function LobbyRoute() {
  const { gameId } = useParams<{ gameId: string }>()
  return <Lobby key={gameId} />
}

function GameRoute() {
  const { gameId } = useParams<{ gameId: string }>()
  return <Game key={gameId} />
}

function ResultsRoute() {
  const { gameId } = useParams<{ gameId: string }>()
  return <Results key={gameId} />
}

export default function App() {
  return (
    <Suspense fallback={<RouteLoadingScreen />}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/join" element={<Join />} />
        <Route path="/lobby/:gameId" element={<LobbyRoute />} />
        <Route path="/game/:gameId" element={<GameRoute />} />
        <Route path="/results/:gameId" element={<ResultsRoute />} />
      </Routes>
    </Suspense>
  )
}
