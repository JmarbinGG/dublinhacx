import { NEARBY_MILES } from '../context/CommunityContext'
import { SPECIALIZED_CATEGORIES, type Category, type Item } from '../types'

export const DISTANCE_BANDS = [
  { id: 'all', label: 'Any distance' },
  { id: 'near', label: `Nearby (≤${NEARBY_MILES} mi)` },
  { id: 'beyond5', label: 'Beyond 5 miles' },
  { id: 'beyond10', label: 'Beyond 10 miles' },
] as const

export const SORTS = [
  { id: 'nearest', label: 'Nearest first' },
  { id: 'farthest', label: 'Farthest first' },
  { id: 'newest', label: 'Newest first' },
] as const

export type DistanceBand = (typeof DISTANCE_BANDS)[number]['id']
export type Sort = (typeof SORTS)[number]['id']

export type Filters = {
  band: DistanceBand
  category: Category | ''
  specialized: boolean
  sort: Sort
}

/** Filters live in the URL (?band=&cat=&special=1&sort=) so a filtered view
 * can be bookmarked or shared as a link. */
export function readFilters(params: URLSearchParams): Filters {
  const band = params.get('band')
  const sort = params.get('sort')
  return {
    band: DISTANCE_BANDS.some((b) => b.id === band) ? (band as DistanceBand) : 'all',
    category: (params.get('cat') ?? '') as Category | '',
    specialized: params.get('special') === '1',
    sort: SORTS.some((s) => s.id === sort) ? (sort as Sort) : 'nearest',
  }
}

export function applyFilters(
  items: Item[],
  filters: Filters,
  distanceTo: (communityId: string) => number | null,
): Item[] {
  const withDistance = items.map((item) => ({ item, miles: distanceTo(item.community_id) }))

  const kept = withDistance.filter(({ item, miles }) => {
    if (filters.category && item.category !== filters.category) return false
    if (filters.specialized && !SPECIALIZED_CATEGORIES.includes(item.category)) return false
    // Without a home community there's nothing to measure from, so distance
    // bands don't filter anything out.
    if (miles === null || filters.band === 'all') return true
    if (filters.band === 'near') return miles <= NEARBY_MILES
    if (filters.band === 'beyond5') return miles > 5
    return miles > 10
  })

  const newest = (a: Item, b: Item) => b.created_at.localeCompare(a.created_at)
  kept.sort((a, b) => {
    if (filters.sort === 'newest' || a.miles === null || b.miles === null) return newest(a.item, b.item)
    const diff = filters.sort === 'nearest' ? a.miles - b.miles : b.miles - a.miles
    return diff || newest(a.item, b.item)
  })

  return kept.map(({ item }) => item)
}
