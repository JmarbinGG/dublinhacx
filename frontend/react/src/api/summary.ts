import { GROUPS, groupOf, type GroupId } from '../lib/categories'
import type { Listing } from '../types'
import { ApiError, request } from './client'
import { withOfflineCache, type Cached } from './offlineCache'

/**
 * Home page data in ONE request: per category, a count and the four
 * nearest listings.
 *
 * GET /api/listings/summary (~1.7 KB gzipped). If an older backend lacks
 * it, a single GET /api/listings (nearest first) grouped locally - still
 * one request. Cached either way, so the tiles render offline.
 */

export type GroupSummary = { count: number; items: Listing[] }
export type Summary = Record<GroupId, GroupSummary>

const PER_ROW = 4
// Set if the summary route ever answers 404/405/422 (an older backend), so
// we stop asking for the rest of the session and use the fallback.
let summaryRouteMissing = false

function isSummary(raw: unknown): raw is Summary {
  const body = raw as Record<string, GroupSummary> | null
  return !!body && GROUPS.every((g) => body[g.id] && typeof body[g.id].count === 'number' && Array.isArray(body[g.id].items))
}

export function getSummary(
  near: { lat: number; lng: number } | null,
  signal?: AbortSignal,
): Promise<Cached<Summary>> {
  const params = near ? { lat: near.lat, lng: near.lng } : {}
  return withOfflineCache(`summary:${near ? `${near.lat},${near.lng}` : 'all'}`, async () => {
    if (!summaryRouteMissing) {
      try {
        const raw = await request<unknown>('/api/listings/summary', { params: { ...params, per_group: PER_ROW }, signal })
        if (isSummary(raw)) return raw
      } catch (error) {
        // 404/405/422: route not on this backend - stop asking this session.
        if (!(error instanceof ApiError) || ![404, 405, 422].includes(error.status ?? 0)) throw error
      }
      summaryRouteMissing = true
    }

    const all = await request<Listing[]>('/api/listings', { params: { ...params, limit: 200 }, signal })
    const summary = Object.fromEntries(GROUPS.map((g) => [g.id, { count: 0, items: [] as Listing[] }])) as Summary
    for (const listing of all) {
      const group = summary[groupOf(listing).id]
      group.count++
      if (group.items.length < PER_ROW) group.items.push(listing)
    }
    return summary
  })
}
