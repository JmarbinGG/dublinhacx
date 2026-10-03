/** Mirrors backend/schemas.py - the API contract. */

export const LISTING_TYPES = [
  { id: 'material', label: 'Materials', blurb: 'Spare bricks, pipe, seed, fabric, timber' },
  { id: 'equipment', label: 'Equipment & tools', blurb: 'Pump sets, sprayers, tillers, ladders' },
  { id: 'skill', label: 'Skills & jobs', blurb: 'Repairs, tailoring, teaching, farm work' },
] as const

export type ListingType = (typeof LISTING_TYPES)[number]['id']
export type ListingKind = 'offer' | 'request'
export type ExchangeType = 'free' | 'lend' | 'trade' | 'paid'
export type ListingStatus = 'available' | 'pending' | 'closed'

export const EXCHANGES: { id: ExchangeType; label: string }[] = [
  { id: 'free', label: 'Free' },
  { id: 'lend', label: 'Lend' },
  { id: 'trade', label: 'Trade' },
  { id: 'paid', label: 'Paid' },
]

export const STATUSES: { id: ListingStatus; label: string }[] = [
  { id: 'available', label: 'Available' },
  { id: 'pending', label: 'Pending' },
  { id: 'closed', label: 'Closed' },
]

export function typeLabel(type: string): string {
  return LISTING_TYPES.find((t) => t.id === type)?.label ?? type
}

export function exchangeLabel(exchange: string): string {
  return EXCHANGES.find((e) => e.id === exchange)?.label ?? exchange
}

/** "Offering" / "Wanted" - a job posting is a skill request. */
export function kindLabel(listing: Pick<Listing, 'type' | 'kind'>): string {
  if (listing.kind === 'request') return listing.type === 'skill' ? 'Help wanted' : 'Wanted'
  return 'Offering'
}

export type UserSummary = {
  id: number
  name: string
  photo?: string | null
  community?: string | null
}

export type UserPublic = UserSummary & {
  bio?: string | null
  latitude?: number | null
  longitude?: number | null
  /** Whatever the user chose to make public - an email, phone, or a note. */
  contact?: string | null
  created_at: string
}

/** Only ever returned to the user themselves. */
export type UserPrivate = UserPublic & { email: string }

export type Profile = UserPublic & { listings: Listing[] }

export type Listing = {
  id: number
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
  status: ListingStatus
  created_at: string
  updated_at: string
  owner: UserSummary
  /** Only set when the request passed lat/lng. */
  distance_km?: number | null
}

export type CommunityStat = {
  name: string
  members: number
  listings: number
}

export type SearchResponse = {
  query: string
  engine: 'ai' | 'keyword'
  listings: Listing[]
  users: UserPublic[]
}
