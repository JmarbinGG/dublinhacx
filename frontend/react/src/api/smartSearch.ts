import type { Listing, SearchResponse, UserPublic } from '../types'
import { ApiError, isAbort, isNetworkError, request } from './client'
import { cachedListings, readCache, writeCache } from './offlineCache'

/**
 * One search bar. The client sends the query (plus any refinements) and
 * renders whatever comes back; the server decides whether it's a simple
 * keyword lookup or needs the AI. Proposed contract - see
 * FRONTEND_AI_CONTRACT.md:
 *
 *   POST /api/search
 *   { q, refinements, exclude, community, filters, offset, limit, compact, allow_ai, search_id? }
 *   -> { route, ai, interpreted, suggestions, listings, users?, search_id?, offset, has_more }
 *
 * Fallbacks, in order: the old GET /api/search (route missing, error, timeout,
 * 429), then listings saved on this device (offline). Exactly one request is
 * in flight at a time - the caller aborts the previous one.
 */

export const SMART_PAGE = 12

export type Suggestion = { code: string; label: string }

export type SmartRequest = {
  q: string
  refinements: string[]
  /** Interpreted terms the user removed. */
  exclude: string[]
  community: string | null
  filters: { type?: string; kind?: string; exchange?: string; scope?: string }
  offset: number
  search_id?: string
  /** False when the user switched AI off in Data saver - simple route only. */
  allow_ai: boolean
}

export type SmartResult = {
  route: 'simple' | 'complex'
  ai: boolean
  interpreted: string[]
  suggestions: Suggestion[]
  listings: Listing[]
  users: UserPublic[]
  search_id?: string
  offset: number
  has_more: boolean
  /** Where the answer came from. */
  source: 'smart' | 'plain' | 'offline' | 'demo'
  /** One-line explanation when we fell back. */
  note: string | null
  cachedAt: number | null
}

const isString = (v: unknown): v is string => typeof v === 'string'
const clip = (s: string, max: number) => s.slice(0, max)

/** Reject anything that doesn't match the contract; drop malformed rows. */
function parse(raw: unknown): Omit<SmartResult, 'source' | 'note' | 'cachedAt'> {
  const body = raw as Record<string, unknown> | null
  if (!body || !Array.isArray(body.listings)) throw new ApiError('Unexpected search response.', 502)
  const listings = body.listings.filter(
    (l): l is Listing =>
      !!l && typeof l === 'object' && Number.isInteger((l as Listing).id) && isString((l as Listing).title) &&
      !!(l as Listing).owner && typeof (l as Listing).owner === 'object',
  )
  return {
    route: body.route === 'complex' ? 'complex' : 'simple',
    ai: body.ai === true,
    interpreted: Array.isArray(body.interpreted) ? body.interpreted.filter(isString).map((t) => clip(t, 40)).slice(0, 8) : [],
    suggestions: Array.isArray(body.suggestions)
      ? body.suggestions
          .filter((s): s is Suggestion => !!s && isString((s as Suggestion).code) && isString((s as Suggestion).label))
          .map((s) => ({ code: clip(s.code, 40), label: clip(s.label, 40) }))
          .slice(0, 6)
      : [],
    listings,
    users: Array.isArray(body.users) ? (body.users as UserPublic[]).filter((u) => u && Number.isInteger(u.id)).slice(0, 12) : [],
    search_id: isString(body.search_id) && body.search_id.length <= 128 ? body.search_id : undefined,
    offset: typeof body.offset === 'number' ? body.offset : 0,
    has_more: body.has_more === true,
  }
}

/** Normalised cache key: same query + refinements => same entry (back button, repeats). */
function keyOf(req: SmartRequest) {
  const norm = (s: string) => s.trim().toLowerCase()
  return `smart:${JSON.stringify([norm(req.q), req.refinements.map(norm), req.exclude.map(norm), req.community, req.filters, req.offset])}`
}

