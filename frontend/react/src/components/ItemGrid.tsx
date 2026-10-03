import { useState } from 'react'
import { takeStagger } from '../lib/motion'
import RuralMarketCard from './RuralMarketCard'
import { Empty, ErrorState, SkeletonGrid } from './States'
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

/** The grid of listing cards, or a static skeleton / error / empty state.
 * Only the very first grid of the visit staggers in (first 12 cards). */
export default function ItemGrid({ listings, loading, error, emptyMessage, onRetry, notes }: Props) {
  const [stagger] = useState(() => (listings ? false : takeStagger()))

  if (error) return <ErrorState message={error} onRetry={onRetry} />
  if (!listings) return loading ? <SkeletonGrid count={3} /> : null
  if (listings.length === 0) return loading ? <SkeletonGrid /> : <Empty message={emptyMessage} />

  return (
    <div className={`grid${stagger ? ' grid--stagger' : ''}${loading ? ' grid--refreshing' : ''}`} aria-busy={loading}>
      {listings.map((listing, i) => (
        <RuralMarketCard
          key={listing.id}
          listing={listing}
          note={notes?.get(listing.id)}
          index={stagger && i < 12 ? i : undefined}
        />
      ))}
    </div>
  )
}
