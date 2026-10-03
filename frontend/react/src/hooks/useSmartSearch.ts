import { useCallback, useEffect, useRef, useState } from 'react'
import { isAbort } from '../api/client'
import { plainFallback, smartStep, type SearchState, type SmartResult } from '../api/smartSearch'
import type { Listing } from '../types'

export type SmartInput = {
  q: string
  /** Raw refinement terms, oldest first - sent one per step, never interpreted here. */
  refinements: string[]
  /** Interpreted terms the user removed. */
  exclude: string[]
  /** Inline filters that override the server's state when set. */
  filters: { type?: string; kind?: string; exchange?: string; maxKm?: number }
  community: string | null
}

type State = {
  result: SmartResult | null
  listings: Listing[] | null
  loading: boolean
  loadingMore: boolean
  error: string | null
  cancelled: boolean
}

const IDLE: State = { result: null, listings: null, loading: false, loadingMore: false, error: null, cancelled: false }

/** Apply removed terms and inline filters to the server's state. Returns
 * null when nothing changes (no extra request needed). */
function edit(state: SearchState, input: SmartInput): SearchState | null {
  const next: SearchState = { ...state, terms: state.terms.filter((t) => !input.exclude.includes(t)) }
  const f = input.filters
  if (f.type) next.type = f.type
  if (f.kind) next.kind = f.kind
  if (f.exchange) next.exchange = f.exchange
  if (f.maxKm) next.max_km = f.maxKm
  // Removing every interpreted term would search for nothing - keep at least one.
  if (next.terms.length === 0) next.terms = state.terms.slice(0, 1)
  return JSON.stringify(next) === JSON.stringify(state) ? null : next
}

/**
 * Drives the one search bar. A search is a short chain of small requests:
 * the query, then one step per refinement, then one edit step if terms were
 * removed or filters set. Each step is cached by its exact body, so
 * removing the last refinement or going back costs nothing. Only one
 * request is ever in flight; a change or Cancel aborts the chain.
 */
export function useSmartSearch(input: SmartInput | null, token: string | null) {
  const [state, setState] = useState<State>(IDLE)
  const controllerRef = useRef<AbortController | null>(null)
  const [attempt, setAttempt] = useState(0)
  const key = input ? JSON.stringify(input) : null

  useEffect(() => {
    controllerRef.current?.abort()
    if (!key) return
    const controller = new AbortController()
    controllerRef.current = controller
    const signal = controller.signal
    const req = JSON.parse(key) as SmartInput
    setState((prev) => ({ ...prev, loading: true, error: null, cancelled: false }))

    ;(async () => {
      const community = req.community
      let res = await smartStep({ q: req.q, community }, token, signal)
      for (const term of req.refinements) {
        res = await smartStep({ state: res.state, refine: term, community }, token, signal)
      }
      const edited = edit(res.state, req)
      if (edited) res = await smartStep({ state: edited, community }, token, signal)
      return res
    })()
      .catch((error: unknown) => plainFallback(req.q, req.refinements, 0, error, signal))
      .then((result) => {
        if (!signal.aborted) {
          setState({ result, listings: result.listings, loading: false, loadingMore: false, error: null, cancelled: false })
        }
      })
      .catch((error: unknown) => {
        if (isAbort(error) || signal.aborted) return
        setState({ ...IDLE, error: error instanceof Error ? error.message : 'Search failed.' })
      })

    return () => controller.abort()
  }, [key, token, attempt])

  const loadMore = useCallback(() => {
    const current = state.result
    if (!key || !current?.has_more || state.loading || state.loadingMore) return
    const controller = new AbortController()
    controllerRef.current = controller
    const req = JSON.parse(key) as SmartInput
    const offset = state.listings?.length ?? 0
    setState((prev) => ({ ...prev, loadingMore: true }))

    // Paging sends the state back - never the result list.
    const page =
      current.source === 'smart'
        ? smartStep({ state: current.state, offset, community: req.community }, token, controller.signal)
        : plainFallback(req.q, req.refinements, offset, new Error('fallback'), controller.signal)
    page
      .then((more) =>
        setState((prev) => ({
          ...prev,
          result: { ...more, matches: { ...prev.result?.matches, ...more.matches } },
          listings: [...(prev.listings ?? []), ...more.listings.filter((l) => !prev.listings?.some((p) => p.id === l.id))],
          loadingMore: false,
        })),
      )
      .catch((error: unknown) => {
        if (isAbort(error)) return
        setState((prev) => ({ ...prev, loadingMore: false, error: error instanceof Error ? error.message : 'Search failed.' }))
      })
  }, [key, token, state.result, state.listings, state.loading, state.loadingMore])

  const cancel = useCallback(() => {
    controllerRef.current?.abort()
    setState((prev) => ({ ...prev, loading: false, loadingMore: false, cancelled: true }))
  }, [])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  return { ...state, loadMore, cancel, retry }
}
