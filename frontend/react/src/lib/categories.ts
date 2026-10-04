import type { IconName } from '../components/Icon'
import type { Listing, ListingKind, ListingType } from '../types'
import { t } from '../i18n'

/**
 * The four top-level categories. Offers split by type; every request is
 * "Help wanted" - so each listing is in exactly one group.
 */
export const GROUPS = [
  { id: 'materials', get label() { return t('group.materials') }, icon: 'brick', type: 'material', kind: 'offer' },
  { id: 'equipment', get label() { return t('group.equipment') }, icon: 'tool', type: 'equipment', kind: 'offer' },
  { id: 'skills', get label() { return t('group.skills') }, icon: 'skill', type: 'skill', kind: 'offer' },
  { id: 'help', get label() { return t('group.help') }, icon: 'help', type: undefined, kind: 'request' },
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
 * The backend's fixed category list (GET /api/categories), in display
 * order. listing.category is always one of these ids, so this is a plain
 * lookup - no request needed for the labels.
 */
export const TOPICS = [
  { id: 'farming', get label() { return t('topic.farming') } },
  { id: 'building', get label() { return t('topic.building') } },
  { id: 'energy-repair', get label() { return t('topic.energy-repair') } },
  { id: 'digital-learning', get label() { return t('topic.digital-learning') } },
  { id: 'crafts', get label() { return t('topic.crafts') } },
  { id: 'household', get label() { return t('topic.household') } },
  { id: 'other', get label() { return t('topic.other') } },
] as const

export type TopicId = (typeof TOPICS)[number]['id']

export function topicOf(listing: Pick<Listing, 'category'>): TopicId {
  return TOPICS.find((t) => t.id === listing.category)?.id ?? 'other'
}

export function topicLabel(id: string | null | undefined): string {
  return TOPICS.find((topic) => topic.id === id)?.label ?? t('topic.other')
}

export function isTopic(id: string | null): id is TopicId {
  return TOPICS.some((t) => t.id === id)
}

/** Topic chips for a set of listings: at most six, most common first. */
export function topicCounts(listings: Listing[]): [TopicId, number][] {
  const counts = new Map<TopicId, number>()
  for (const l of listings) counts.set(topicOf(l), (counts.get(topicOf(l)) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
}
