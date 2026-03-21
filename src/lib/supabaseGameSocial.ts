import { nanoid } from 'nanoid'
import type { LogEntry, PlayerScore } from './types'
import { supabase, ensureAuth } from './supabase'
import { callRpc } from './supabaseRpc'
import { mapRevealRow } from './supabaseMappers'
import type { TableRow } from './supabaseDatabase.generated'

type HistoryEntryRow = Pick<TableRow<'game_history'>, 'ts' | 'msg' | 'event'>

export async function sendChatMessage(gameId: string, text: string): Promise<void> {
  await ensureAuth()
  await callRpc('send_chat_message', {
    p_game_id: gameId,
    p_text: text.slice(0, 300),
    p_msg_id: nanoid(10),
  })
}

export function subscribeReveals(
  gameId: string,
  cb: (scores: PlayerScore[]) => void,
): () => void {
  let scores: PlayerScore[] = []
  let cancelled = false

  const sortAndEmit = () => {
    cb([...scores].sort((a, b) => (a.total !== b.total ? a.total - b.total : b.sevens - a.sevens)))
  }

  const channel = supabase
    .channel(`reveals:${gameId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'game_reveals',
        filter: `game_id=eq.${gameId}`,
      },
      (payload) => {
        if (cancelled) return
        const nextScore = mapRevealRow(payload.new as TableRow<'game_reveals'>)
        const existingIndex = scores.findIndex((score) => score.playerId === nextScore.playerId)
        if (existingIndex >= 0) scores[existingIndex] = nextScore
        else scores.push(nextScore)
        sortAndEmit()
      },
    )

  ensureAuth().then(() => {
    if (cancelled) return
    channel.subscribe()
    supabase
      .from('game_reveals')
      .select('*')
      .eq('game_id', gameId)
      .then(({ data }) => {
        if (cancelled || !data) return
        scores = data.map(mapRevealRow)
        sortAndEmit()
      })
  })

  return () => {
    cancelled = true
    supabase.removeChannel(channel)
  }
}

export async function initiateVoteKick(gameId: string, targetPlayerId: string): Promise<void> {
  await ensureAuth()
  await callRpc('initiate_vote_kick', {
    p_game_id: gameId,
    p_target_player: targetPlayerId,
  })
}

export async function castVoteKick(gameId: string, voteYes: boolean): Promise<void> {
  await ensureAuth()
  await callRpc('cast_vote_kick', {
    p_game_id: gameId,
    p_vote_yes: voteYes,
  })
}

export async function cancelVoteKick(gameId: string): Promise<void> {
  await ensureAuth()
  await callRpc('cancel_vote_kick', { p_game_id: gameId })
}

export async function fetchHistoryPage(
  gameId: string,
  offset: number,
  pageSize = 100,
): Promise<{ entries: LogEntry[]; hasMore: boolean }> {
  const { data, error } = await supabase
    .from('game_history')
    .select('ts, msg, event')
    .eq('game_id', gameId)
    .order('ts', { ascending: false })
    .range(offset, offset + pageSize - 1)

  if (error) throw new Error(error.message)
  if (!data) return { entries: [], hasMore: false }
  const rows = data as HistoryEntryRow[]
  const entries: LogEntry[] = rows.map((entry) => ({
    ts: entry.ts,
    msg: entry.msg,
    event: entry.event,
  }))
  return { entries, hasMore: rows.length === pageSize }
}
