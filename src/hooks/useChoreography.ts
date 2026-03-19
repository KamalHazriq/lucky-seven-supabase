import { useCallback, useRef, useState } from 'react'
import type { Card } from '../lib/types'
import { useAnimationQueue } from './useAnimationQueue'

/**
 * Choreography phases for queued visual resolution.
 *
 * `staging` is the resting visual state for a drawn / taken card.
 * All `fly*` phases are transient overlay flights driven by the queue.
 */
export type ChoreographyPhase =
  | 'idle'
  | 'staging'
  | 'flyToStaging'
  | 'flyToSlot'
  | 'flySwapToDiscard'
  | 'flyToPlayer'
  | 'flyToDiscard'

export interface StagingState {
  card: Card | null
  source: 'discard' | 'pile' | null
  faceUp: boolean
  ownerColor?: string
  pending?: boolean
}

export interface ChoreographyState {
  phase: ChoreographyPhase
  staging: StagingState
  flyFrom: DOMRect | null
  flyTo: DOMRect | null
  flyFaceUp: boolean
  flyCard: Card | null
  flyOwnerColor?: string
  flyDuration: number
}

interface ServerStageSnapshot {
  card: Card | null
  source: 'discard' | 'pile' | null
  ownerColor?: string
}

interface FlightRequest {
  phase: Exclude<ChoreographyPhase, 'idle' | 'staging'>
  from: DOMRect
  to: DOMRect
  faceUp: boolean
  card: Card | null
  ownerColor?: string
  duration: number
}

const INITIAL_STAGING: StagingState = {
  card: null,
  source: null,
  faceUp: false,
  ownerColor: undefined,
  pending: false,
}

const INITIAL_STATE: ChoreographyState = {
  phase: 'idle',
  staging: INITIAL_STAGING,
  flyFrom: null,
  flyTo: null,
  flyFaceUp: false,
  flyCard: null,
  flyOwnerColor: undefined,
  flyDuration: 1.0,
}

const EMPTY_SERVER_STAGE: ServerStageSnapshot = {
  card: null,
  source: null,
  ownerColor: undefined,
}

function clearFlight(state: ChoreographyState): ChoreographyState {
  return {
    ...state,
    flyFrom: null,
    flyTo: null,
    flyFaceUp: false,
    flyCard: null,
    flyOwnerColor: undefined,
    flyDuration: 1.0,
  }
}

