import { useCallback, useRef } from 'react'

type QueueTask = (isCurrent: () => boolean) => void | Promise<void>

/**
 * Small sequential task queue for visual-only animation work.
 * Tasks run in order and can be invalidated wholesale via clear().
 */
export function useAnimationQueue() {
  const tailRef = useRef<Promise<void>>(Promise.resolve())
  const generationRef = useRef(0)

  const enqueue = useCallback((task: QueueTask): Promise<void> => {
    const generation = generationRef.current
    const isCurrent = () => generation === generationRef.current

    const next = tailRef.current
      .catch(() => undefined)
      .then(async () => {
        if (!isCurrent()) return
        await task(isCurrent)
      })

    tailRef.current = next.catch(() => undefined)
    return next
  }, [])

  const clear = useCallback(() => {
    generationRef.current += 1
    tailRef.current = Promise.resolve()
  }, [])

  return { enqueue, clear }
}
