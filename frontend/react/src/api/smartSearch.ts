import type { Listing, SearchResponse } from '../types'
import { ApiError, isAbort, isNetworkError, request } from './client'
import { cachedListings, readCache, writeCache } from './offlineCache'

/**
 * The one search bar: POST /api/search/smart (backend/routers/smart_search.py).
 *
 *   new search  { q, community }
 *   refine      { state, refine: "5", community }   - server parses the term
 *   edit        { state }                            - e.g. a removed term or a filter
 *   more        { state, offset }                    - no model call
 *
 * The server decides simple vs complex and keeps no session: `state` comes
 * back with every response and is sent back to refine or page, so a
 * refinement costs a few hundred bytes. The client never interprets terms.
 *
 * Every request is cached by its exact body, so repeats, chip removals and
 * the back button are free. Fallbacks: GET /api/search on any failure, then
 * listings saved on the device when offline.
 */

export const SMART_PAGE = 12
const FRESH_MS = 15 * 60 * 1000

export type SearchState = {
  q: string
  mode: 'simple' | 'complex'
  terms: string[]
  attrs: string[]
  qty?: number | null
  type?: string | null
  kind?: string | null
  exchange?: string | null
  max_km?: number | null
  need?: string | null
  refinements: string[]
}

export type Suggestion = { label: string; refine: string }

export type SmartBody = {
  q?: string
  state?: SearchState
  refine?: string
  community?: string | null
  limit?: number
  offset?: number
}

export type SmartPage = {
  mode: 'simple' | 'complex'
  ai: boolean
  state: SearchState
  suggestions: Suggestion[]
  listings: Listing[]
  /** Per listing id: which interpreted term it matched (complex searches). */
  matches: Record<number, string>
  has_more: boolean
}

export type SmartResult = SmartPage & {
  source: 'smart' | 'plain' | 'offline'
  note: string | null
  cachedAt: number | null
}

const isString = (v: unknown): v is string => typeof v === 'string'
const strings = (v: unknown, max: number, len: number) =>
  Array.isArray(v) ? v.filter(isString).map((s) => s.slice(0, len)).slice(0, max) : []

type Card = {
  id: number
  title: string
  type: string
  kind: string
  exchange: string
  price?: string
  quantity?: string
  community?: string
  distance_km?: number
  image?: string
  image_size_kb?: number
  owner_id: number
  owner_name: string
  match?: string
}

/** Slim card -> the Listing shape the cards render. */
function fromCard(c: Card): Listing {
  return {
    id: c.id,
    title: c.title,
    type: c.type as Listing['type'],
    kind: c.kind as Listing['kind'],
    exchange: c.exchange as Listing['exchange'],
    price: c.price ?? null,
    quantity: c.quantity ?? null,
    image: c.image ?? null,
    image_size_kb: c.image_size_kb ?? null,
    distance_km: c.distance_km ?? null,
    status: 'available',
    tags: [],
    created_at: '',
    updated_at: '',
    owner: { id: c.owner_id, name: c.owner_name, community: c.community ?? null },
  }
}

/** Reject anything off-contract; drop malformed cards. */
function parse(raw: unknown): SmartPage {
  const body = raw as Record<string, unknown> | null
  const state = body?.state as SearchState | undefined
  if (!body || !Array.isArray(body.results) || !state || !isString(state.q)) {
    throw new ApiError('Unexpected search response.', 502)
  }
  const cards = (body.results as Card[]).filter(
    (c) => c && Number.isInteger(c.id) && isString(c.title) && Number.isInteger(c.owner_id) && isString(c.owner_name),
  )
  const matches: Record<number, string> = {}
  for (const c of cards) if (isString(c.match)) matches[c.id] = c.match.slice(0, 40)
  return {
    mode: body.mode === 'complex' ? 'complex' : 'simple',
    ai: body.ai === true,
    state: {
      ...state,
      mode: state.mode === 'complex' ? 'complex' : 'simple',
      terms: strings(state.terms, 8, 40),
      attrs: strings(state.attrs, 6, 30),
      refinements: strings(state.refinements, 10, 100),
      need: isString(state.need) ? state.need.slice(0, 120) : null,
    },
    suggestions: Array.isArray(body.suggestions)
      ? (body.suggestions as Suggestion[])
          .filter((s) => s && isString(s.label) && isString(s.refine))
          .map((s) => ({ label: s.label.slice(0, 40), refine: s.refine.slice(0, 100) }))
          .slice(0, 5)
      : [],
    listings: cards.map(fromCard),
    matches,
    has_more: body.has_more === true,
  }
}

