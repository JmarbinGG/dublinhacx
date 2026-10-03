import { useEffect, useState } from 'react'
import { getListing, getMyListings, searchListings } from '../api/listings'
import type { Listing } from '../types'

type AsyncState<T> = {
  data: T | null
  loading: boolean
  error: string | null
}

const INITIAL = { data: null, loading: true, error: null }

/** Shared loading/error plumbing for a single fetch that depends on `key`. */
function useFetch<T>(
  key: string,
  fetcher: (signal: AbortSignal) => Promise<T>,
): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>(INITIAL)

  useEffect(() => {
    const controller = new AbortController()
    setState(INITIAL)

    fetcher(controller.signal)
      .then((data) => setState({ data, loading: false, error: null }))
      .catch((error: unknown) => {
        // A cancelled request is superseded by a newer one - not an error.
        if (error instanceof DOMException && error.name === 'AbortError') return
        setState({
          data: null,
          loading: false,
          error: error instanceof Error ? error.message : 'Something went wrong.',
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
export function useListingSearch(query: string) {
  return useFetch(`search:${query}`, (signal) => searchListings(query, signal))
}

/** A single listing by id. */
export function useListing(id: string): AsyncState<Listing> {
  return useFetch(`listing:${id}`, (signal) => getListing(id, signal))
}

/** The signed-in user's own listings. Resolves to `[]` without a token, so
 * callers can pass through whatever `useAuth()` has without an extra check. */
export function useMyListings(token: string | null): AsyncState<Listing[]> {
  return useFetch(`mine:${token ?? ''}`, (signal) =>
    token ? getMyListings(token, signal) : Promise.resolve([]),
  )
}
