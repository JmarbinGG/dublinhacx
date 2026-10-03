import { useCallback, useEffect, useRef, useState } from 'react'
import { aiOverview, type AiOverview, type OverviewFilters } from '../api/ai'
import { isAbort } from '../api/client'
import { getListing } from '../api/listings'
import type { Listing } from '../types'

export type ResolvedPick = { listing: Listing; why: string }

type State = {
  overview: AiOverview | null
  picks: ResolvedPick[]
  loading: boolean
  error: string | null
  cachedAt: number | null
}

const IDLE: State = { overview: null, picks: [], loading: false, error: null, cachedAt: null }

/**
 * On-demand AI overview for a search. Only runs when `enabled` (the user
 * pressed "Ask AI"); never per keystroke. Every pick id is checked against
 * real listings - the ones already on screen, else fetched by id - and
 * unknown ids are dropped, so the model can't invent listings.
 */
export function useAiOverview(
  q: string,
  filters: OverviewFilters,
  community: string | null,
  token: string | null,
  enabled: boolean,
  known: Listing[],
) {
  const [state, setState] = useState<State>(IDLE)
  const controllerRef = useRef<AbortController | null>(null)
  const knownRef = useRef(known)
  useEffect(() => {
    knownRef.current = known
  }, [known])
  const filterKey = JSON.stringify(filters)

  const run = useCallback(async () => {
    controllerRef.current?.abort()
    if (!enabled || !q) {
      setState(IDLE)
      return
    }
    const controller = new AbortController()
    controllerRef.current = controller
    setState({ ...IDLE, loading: true })

    try {
      const { data, cachedAt } = await aiOverview(q, JSON.parse(filterKey), community, token, controller.signal)
      const byId = new Map(knownRef.current.map((l) => [l.id, l]))
      const picks: ResolvedPick[] = []
      for (const pick of data.picks) {
        let listing = byId.get(pick.id)
        if (!listing) {
          try {
            listing = (await getListing(String(pick.id), controller.signal)).data
          } catch (error) {
            if (isAbort(error)) throw error
            continue // Unknown id - drop it.
          }
        }
        picks.push({ listing, why: pick.why })
      }
      if (!controller.signal.aborted) setState({ overview: data, picks, loading: false, error: null, cachedAt })
    } catch (error) {
      if (isAbort(error) || controller.signal.aborted) return
      setState({ ...IDLE, error: error instanceof Error ? error.message : 'AI overview failed.' })
    }
  }, [enabled, q, filterKey, community, token])

  useEffect(() => {
    run()
    return () => controllerRef.current?.abort()
  }, [run])

  const cancel = useCallback(() => {
    controllerRef.current?.abort()
    setState({ ...IDLE, error: 'Cancelled.' })
  }, [])

  return { ...state, cancel, retry: run }
}
