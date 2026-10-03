import ListingCard from './ListingCard'
import { Empty, ErrorState, Loading } from './States'
import type { Listing } from '../types'

type Props = {
  listings: Listing[] | null
  loading: boolean
  error: string | null
  emptyMessage: string
  onRetry?: () => void
}

/**
 * Renders the grid of results, or the appropriate loading / error / empty
 * state. Both the home page and the search page use this.
 */
export default function ListingGrid({
  listings,
  loading,
  error,
  emptyMessage,
  onRetry,
}: Props) {
  if (loading) return <Loading label="Loading listings..." />
  if (error) return <ErrorState message={error} onRetry={onRetry} />
  if (!listings || listings.length === 0) return <Empty message={emptyMessage} />

  return (
    <div className="grid">
      {listings.map((listing) => (
        <ListingCard key={String(listing.id)} listing={listing} />
      ))}
    </div>
  )
}
