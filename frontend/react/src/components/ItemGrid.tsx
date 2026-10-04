import { useLayoutEffect, useRef, useState } from 'react'
import { createFlipState, flipGrid } from '../lib/flip'
import { takeStagger } from '../lib/motion'
import { resolveImageUrl } from '../api/client'
import { formatKb, useDataBudget } from '../context/DataBudgetContext'
import { t } from '../i18n'
import { LOAD_IMAGES_EVENT, UNKNOWN_IMAGE_KB } from './DataBudgetImage'
import RuralMarketCard from './RuralMarketCard'
import { Empty, ErrorState, SkeletonGrid } from './States'
import type { Listing } from '../types'

type Props = {
  listings: Listing[] | null
  loading: boolean
  error: string | null
  emptyMessage: string
  onRetry?: () => void
  /** Optional per-listing note (e.g. which search term matched), keyed by id. */
  notes?: Map<number, string>
  hideCategory?: boolean
}

/**
 * The grid of listing cards, or a static skeleton / error / empty state.
 * When filters change or more cards arrive, cards that stay glide to their
 * new places and new ones ripple in from the tap (lib/flip.ts).
 */
export default function ItemGrid({ listings, loading, error, emptyMessage, onRetry, notes, hideCategory }: Props) {
  const [stagger] = useState(() => (listings ? false : takeStagger()))
  const gridRef = useRef<HTMLDivElement>(null)
  const flip = useRef(createFlipState())
  const ids = listings?.map((l) => l.id).join(',') ?? ''
  const { isLoaded } = useDataBudget()
  const [, setLoadedAll] = useState(0)

  // After every change to which cards are shown (or their order), FLIP.
  useLayoutEffect(() => {
    flipGrid(gridRef.current, flip.current)
  }, [ids])

  if (error) return <ErrorState message={error} onRetry={onRetry} />
  if (!listings) return loading ? <SkeletonGrid count={3} /> : null
  if (listings.length === 0) return loading ? <SkeletonGrid count={3} /> : <Empty message={emptyMessage} />

  // Photos still waiting for a tap. One button loads them all - still the
  // user's choice, never automatic.
  const waiting = listings.flatMap((l) => {
    const url = resolveImageUrl(l.image)
    return url && !isLoaded(url) ? [{ url, kb: l.image_size_kb ?? UNKNOWN_IMAGE_KB }] : []
  })
  const loadAll = () => {
    window.dispatchEvent(new CustomEvent(LOAD_IMAGES_EVENT, { detail: waiting.map((w) => w.url) }))
    setLoadedAll((n) => n + 1)
  }

  return (
    <>
    {waiting.length > 1 && (
      <button type="button" className="secondary-button load-all" onClick={loadAll}>
        {t('img.loadAll', { n: waiting.length, size: formatKb(waiting.reduce((sum, w) => sum + w.kb, 0)) })}
      </button>
    )}
    <div
      ref={gridRef}
      className={`grid${stagger ? ' grid--stagger' : ''}${loading ? ' grid--refreshing' : ''}`}
      aria-busy={loading}
    >
      {listings.map((listing, i) => (
        <RuralMarketCard
          key={listing.id}
          listing={listing}
          hideCategory={hideCategory}
          note={notes?.get(listing.id)}
          index={stagger && i < 12 ? i : undefined}
        />
      ))}
    </div>
    </>
  )
}
