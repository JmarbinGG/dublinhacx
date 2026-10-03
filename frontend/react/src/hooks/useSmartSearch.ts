import { useCallback, useEffect, useRef, useState } from 'react'
import { isAbort } from '../api/client'
import { smartSearch, type SmartRequest, type SmartResult } from '../api/smartSearch'
import type { Listing } from '../types'

type State = {
  /** Metadata from the latest page (route, interpreted terms, suggestions...). */
  meta: SmartResult | null
  listings: Listing[] | null
  loading: boolean
  loadingMore: boolean
  error: string | null
  cancelled: boolean
}

const IDLE: State = { meta: null, listings: null, loading: false, loadingMore: false, error: null, cancelled: false }

/**
 * Runs the one search bar's request. Only one request is ever in flight -
 * a new query, refinement or Cancel aborts the previous one, so data is
 * never spent twice. "Show more" fetches the next 12 and appends.
 */
export function useSmartSearch(req: Omit<SmartRequest, 'offset' | 'search_id'> | null, token: string | null) {
  const [state, setState] = useState<State>(IDLE)
  const controllerRef = useRef<AbortController | null>(null)
  const key = req ? JSON.stringify(req) : null
  const [attempt, setAttempt] = useState(0)
  // When only the refinements change, send the server's search_id so it can
  // refine what it already has instead of starting over.
  const lastRef = useRef<{ q: string; search_id?: string }>({ q: '' })

  useEffect(() => {
    controllerRef.current?.abort()
    if (!key) return
    const controller = new AbortController()
    controllerRef.current = controller
    // Keep showing the previous results (dimmed) while the new ones load.
    setState((prev) => ({ ...prev, loading: true, error: null, cancelled: false }))

    const next = JSON.parse(key) as SmartRequest
    const search_id = lastRef.current.q === next.q ? lastRef.current.search_id : undefined
    smartSearch({ ...next, offset: 0, search_id }, token, controller.signal)
      .then((meta) => {
        lastRef.current = { q: next.q, search_id: meta.search_id }
        setState({ meta, listings: meta.listings, loading: false, loadingMore: false, error: null, cancelled: false })
      })
      .catch((error: unknown) => {
        if (isAbort(error)) return
        setState({ ...IDLE, error: error instanceof Error ? error.message : 'Search failed.' })
      })
    return () => controller.abort()
  }, [key, token, attempt])

  const loadMore = useCallback(() => {
    if (!key || state.loading || state.loadingMore || !state.meta?.has_more) return
    const controller = new AbortController()
    controllerRef.current = controller
    setState((prev) => ({ ...prev, loadingMore: true }))
    // Refine/paging send the search_id (if any) - never the result list.
    smartSearch(
      { ...(JSON.parse(key) as SmartRequest), offset: state.listings?.length ?? 0, search_id: state.meta.search_id },
      token,
      controller.signal,
    )
      .then((meta) =>
        setState((prev) => ({
          ...prev,
          meta,
          listings: [...(prev.listings ?? []), ...meta.listings.filter((l) => !prev.listings?.some((p) => p.id === l.id))],
          loadingMore: false,
        })),
      )
      .catch((error: unknown) => {
        if (isAbort(error)) return
        setState((prev) => ({ ...prev, loadingMore: false, error: error instanceof Error ? error.message : 'Search failed.' }))
      })
  }, [key, token, state.loading, state.loadingMore, state.meta, state.listings])

  const cancel = useCallback(() => {
    controllerRef.current?.abort()
    setState((prev) => ({ ...prev, loading: false, loadingMore: false, cancelled: true }))
  }, [])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  return { ...state, loadMore, cancel, retry }
}
