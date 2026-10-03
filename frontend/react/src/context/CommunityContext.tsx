import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { listCommunities, listUsers } from '../api/users'
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
    Promise.all([
      listCommunities(controller.signal),
      // Public profiles carry lat/lng; averaging them per community gives a
      // town centre to measure distances from. One small request, cached.
      listUsers({ limit: 200 }, controller.signal),
    ])
      .then(([communityRes, userRes]) => {
        setCommunities(communityRes.data)
        const sums = new Map<string, { lat: number; lng: number; n: number }>()
        for (const u of userRes.data) {
          if (!u.community || u.latitude == null || u.longitude == null) continue
          const s = sums.get(u.community) ?? { lat: 0, lng: 0, n: 0 }
          sums.set(u.community, { lat: s.lat + u.latitude, lng: s.lng + u.longitude, n: s.n + 1 })
        }
        setCentres(new Map([...sums].map(([name, s]) => [name, { lat: s.lat / s.n, lng: s.lng / s.n }])))
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
        if (home && listing.owner.community === home) return { text: `In ${town}`, tone: 'home', km: 0 }
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