/** One request to /api/search/smart, served from cache when fresh. */
export async function smartStep(body: SmartBody, token: string | null, signal?: AbortSignal): Promise<SmartResult> {
  const key = `smart:${JSON.stringify({ ...body, limit: body.limit ?? SMART_PAGE })}`
  const cached = readCache<SmartPage>(key)
  if (cached && Date.now() - cached.savedAt < FRESH_MS) {
    return { ...cached.data, source: 'smart', note: null, cachedAt: null }
  }
  try {
    const raw = await request<unknown>('/api/search/smart', {
      method: 'POST',
      json: { ...body, limit: body.limit ?? SMART_PAGE },
      token,
      signal,
      timeoutMs: 20_000,
    })
    const page = parse(raw)
    writeCache(key, page)
    return { ...page, source: 'smart', note: null, cachedAt: null }
  } catch (error) {
    // Offline with an older copy of exactly this step: use it, with its age.
    if (cached && isNetworkError(error)) return { ...cached.data, source: 'offline', note: null, cachedAt: cached.savedAt }
    throw error
  }
}

// ---------- fallbacks ----------

const words = (text: string) => text.toLowerCase().split(/\s+/).filter(Boolean)
const emptyState = (q: string): SearchState => ({ q, mode: 'simple', terms: [], attrs: [], refinements: [] })

/** Plain keyword search on the old endpoint: refinements become extra words. */
export async function plainFallback(
  q: string,
  refinements: string[],
  offset: number,
  error: unknown,
  signal?: AbortSignal,
): Promise<SmartResult> {
  if (isAbort(error)) throw error
  const offline = isNetworkError(error) && !navigator.onLine
  if (!offline) {
    try {
      const res = await request<SearchResponse>('/api/search', {
        params: { q: [q, ...refinements].join(' '), limit: SMART_PAGE, offset },
        signal,
      })
      return {
        mode: 'simple',
        ai: false,
        state: emptyState(q),
        suggestions: [],
        listings: res.listings,
        matches: {},
        has_more: res.listings.length >= SMART_PAGE,
        source: 'plain',
        note:
          error instanceof ApiError && error.status === 429
            ? `Search is busy${error.retryAfter ? ` for about ${error.retryAfter} s` : ''}. Showing plain keyword results.`
            : 'Smart search is unavailable right now. Showing plain keyword results.',
        cachedAt: null,
      }
    } catch (plainError) {
      if (isAbort(plainError) || !isNetworkError(plainError)) throw plainError
    }
  }

  // Offline (or server unreachable): every word against listings saved on the device.
  const { rows, savedAt } = cachedListings<Listing>()
  const needles = words([q, ...refinements].join(' '))
  const hits = rows.filter((l) => {
    const hay = [l.title, l.description, l.category, l.quantity, l.price, l.exchange, l.owner?.community, ...(l.tags ?? [])]
      .join(' ')
      .toLowerCase()
    return needles.every((n) => hay.includes(n))
  })
  return {
    mode: 'simple',
    ai: false,
    state: emptyState(q),
    suggestions: [],
    listings: hits.slice(offset, offset + SMART_PAGE),
    matches: {},
    has_more: hits.length > offset + SMART_PAGE,
    source: 'offline',
    note: "You're offline - showing matches from listings saved on this phone.",
    cachedAt: savedAt,
  }
}
