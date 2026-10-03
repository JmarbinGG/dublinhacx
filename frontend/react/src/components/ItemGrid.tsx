import RuralMarketCard from './RuralMarketCard'
import { Empty, ErrorState, Loading } from './States'
import type { Item } from '../types'

type Props = {
  items: Item[] | null
  loading: boolean
  error: string | null
  emptyMessage: string
  onRetry?: () => void
}

/** The grid of listing cards, or the matching loading / error / empty state. */
export default function ItemGrid({ items, loading, error, emptyMessage, onRetry }: Props) {
  if (loading) return <Loading label="Loading listings..." />
  if (error) return <ErrorState message={error} onRetry={onRetry} />
  if (!items || items.length === 0) return <Empty message={emptyMessage} />

  return (
    <div className="grid">
      {items.map((item) => (
        <RuralMarketCard key={item.id} item={item} />
      ))}
    </div>
  )
}