export function useChoreography() {
  const [state, setState] = useState<ChoreographyState>(INITIAL_STATE)
  const stateRef = useRef<ChoreographyState>(INITIAL_STATE)
  const flightResolverRef = useRef<(() => void) | null>(null)
  const latestServerStageRef = useRef<ServerStageSnapshot>(EMPTY_SERVER_STAGE)
  const suppressServerStageRef = useRef(false)
  const { enqueue, clear: clearQueue } = useAnimationQueue()

  const commit = useCallback((updater: ChoreographyState | ((prev: ChoreographyState) => ChoreographyState)) => {
    setState((prev) => {
      const next = typeof updater === 'function'
        ? (updater as (prev: ChoreographyState) => ChoreographyState)(prev)
        : updater
      stateRef.current = next
      return next
    })
  }, [])

  const resolveFlight = useCallback(() => {
    const resolve = flightResolverRef.current
    flightResolverRef.current = null
    resolve?.()
  }, [])

  const wait = useCallback((ms: number) => new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms)
  }), [])

  const playFlight = useCallback((flight: FlightRequest) => new Promise<void>((resolve) => {
    flightResolverRef.current = () => {
      flightResolverRef.current = null
      resolve()
    }

    commit((prev) => ({
      ...prev,
      phase: flight.phase,
      flyFrom: flight.from,
      flyTo: flight.to,
      flyFaceUp: flight.faceUp,
      flyCard: flight.card,
      flyOwnerColor: flight.ownerColor,
      flyDuration: flight.duration,
    }))
  }), [commit])

  const rebuildStageFromLatest = useCallback((fallback: StagingState) => {
    const latest = latestServerStageRef.current

    if (latest.source === fallback.source) {
      return {
        card: latest.card ?? fallback.card,
        source: latest.source,
        faceUp: !!latest.card,
        ownerColor: latest.ownerColor ?? fallback.ownerColor,
        pending: !latest.card,
      } satisfies StagingState
    }

    return fallback
  }, [])

  const reconstructStaging = useCallback((
    card: Card | null,
    source: 'pile' | 'discard' | null,
    ownerColor?: string,
  ) => {
    latestServerStageRef.current = { card, source, ownerColor }

    if (!source) {
      suppressServerStageRef.current = false
      commit((prev) => {
        const cleared = clearFlight({
          ...prev,
          staging: INITIAL_STAGING,
        })
        return prev.phase === 'staging'
          ? { ...cleared, phase: 'idle' }
          : cleared
      })
      return
    }

    if (suppressServerStageRef.current) return

    commit((prev) => {
      if (prev.phase !== 'idle' && prev.phase !== 'staging') {
        return prev
      }

      return {
        ...clearFlight(prev),
        phase: 'staging',
        staging: {
          card,
          source,
          faceUp: !!card,
          ownerColor: ownerColor ?? prev.staging.ownerColor,
          pending: !card,
        },
      }
    })
  }, [commit])

  const startDiscardTake = useCallback((
    discardCard: Card,
    fromRect: DOMRect,
    stagingRect: DOMRect,
    ownerColor?: string,
  ) => {
    suppressServerStageRef.current = false

    void enqueue(async (isCurrent) => {
      commit((prev) => ({
        ...clearFlight(prev),
        phase: 'flyToStaging',
        staging: INITIAL_STAGING,
      }))

      await playFlight({
        phase: 'flyToStaging',
        from: fromRect,
        to: stagingRect,
        faceUp: true,
        card: discardCard,
        ownerColor,
        duration: 1.05,
      })

      if (!isCurrent()) return

      commit((prev) => ({
        ...clearFlight(prev),
        phase: 'staging',
        staging: rebuildStageFromLatest({
          card: discardCard,
          source: 'discard',
          faceUp: true,
          ownerColor,
          pending: false,
        }),
      }))
    })
  }, [commit, enqueue, playFlight, rebuildStageFromLatest])

  const startPileDraw = useCallback((
    fromRect: DOMRect,
    stagingRect: DOMRect,
    ownerColor?: string,
  ) => {
    suppressServerStageRef.current = false

    void enqueue(async (isCurrent) => {
      commit((prev) => ({
        ...clearFlight(prev),
        phase: 'flyToPlayer',
        staging: INITIAL_STAGING,
      }))

      await playFlight({
        phase: 'flyToPlayer',
        from: fromRect,
        to: stagingRect,
        faceUp: false,
        card: null,
        ownerColor,
        duration: 1.0,
      })

      if (!isCurrent()) return

      commit((prev) => ({
        ...clearFlight(prev),
        phase: 'staging',
        staging: rebuildStageFromLatest({
          card: null,
          source: 'pile',
          faceUp: false,
          ownerColor,
          pending: true,
        }),
      }))
    })
  }, [commit, enqueue, playFlight, rebuildStageFromLatest])

  const startSwapFromStaging = useCallback((
    stagingRect: DOMRect,
    slotRect: DOMRect,
    discardRect: DOMRect,
    swapCard: Card | null,
    ownerColor?: string,
  ) => {
    suppressServerStageRef.current = true

    void enqueue(async (isCurrent) => {
      const staged = stateRef.current.staging
      const stageOwnerColor = staged.ownerColor ?? ownerColor

      commit((prev) => ({
        ...clearFlight(prev),
        phase: 'flyToSlot',
        staging: INITIAL_STAGING,
      }))

      await playFlight({
        phase: 'flyToSlot',
        from: stagingRect,
        to: slotRect,
        faceUp: staged.faceUp,
        card: staged.card,
        ownerColor: stageOwnerColor,
        duration: 0.95,
      })

      if (!isCurrent()) return

      await wait(40)
      if (!isCurrent()) return

      await playFlight({
        phase: 'flySwapToDiscard',
        from: slotRect,
        to: discardRect,
        faceUp: !!swapCard,
        card: swapCard,
        ownerColor: stageOwnerColor,
        duration: 0.85,
      })

      if (!isCurrent()) return

      commit((prev) => ({
        ...clearFlight(prev),
        phase: 'idle',
        staging: INITIAL_STAGING,
      }))
    })
  }, [commit, enqueue, playFlight, wait])

  const startDiscardAction = useCallback((
    fromRect: DOMRect,
    toRect: DOMRect,
    card: Card | null,
    faceUp: boolean,
    ownerColor?: string,
  ) => {
    suppressServerStageRef.current = true

    void enqueue(async (isCurrent) => {
      const stageOwnerColor = stateRef.current.staging.ownerColor ?? ownerColor

      commit((prev) => ({
        ...clearFlight(prev),
        phase: 'flyToDiscard',
        staging: INITIAL_STAGING,
      }))

      await playFlight({
        phase: 'flyToDiscard',
        from: fromRect,
        to: toRect,
        faceUp,
        card,
        ownerColor: stageOwnerColor,
        duration: 0.88,
      })

      if (!isCurrent()) return

      commit((prev) => ({
        ...clearFlight(prev),
        phase: 'idle',
        staging: INITIAL_STAGING,
      }))
    })
  }, [commit, enqueue, playFlight])

  const reset = useCallback(() => {
    suppressServerStageRef.current = false
    latestServerStageRef.current = EMPTY_SERVER_STAGE
    clearQueue()
    resolveFlight()
    commit(INITIAL_STATE)
  }, [clearQueue, commit, resolveFlight])

  const completeFlight = useCallback(() => {
    resolveFlight()
  }, [resolveFlight])

  return {
    choreo: state,
    startDiscardTake,
    startSwapFromStaging,
    startDiscardAction,
    startPileDraw,
    reconstructStaging,
    completeFlight,
    reset,
  }
}
