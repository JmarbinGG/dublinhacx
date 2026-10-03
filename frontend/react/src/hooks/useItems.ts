import { useEffect, useState } from 'react'
import { getItem, getMyItems, listItems } from '../api/items'
import type { Cached } from '../api/offlineCache'
import type { Item } from '../types'

type AsyncState<T> = {
  data: T | null
  loading: boolean
  error: string | null
  /** When showing a saved copy because the network is down. */
  cachedAt: number | null
}

const INITIAL = { data: null, loading: true, error: null, cachedAt: null }

/** Shared loading/error plumbing for a single fetch that depends on `key`. */
function useFetch<T>(
  key: string,
  fetcher: (signal: AbortSignal) => Promise<Cached<T>>,
): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>(INITIAL)

  useEffect(() => {
    const controller = new AbortController()
    setState(INITIAL)

    fetcher(controller.signal)
      .then(({ data, cachedAt }) => setState({ data, loading: false, error: null, cachedAt }))
      .catch((error: unknown) => {
        // A cancelled request is superseded by a newer one - not an error.
        if (error instanceof DOMException && error.name === 'AbortError') return
        setState({
          data: null,
          loading: false,
          error: error instanceof Error ? error.message : 'Something went wrong.',
          cachedAt: null,
        })
      })

    return () => controller.abort()
    // `fetcher` is recreated every render, so `key` is what actually decides
    // when to refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return state
}

/** Listings matching `query`. An empty query browses everything. */
export function useItems(query: string) {
  return useFetch(`items:${query}`, (signal) => listItems(query, signal))
}

/** A single listing. The token decides whether contact_email comes back. */
export function useItem(id: string, token: string | null) {
  return useFetch(`item:${id}:${token ?? ''}`, (signal) => getItem(id, token, signal))
}

/** The signed-in user's own listings; `[]` without a token. Changing
 * `refreshKey` refetches. */
export function useMyItems(token: string | null, refreshKey = 0): AsyncState<Item[]> {
  return useFetch(`mine:${token ?? ''}:${refreshKey}`, async (signal) => ({
    data: token ? await getMyItems(token, signal) : [],
    cachedAt: null,
  }))
}
