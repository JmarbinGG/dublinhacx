import type { IconName } from '../components/Icon'
import type { Listing, ListingKind, ListingType } from '../types'

/**
 * The four top-level categories. Offers split by type; every request is
 * "Help wanted" - so each listing is in exactly one group.
 */
export const GROUPS = [
  { id: 'materials', label: 'Materials', icon: 'brick', type: 'material', kind: 'offer' },
  { id: 'equipment', label: 'Equipment & tools', icon: 'tool', type: 'equipment', kind: 'offer' },
  { id: 'skills', label: 'Skills & jobs', icon: 'skill', type: 'skill', kind: 'offer' },
  { id: 'help', label: 'Help wanted', icon: 'help', type: undefined, kind: 'request' },
] as const satisfies readonly { id: string; label: string; icon: IconName; type?: ListingType; kind: ListingKind }[]

export type Group = (typeof GROUPS)[number]
export type GroupId = Group['id']

export function groupOf(listing: Pick<Listing, 'type' | 'kind'>): Group {
  if (listing.kind === 'request') return GROUPS[3]
  return GROUPS.find((g) => g.type === listing.type) ?? GROUPS[0]
}

export function groupById(id: string | undefined): Group | undefined {
  return GROUPS.find((g) => g.id === id)
}

/**
 * Topics for the chips on a category page. The backend's `category` is
 * free text today, so it's mapped here by keyword; once the backend has a
 * fixed category list (asked for in FRONTEND_AI_CONTRACT.md) this becomes
 * a straight lookup.
 */
export const TOPICS = ['Farming', 'Building', 'Energy and repair', 'Digital and learning', 'Crafts', 'Household', 'Other'] as const
export type Topic = (typeof TOPICS)[number]

const TOPIC_WORDS: [Topic, RegExp][] = [
  ['Farming', /farm|organic|dairy|irrigat|seed|crop|cattle|poultry|harvest|coconut|sugarcane/],
  ['Building', /build|carpent|metal|brick|cement|construct|timber|plumb|transport/],
  ['Energy and repair', /electr|solar|mechanic|repair|engine|pump|wiring/],
  ['Digital and learning', /digital|teach|book|tuition|computer|phone|learn|school/],
  ['Crafts', /craft|sew|textile|pottery|tailor|weav|stitch/],
  ['Household', /house|kitchen|cook|clean|furniture/],
]

export function topicOf(listing: Pick<Listing, 'category' | 'tags'>): Topic {
  const text = [listing.category, ...(listing.tags ?? [])].join(' ').toLowerCase()
  return TOPIC_WORDS.find(([, re]) => re.test(text))?.[0] ?? 'Other'
}

/** Topic chips for a set of listings: at most six, most common first. */
export function topicCounts(listings: Listing[]): [Topic, number][] {
  const counts = new Map<Topic, number>()
  for (const l of listings) counts.set(topicOf(l), (counts.get(topicOf(l)) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
}
