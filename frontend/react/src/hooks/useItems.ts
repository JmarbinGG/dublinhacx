import { useCallback, useEffect, useState } from 'react'
import { isAbort } from '../api/client'
import { getListing, listListings, type ListingQuery } from '../api/listings'
import { getSummary } from '../api/summary'
import type { Cached } from '../api/offlineCache'
import { search } from '../api/search'
import { getProfile, listUsers } from '../api/users'
import type { ListingType } from '../types'
import { t } from '../i18n'

export type AsyncState<T> = {
  data: T | null
  loading: boolean
  error: string | null
  /** When showing a saved copy because the network is down. */
  cachedAt: number | null
  reload: () => void
}

/**
 * Shared loading/error plumbing for a fetch that depends on `key`. While a
 * new key loads, the previous data stays on screen (no flash of "Loading").
 * Pass key = null to skip fetching.
 */
export function useFetch<T>(
  key: string | null,
  fetcher: (signal: AbortSignal) => Promise<Cached<T>>,
): AsyncState<T> {
  const [state, setState] = useState<Omit<AsyncState<T>, 'reload'>>({
    data: null,
    loading: key !== null,
    error: null,
    cachedAt: null,
  })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (key === null) return
    const controller = new AbortController()
    setState((prev) => ({ ...prev, loading: true, error: null }))

    fetcher(controller.signal)
      .then(({ data, cachedAt }) => setState({ data, loading: false, error: null, cachedAt }))
      .catch((error: unknown) => {
        // A cancelled request is superseded by a newer one - not an error.
        if (isAbort(error)) return
        setState({
          data: null,
          loading: false,
          error: error instanceof Error ? error.message : t('useItems.somethingWentWrong'),
          cachedAt: null,
        })
      })

    return () => controller.abort()
    // `fetcher` is recreated every render, so `key` decides when to refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt])

  const reload = useCallback(() => setAttempt((n) => n + 1), [])
  return { ...state, reload }
}

const keyOf = (prefix: string, value: unknown) => `${prefix}:${JSON.stringify(value)}`

export function useListings(query: ListingQuery | null) {
  return useFetch(query && keyOf('listings', query), (signal) => listListings(query!, signal))
}

export function useListing(id: string | null) {
  return useFetch(id && `listing:${id}`, (signal) => getListing(id!, signal))
}

export function useSearch(params: { q: string; type?: ListingType; community?: string; limit?: number } | null) {
  return useFetch(params && keyOf('search', params), (signal) => search(params!, signal))
}

export function useProfile(id: string | null, includeClosed = false, refreshKey = 0) {
  return useFetch(id && `profile:${id}:${includeClosed}:${refreshKey}`, (signal) =>
    getProfile(id!, includeClosed, signal),
  )
}

export function useUsers(params: { community?: string; q?: string; limit?: number } | null) {
  return useFetch(params && keyOf('users', params), (signal) => listUsers(params!, signal))
}

/** Home summary: per category, count + four nearest. One request, cached. */
export function useSummary(near: { lat: number; lng: number } | null, enabled = true) {
  return useFetch(enabled ? `summary:${near ? `${near.lat},${near.lng}` : ''}` : null, (signal) => getSummary(near, signal))
}
