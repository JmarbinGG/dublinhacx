import type { Listing, SearchResponse } from '../types'
import { request } from './client'
import type { SmartRequest } from './smartSearch'

/**
 * DEV ONLY stand-in for the server side of POST /api/search, used while the
 * backend route doesn't exist (404/405). It imitates the server's job -
 * routing, interpreting, refining - with crude rules so the UI can be
 * exercised. It is lazy-loaded, never part of a production first load, and
 * its answers are labelled "demo". The real decisions belong to the server.
 */

// What a "complex" (task-shaped) query might be interpreted as.
const TASKS: [RegExp, string[]][] = [
  [/cut|chop|fell|tree|wood/, ['axe', 'saw', 'chainsaw']],
  [/water|irrigat|field|crop/, ['pump', 'drip', 'pipe']],
  [/fix|repair|broken/, ['repair', 'mechanic']],
  [/sew|stitch|cloth|blouse/, ['tailoring', 'sewing']],
  [/power|electric|solar|light/, ['solar', 'wiring']],
  [/move|carry|transport/, ['truck', 'transport']],
]

const COMPLEX = /\b(how|what|which|need to|i want|things?|something|help me|to cut|to fix|for my)\b/

async function keyword(q: string, type: string | undefined, signal?: AbortSignal): Promise<Listing[]> {
  const res = await request<SearchResponse>('/api/search', { params: { q, type, limit: 50 }, signal })
  return res.listings
}

export async function mockSmartSearch(req: SmartRequest, signal?: AbortSignal) {
  const q = req.q.toLowerCase()
  const complex = q.split(' ').length >= 4 || COMPLEX.test(q)

  let interpreted: string[] = []
  let listings: Listing[]
  if (complex) {
    interpreted = [...new Set(TASKS.filter(([re]) => re.test(q)).flatMap(([, terms]) => terms))]
      .filter((t) => !req.exclude.includes(t))
      .slice(0, 5)
    const seen = new Map<number, Listing>()
    for (const term of interpreted) for (const l of await keyword(term, req.filters.type, signal)) seen.set(l.id, l)
    listings = [...seen.values()]
  } else {
    listings = await keyword(req.q, req.filters.type, signal)
  }

  // Refinements: keep listings where the term appears anywhere (numbers
  // match quantities like "5 HP"). A real server would interpret them.
  for (const term of req.refinements.map((t) => t.toLowerCase())) {
    listings = listings.filter((l) =>
      [l.title, l.description, l.quantity, l.price, l.exchange, l.category, ...l.tags].join(' ').toLowerCase().includes(term),
    )
  }

  const exchanges = [...new Set(listings.map((l) => l.exchange))].filter((e) => !req.refinements.includes(e))
  const suggestions = [
    ...exchanges.map((e) => ({ code: e, label: e[0].toUpperCase() + e.slice(1) })),
    ...(req.refinements.includes('small') ? [] : [{ code: 'small', label: 'Small' }]),
  ].slice(0, 4)

  return {
    route: complex ? 'complex' : 'simple',
    ai: complex,
    interpreted,
    suggestions,
    listings: listings.slice(req.offset, req.offset + 12),
    users: [],
    search_id: `demo-${q.length}`,
    offset: req.offset,
    has_more: listings.length > req.offset + 12,
  }
}
