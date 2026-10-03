import type { ListingType, SearchResponse } from '../types'
import { request } from './client'
import { withOfflineCache, type Cached } from './offlineCache'

/**
 * GET /api/search?q=&type=&community=&limit= -> { query, engine, listings, users }.
 * `engine` is "ai" when the backend's AI search service answered, else
 * "keyword" - same shape either way.
 */
export function search(
  params: { q: string; type?: ListingType; community?: string; limit?: number },
  signal?: AbortSignal,
): Promise<Cached<SearchResponse>> {
  return withOfflineCache(`search:${JSON.stringify(params)}`, () =>
    request<SearchResponse>('/api/search', { params, signal }),
  )
}
