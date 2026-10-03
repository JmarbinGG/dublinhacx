import RuralMarketCard from './RuralMarketCard'
import { Empty, ErrorState, Loading } from './States'
import type { Listing } from '../types'

type Props = {
  listings: Listing[] | null
  loading: boolean
  error: string | null
  emptyMessage: string
  onRetry?: () => void
  /** Optional per-listing note (AI "why"), keyed by id. */
  notes?: Map<number, string>
}

/** The grid of listing cards, or the matching loading / error / empty state. */
export default function ItemGrid({ listings, loading, error, emptyMessage, onRetry, notes }: Props) {
  if (error) return <ErrorState message={error} onRetry={onRetry} />
  if (!listings) return loading ? <Loading label="Loading listings..." /> : null
  if (listings.length === 0) return loading ? <Loading label="Loading listings..." /> : <Empty message={emptyMessage} />

  return (
    <div className={`grid${loading ? ' grid--refreshing' : ''}`} aria-busy={loading}>
      {listings.map((listing) => (
        <RuralMarketCard key={listing.id} listing={listing} note={notes?.get(listing.id)} />
      ))}
    </div>
  )
}