function words(text: string) {
  return text.toLowerCase().split(/\s+/).filter(Boolean)
}

/** Old endpoint: refinements become extra keywords (every word must match). */
async function plainSearch(req: SmartRequest, signal?: AbortSignal) {
  const limit = req.offset + SMART_PAGE
  const res = await request<SearchResponse>('/api/search', {
    params: { q: [req.q, ...req.refinements].join(' '), type: req.filters.type, limit },
    signal,
  })
  return {
    listings: res.listings.slice(req.offset),
    users: req.offset === 0 ? res.users : [],
    has_more: res.listings.length >= limit,
  }
}

/** Offline: match every word of the query and refinements against saved listings. */
function localSearch(req: SmartRequest) {
  const { rows, savedAt } = cachedListings<Listing>()
  const needles = words([req.q, ...req.refinements].join(' '))
  const hits = rows.filter((l) => {
    const hay = [l.title, l.description, l.category, l.quantity, l.price, l.exchange, l.owner?.community, ...(l.tags ?? [])]
      .join(' ')
      .toLowerCase()
    return needles.every((n) => hay.includes(n))
  })
  return { hits, savedAt }
}

const base = { route: 'simple' as const, ai: false, interpreted: [], suggestions: [], search_id: undefined }

export async function smartSearch(req: SmartRequest, token: string | null, signal?: AbortSignal): Promise<SmartResult> {
  const key = keyOf(req)

  try {
    const raw = await request<unknown>('/api/search', {
      method: 'POST',
      json: { ...req, limit: SMART_PAGE, compact: true },
      token,
      signal,
      timeoutMs: 20_000,
    })
    const data = parse(raw)
    writeCache(key, data)
    return { ...data, source: 'smart', note: null, cachedAt: null }
  } catch (error) {
    if (isAbort(error)) throw error

    // Route not on the backend yet (404/405): in dev, a labelled demo.
    if (import.meta.env.DEV && error instanceof ApiError && (error.status === 404 || error.status === 405)) {
      const { mockSmartSearch } = await import('./smartSearchMock')
      const data = parse(await mockSmartSearch(req, signal))
      return { ...data, source: 'demo', note: null, cachedAt: null }
    }

    // Offline: a saved copy of this exact search, else match saved listings.
    if (isNetworkError(error) && !navigator.onLine) {
      const cached = readCache<Omit<SmartResult, 'source' | 'note' | 'cachedAt'>>(key)
      if (cached) return { ...cached.data, source: 'offline', note: null, cachedAt: cached.savedAt }
      const { hits, savedAt } = localSearch(req)
      return {
        ...base,
        listings: hits.slice(req.offset, req.offset + SMART_PAGE),
        users: [],
        offset: req.offset,
        has_more: hits.length > req.offset + SMART_PAGE,
        source: 'offline',
        note: "You're offline - showing matches from listings saved on this phone.",
        cachedAt: savedAt,
      }
    }

    // Anything else (error, timeout, 429): plain keyword results.
    const note =
      error instanceof ApiError && error.status === 429
        ? `Search is busy${error.retryAfter ? ` - smart search is back in ${error.retryAfter} s` : ''}. Showing plain keyword results.`
        : 'Smart search is unavailable right now. Showing plain keyword results.'
    try {
      const plain = await plainSearch(req, signal)
      return { ...base, ...plain, offset: req.offset, source: 'plain', note, cachedAt: null }
    } catch (plainError) {
      if (!isNetworkError(plainError)) throw plainError
      // Server unreachable even though the phone thinks it's online.
      const { hits, savedAt } = localSearch(req)
      if (!hits.length) throw plainError
      return {
        ...base,
        listings: hits.slice(req.offset, req.offset + SMART_PAGE),
        users: [],
        offset: req.offset,
        has_more: hits.length > req.offset + SMART_PAGE,
        source: 'offline',
        note: "Can't reach Banyan - showing matches from listings saved on this phone.",
        cachedAt: savedAt,
      }
    }
  }
}
