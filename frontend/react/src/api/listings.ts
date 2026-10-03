import type { ExchangeType, Listing, ListingKind, ListingStatus, ListingType } from '../types'
import { request } from './client'
import { readCache, withOfflineCache, type Cached } from './offlineCache'

/**
 * Backend routes (backend/routers/listings.py, uploads.py):
 *
 *   GET    /api/listings            filters below, newest first (nearest first with lat/lng)
 *   GET    /api/listings/<id>
 *   POST   /api/listings            create (signed in)
 *   PATCH  /api/listings/<id>       owner only, any field incl. status
 *   DELETE /api/listings/<id>       owner only
 *   POST   /api/uploads             multipart `file` -> { url }
 */

export type ListingQuery = {
  type?: ListingType
  kind?: ListingKind
  status?: ListingStatus
  category?: string
  community?: string
  exclude_community?: string
  owner_id?: number
  q?: string
  lat?: number
  lng?: number
  radius_km?: number
  limit?: number
  offset?: number
}

/** About a dozen at a time - small pages, "Show more" for the rest. */
export const PAGE_SIZE = 12

function cacheKey(query: ListingQuery) {
  const sorted = Object.entries(query)
    .filter(([, value]) => value !== undefined && value !== '')
    .sort(([a], [b]) => a.localeCompare(b))
  return `listings:${new URLSearchParams(sorted.map(([k, v]) => [k, String(v)])).toString()}`
}

/** Offline, falls back to the same query's last result, or to filtering the
 * last unfiltered first page locally. */
export function listListings(query: ListingQuery, signal?: AbortSignal): Promise<Cached<Listing[]>> {
  const key = cacheKey(query)
  return withOfflineCache(
    key,
    () => request<Listing[]>('/api/listings', { params: query, signal }),
    () => readCache<Listing[]>(key) ?? localFilter(query),
  )
}

function localFilter(query: ListingQuery) {
  const all = readCache<Listing[]>(cacheKey({ limit: PAGE_SIZE, offset: 0 }))
  if (!all) return null
  const words = (query.q ?? '').toLowerCase().split(/\s+/).filter(Boolean)
  const data = all.data.filter((listing) => {
    if (query.type && listing.type !== query.type) return false
    if (query.kind && listing.kind !== query.kind) return false
    if (query.community && listing.owner.community !== query.community) return false
    if (query.exclude_community && listing.owner.community === query.exclude_community) return false
    if (query.owner_id !== undefined && listing.owner.id !== query.owner_id) return false
    const haystack = [listing.title, listing.description, listing.category, listing.owner.community, ...listing.tags]
      .join(' ')
      .toLowerCase()
    // Same rule as the backend: every word must appear somewhere.
    return words.every((word) => haystack.includes(word))
  })
  return { data, savedAt: all.savedAt }
}

export function getListing(id: string, signal?: AbortSignal): Promise<Cached<Listing>> {
  return withOfflineCache(`listing:${id}`, () =>
    request<Listing>(`/api/listings/${encodeURIComponent(id)}`, { signal }),
  )
}

export type ListingInput = {
  type: ListingType
  kind: ListingKind
  title: string
  description?: string | null
  category?: string | null
  tags: string[]
  image?: string | null
  quantity?: string | null
  exchange: ExchangeType
  price?: string | null
  /** Offline-queued posts send their queue id; re-sending returns the existing listing. */
  client_id?: string
}

export function createListing(input: ListingInput, token: string): Promise<Listing> {
  return request<Listing>('/api/listings', { method: 'POST', json: input, token })
}

export function updateListing(
  id: number,
  changes: Partial<ListingInput> & { status?: ListingStatus },
  token: string,
): Promise<Listing> {
  return request<Listing>(`/api/listings/${id}`, { method: 'PATCH', json: changes, token })
}

export function deleteListing(id: number, token: string): Promise<{ status: string }> {
  return request(`/api/listings/${id}`, { method: 'DELETE', token })
}

export function uploadImage(file: Blob, token: string, signal?: AbortSignal): Promise<{ url: string }> {
  const form = new FormData()
  form.append('file', file, file instanceof File ? file.name : 'photo.jpg')
  return request<{ url: string }>('/api/uploads', { method: 'POST', form, token, signal, timeoutMs: 60_000 })
}
