import { useCallback, useEffect, useRef, useState } from 'react'
import { isAbort } from '../api/client'
import { plainFallback, smartStep, type SmartResult } from '../api/smartSearch'
import { setSearchBusy } from '../lib/searchActivity'
import { baseOf, forgetBase, rememberResult } from '../lib/searchSession'
import type { Listing } from '../types'
import { t } from '../i18n'

export type SmartInput = {
  q: string
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

/**
 * Drives the one search bar. Each search is ONE request: the text, plus -
 * for a follow-up typed on the results page - the previous result's state,
 * so the server can decide whether to narrow it. Only one request is ever
 * in flight; a new search or Cancel aborts it. Requests are cached by their
 * exact body, so back/forward and repeats cost nothing.
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
    // Lets the top bar's search icon act as Cancel while this runs.
    setSearchBusy(() => {
      controller.abort()
      setState((prev) => ({ ...prev, loading: false, loadingMore: false, cancelled: true }))
    })

    ;(async () => {
      const base = baseOf(req.q)
      let res = await smartStep(base ? { q: req.q, state: base, community: req.community } : { q: req.q, community: req.community }, token, signal)
      // An older backend ignores q when state is sent and just replays the
      // previous search. Then run it as a fresh search (never merge on our side).
      if (base && res.source === 'smart' && res.state.q !== req.q && res.state.q === base.q) {
        forgetBase(req.q)
        res = await smartStep({ q: req.q, community: req.community }, token, signal)
      }
      return res
    })()
      .catch((error: unknown) => plainFallback(req.q, 0, error, signal))
      .then((result) => {
        if (signal.aborted) return
        if (result.source === 'smart') rememberResult(result.state)
        setState({ result, listings: result.listings, loading: false, loadingMore: false, error: null, cancelled: false })
      })
      .catch((error: unknown) => {
        if (isAbort(error) || signal.aborted) return
        setState({ ...IDLE, error: error instanceof Error ? error.message : t('searchResults.searchFailed') })
      })
      // Only the newest search may clear the busy flag.
      .finally(() => controllerRef.current === controller && setSearchBusy(null))

    return () => {
      controller.abort()
      setSearchBusy(null)
    }
  }, [key, token, attempt])

  const loadMore = useCallback(() => {
    const current = state.result
    if (!key || !current?.has_more || state.loading || state.loadingMore) return
    const controller = new AbortController()
    controllerRef.current = controller
    const req = JSON.parse(key) as SmartInput
    const offset = state.listings?.length ?? 0
    setState((prev) => ({ ...prev, loadingMore: true }))

    // Paging sends the state back - never the result list - and makes no model call.
    const page =
      current.source === 'smart'
        ? smartStep({ state: current.state, offset, community: req.community }, token, controller.signal)
        : plainFallback(req.q, offset, new Error('fallback'), controller.signal)
    page
      .then((more) =>
        setState((prev) => ({
          ...prev,
          result: { ...more, summary: prev.result?.summary ?? more.summary, matches: { ...prev.result?.matches, ...more.matches } },
          listings: [...(prev.listings ?? []), ...more.listings.filter((l) => !prev.listings?.some((p) => p.id === l.id))],
          loadingMore: false,
        })),
      )
      .catch((error: unknown) => {
        if (isAbort(error)) return
        setState((prev) => ({ ...prev, loadingMore: false, error: error instanceof Error ? error.message : t('searchResults.searchFailed') }))
      })
  }, [key, token, state.result, state.listings, state.loading, state.loadingMore])

  const cancel = useCallback(() => {
    controllerRef.current?.abort()
    setState((prev) => ({ ...prev, loading: false, loadingMore: false, cancelled: true }))
  }, [])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  return { ...state, loadMore, cancel, retry }
}
