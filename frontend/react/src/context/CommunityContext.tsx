import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { listCommunities } from '../api/users'
import { useAuth } from '../auth/AuthContext'
import { distanceKm, type Point } from '../lib/geo'
import type { CommunityStat, Listing } from '../types'

const HOME_KEY = 'banyan.homeCommunity'

export type DistanceTone = 'home' | 'near' | 'far' | 'unknown'

/** Up to this many km counts as "nearby". */
export const NEARBY_KM = 50

type CommunityContextValue = {
  communities: CommunityStat[]
  loading: boolean
  /** The community distances are measured from (your town). */
  home: string | null
  homePoint: Point | null
  setHome: (name: string) => void
  /** Approximate centre of a community, from its members' locations. */
  pointOf: (community: string | null | undefined) => Point | null
  describeDistance: (listing: Listing) => { text: string; tone: DistanceTone; km: number | null }
}

const CommunityContext = createContext<CommunityContextValue | null>(null)

function readHome(): string | null {
  try {
    return localStorage.getItem(HOME_KEY)
  } catch {
    return null
  }
}

export function CommunityProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const [communities, setCommunities] = useState<CommunityStat[]>([])
  const [centres, setCentres] = useState<Map<string, Point>>(() => new Map())
  const [loading, setLoading] = useState(true)
  const [chosenHome, setChosenHome] = useState<string | null>(() => readHome())

  useEffect(() => {
    const controller = new AbortController()
    // Each community comes with its centre (rounded to ~1 km), which is all
    // distances need - one small request, cached for offline.
    listCommunities(controller.signal)
      .then(({ data }) => {
        setCommunities(data)
        setCentres(
          new Map(
            data
              .filter((c) => c.lat != null && c.lng != null)
              .map((c) => [c.name, { lat: c.lat as number, lng: c.lng as number }]),
          ),
        )
      })
      .catch(() => {})
      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [])

  function setHome(name: string) {
    setChosenHome(name)
    try {
      localStorage.setItem(HOME_KEY, name)
    } catch {
      // Not persisted - resets next visit.
    }
  }

  const home = chosenHome || user?.community || null
  // Your own saved location beats the town average when it's your town.
  const ownPoint =
    user && user.community === home && user.latitude != null && user.longitude != null
      ? { lat: user.latitude, lng: user.longitude }
      : null

  const value = useMemo<CommunityContextValue>(() => {
    const pointOf = (community: string | null | undefined) => (community ? (centres.get(community) ?? null) : null)
    const homePoint = ownPoint ?? pointOf(home)

    return {
      communities,
      loading,
      home,
      homePoint,
      setHome,
      pointOf,
      describeDistance(listing) {
        const town = listing.owner.community ?? 'Unknown town'
        if (home && listing.owner.community === home) return { text: 'Your town', tone: 'home', km: 0 }
        const theirs = pointOf(listing.owner.community)
        const km = listing.distance_km ?? (homePoint && theirs ? distanceKm(homePoint, theirs) : null)
        if (km == null) return { text: town, tone: 'unknown', km: null }
        return {
          text: `${km < 1 ? '<1' : Math.round(km)} km · ${town}`,
          tone: km <= NEARBY_KM ? 'near' : 'far',
          km,
        }
      },
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [communities, centres, loading, home, ownPoint?.lat, ownPoint?.lng])

  return <CommunityContext.Provider value={value}>{children}</CommunityContext.Provider>
}

export function useCommunities(): CommunityContextValue {
  const context = useContext(CommunityContext)
  if (!context) throw new Error('useCommunities must be used inside <CommunityProvider>')
  return context
}
