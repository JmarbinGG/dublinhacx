import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { listCommunities } from '../api/items'
import { useAuth } from '../auth/AuthContext'
import { distanceMiles } from '../lib/geo'
import type { Community } from '../types'

const HOME_KEY = 'byproduct.homeCommunity'

/** Up to this many miles counts as "nearby" - the walk-or-short-drive radius. */
export const NEARBY_MILES = 5

export type DistanceTone = 'home' | 'near' | 'far' | 'unknown'

type CommunityContextValue = {
  communities: Community[]
  loading: boolean
  error: string | null
  home: Community | null
  setHomeId: (id: string) => void
  /** Miles from home, or null when no home is chosen / community unknown. */
  distanceTo: (communityId: string) => number | null
  describeDistance: (communityId: string) => { text: string; tone: DistanceTone }
}

const CommunityContext = createContext<CommunityContextValue | null>(null)

function readHomeId(): string | null {
  try {
    return localStorage.getItem(HOME_KEY)
  } catch {
    return null
  }
}

export function CommunityProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const [communities, setCommunities] = useState<Community[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [homeId, setHomeIdState] = useState<string | null>(() => readHomeId())

  useEffect(() => {
    const controller = new AbortController()
    listCommunities(controller.signal)
      .then(({ data }) => setCommunities(data))
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return
        setError(err instanceof Error ? err.message : 'Could not load communities.')
      })
      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [])

  function setHomeId(id: string) {
    setHomeIdState(id)
    try {
      localStorage.setItem(HOME_KEY, id)
    } catch {
      // Not persisted - it'll just reset next visit.
    }
  }

  // A signed-in user's account community is the default home on this device.
  const accountCommunity = user?.community_id ?? null
  const effectiveHomeId = homeId ?? accountCommunity

  const value = useMemo<CommunityContextValue>(() => {
    const byId = new Map(communities.map((community) => [community.id, community]))
    const home = (effectiveHomeId && byId.get(effectiveHomeId)) || null

    function distanceTo(communityId: string) {
      const other = byId.get(communityId)
      return home && other ? distanceMiles(home, other) : null
    }

    return {
      communities,
      loading,
      error,
      home,
      setHomeId,
      distanceTo,
      describeDistance(communityId) {
        const name = byId.get(communityId)?.name ?? 'Unknown community'
        if (home?.id === communityId) return { text: `In ${name}`, tone: 'home' }
        const miles = distanceTo(communityId)
        if (miles === null) return { text: name, tone: 'unknown' }
        const rounded = miles < 1 ? '<1' : String(Math.round(miles))
        return {
          text: `${rounded} mi away · ${name}`,
          tone: miles <= NEARBY_MILES ? 'near' : 'far',
        }
      },
    }
  }, [communities, loading, error, effectiveHomeId])

  return <CommunityContext.Provider value={value}>{children}</CommunityContext.Provider>
}

export function useCommunities(): CommunityContextValue {
  const context = useContext(CommunityContext)
  if (!context) throw new Error('useCommunities must be used inside <CommunityProvider>')
  return context
}
