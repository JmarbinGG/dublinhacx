import type { ListingQuery } from '../api/listings'
import { NEARBY_KM } from '../context/CommunityContext'
import type { Point } from './geo'
import { EXCHANGES, LISTING_TYPES, type ExchangeType, type Listing, type ListingKind, type ListingType } from '../types'

export const SCOPES = [
  { id: 'all', label: 'Everywhere' },
  { id: 'town', label: 'My town' },
  { id: 'others', label: 'Other towns' },
  { id: 'near', label: `Within ${NEARBY_KM} km` },
] as const

export const SORTS = [
  { id: 'newest', label: 'Newest first' },
  { id: 'nearest', label: 'Nearest first' },
] as const

export type Scope = (typeof SCOPES)[number]['id']
export type Sort = (typeof SORTS)[number]['id']

export type Filters = {
  q: string
  type: ListingType | ''
  kind: ListingKind | ''
  exchange: ExchangeType | ''
  scope: Scope
  sort: Sort
}

const pick = <T extends string>(value: string | null, allowed: readonly { id: T }[], fallback: T | ''): T | '' =>
  allowed.some((a) => a.id === value) ? (value as T) : fallback

/** Filters live in the URL so a filtered view can be bookmarked or shared. */
export function readFilters(params: URLSearchParams): Filters {
  const kind = params.get('kind')
  return {
    q: params.get('q') ?? '',
    type: pick(params.get('type'), LISTING_TYPES, ''),
    kind: kind === 'offer' || kind === 'request' ? kind : '',
    exchange: pick(params.get('ex'), EXCHANGES, ''),
    scope: (pick(params.get('scope'), SCOPES, 'all') || 'all') as Scope,
    sort: (pick(params.get('sort'), SORTS, 'newest') || 'newest') as Sort,
  }
}

/** Turn URL filters into a GET /api/listings query (exchange is filtered
 * client-side - the API has no parameter for it). */
export function toListingQuery(filters: Filters, home: string | null, homePoint: Point | null, limit: number): ListingQuery {
  const query: ListingQuery = { limit, offset: 0 }
  if (filters.q) query.q = filters.q
  if (filters.type) query.type = filters.type
  if (filters.kind) query.kind = filters.kind
  if (filters.scope === 'town' && home) query.community = home
  if (filters.scope === 'others' && home) query.exclude_community = home
  const wantsDistance = filters.sort === 'nearest' || filters.scope === 'near'
  if (wantsDistance && homePoint) {
    query.lat = Math.round(homePoint.lat * 1000) / 1000
    query.lng = Math.round(homePoint.lng * 1000) / 1000
    if (filters.scope === 'near') query.radius_km = NEARBY_KM
  }
  return query
}

export function filterExchange(listings: Listing[], exchange: ExchangeType | ''): Listing[] {
  return exchange ? listings.filter((l) => l.exchange === exchange) : listings
}
