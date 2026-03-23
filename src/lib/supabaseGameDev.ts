import type { Card, DevAccessDoc, PrivatePlayerDoc } from './types'
import { supabase, ensureAuth } from './supabase'
import { callRpc } from './supabaseRpc'
import { mapPrivateStateRow } from './supabaseMappers'
import type { TableRow } from './supabaseDatabase.generated'

type DevAccessRow = TableRow<'game_dev_access'>
type PrivateStateRow = TableRow<'game_private_state'>
type GameInternalDrawPileRow = Pick<TableRow<'game_internal'>, 'draw_pile'>

export async function activateDevMode(gameId: string, code: string): Promise<void> {
  await ensureAuth()
  await callRpc('activate_dev_mode', { p_game_id: gameId, p_code: code })
}

export async function deactivateDevMode(gameId: string): Promise<void> {
  await ensureAuth()
  await callRpc('deactivate_dev_mode', { p_game_id: gameId })
}

export async function devReorderDrawPile(gameId: string, reordered: Card[]): Promise<void> {
  await ensureAuth()
  await callRpc('dev_reorder_draw_pile', {
    p_game_id: gameId,
    p_reordered: reordered,
  })
}

export function subscribeDevAccess(
  gameId: string,
  uid: string,
  cb: (access: DevAccessDoc | null) => void,
): () => void {
  let cancelled = false

  const channel = supabase
    .channel(`dev-access:${gameId}:${uid}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'game_dev_access',
        filter: `game_id=eq.${gameId}`,
      },
      (payload) => {
        if (cancelled) return
        if (payload.eventType === 'DELETE') {
          const oldRow = payload.old as TableRow<'game_dev_access'>
          if (oldRow.uid === uid) cb(null)
          return
        }

        const row = payload.new as TableRow<'game_dev_access'>
        if (row.uid === uid) {
          cb({ activatedAt: row.activated_at, uid: row.uid, privileges: row.privileges })
        }
      },
    )

  ensureAuth()
    .then(async () => {
      if (cancelled) return
      channel.subscribe()
      const { data } = await supabase
        .from('game_dev_access')
        .select('*')
        .eq('game_id', gameId)
        .eq('uid', uid)
        .maybeSingle()
      if (cancelled) return
      const row = data as DevAccessRow | null
      cb(row ? { activatedAt: row.activated_at, uid: row.uid, privileges: row.privileges } : null)
    })
    .catch(() => {
      if (!cancelled) cb(null)
    })

  return () => {
    cancelled = true
    supabase.removeChannel(channel)
  }
}

export function subscribeAllPrivate(
  gameId: string,
  cb: (allPrivate: Record<string, PrivatePlayerDoc>) => void,
): () => void {
  let cancelled = false

  const fetchAll = () => {
    supabase
      .from('game_private_state')
      .select('*')
      .eq('game_id', gameId)
      .then(({ data }) => {
        const rows = (data ?? []) as PrivateStateRow[]
        if (cancelled || rows.length === 0) return
        const next: Record<string, PrivatePlayerDoc> = {}
        for (const row of rows) next[row.player_id] = mapPrivateStateRow(row)
        cb(next)
      })
  }

  const channel = supabase
    .channel(`dev-private:${gameId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'game_private_state',
        filter: `game_id=eq.${gameId}`,
      },
      () => {
        if (!cancelled) fetchAll()
      },
    )

  ensureAuth()
    .then(() => {
      if (cancelled) return
      channel.subscribe()
      fetchAll()
    })
    .catch(() => {
      if (!cancelled) cb({})
    })

  return () => {
    cancelled = true
    supabase.removeChannel(channel)
  }
}

export function subscribeDrawPile(
  gameId: string,
  cb: (cards: Card[]) => void,
): () => void {
  let cancelled = false

  const channel = supabase
    .channel(`dev-drawpile:${gameId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'game_internal',
        filter: `game_id=eq.${gameId}`,
      },
      (payload) => {
        if (cancelled) return
        const row = payload.new as TableRow<'game_internal'>
        cb(row?.draw_pile ?? [])
      },
    )

  ensureAuth()
    .then(async () => {
      if (cancelled) return
      channel.subscribe()
      const { data } = await supabase
        .from('game_internal')
        .select('draw_pile')
        .eq('game_id', gameId)
        .maybeSingle()
      if (cancelled) return
      const row = data as GameInternalDrawPileRow | null
      cb(row?.draw_pile ?? [])
    })
    .catch(() => {
      if (!cancelled) cb([])
    })

  return () => {
    cancelled = true
    supabase.removeChannel(channel)
  }
}
