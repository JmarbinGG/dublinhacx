/** Mirrors backend/main.py's ItemOut / ItemDetail / CommunityOut schemas. */

export const CATEGORIES = [
  { id: 'produce', label: 'Produce', blurb: 'Eggs, honey, bulk grain, seasonal crops' },
  { id: 'seeds', label: 'Seeds', blurb: 'Heirloom and open-pollinated seed stock' },
  { id: 'heavy_tools', label: 'Heavy Tools', blurb: 'Tractors, balers, splitters, excavators' },
  { id: 'skills_services', label: 'Skills & Services', blurb: 'Farriers, welders, sawyers, builders' },
  { id: 'general', label: 'General', blurb: 'Firewood, reclaimed materials, everything else' },
] as const

export type Category = (typeof CATEGORIES)[number]['id']

/** The categories worth a drive - things a next-door neighbor rarely has. */
export const SPECIALIZED_CATEGORIES: readonly Category[] = ['seeds', 'heavy_tools', 'skills_services']

export function categoryLabel(id: string): string {
  return CATEGORIES.find((category) => category.id === id)?.label ?? id
}

export type Community = {
  id: string
  name: string
  lat: number
  lng: number
  approximate_population?: number | null
}

export type Item = {
  id: string
  community_id: string
  category: Category
  title: string
  description?: string | null
  price_or_exchange?: string | null
  image_url?: string | null
  image_size_kb?: number | null
  created_at: string
  quantity?: string | null
  tags?: string | null
  status?: string | null
  owner?: string | null
  owner_id?: number | null
  /** Only present on the detail endpoint, and only for signed-in viewers. */
  contact_email?: string | null
}
