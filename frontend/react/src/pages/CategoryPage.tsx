import { useLayoutEffect, useRef } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import Icon from '../components/Icon'
import ItemGrid from '../components/ItemGrid'
import { useCommunities } from '../context/CommunityContext'
import { useListings } from '../hooks/useItems'
import { groupById, isTopic, topicCounts, topicLabel, topicOf } from '../lib/categories'
import { filterExchange, readFilters, toListingQuery } from '../lib/filters'
import { flipFrom } from '../lib/motion'
import { takeTileRect } from '../lib/viewTransition'
import NotFound from './NotFound'

const PAGE = 12

/**
 * /app/c/:group - one category's listings. Distance and Exchange are the
 * only inline filters; topic chips come from the data (at most six, by
 * count). All state is in the URL: topic, ex, scope, sort, page.
 */
export default function CategoryPage() {
  const { group: groupId } = useParams()
  const group = groupById(groupId)
  const [params, setParams] = useSearchParams()
  const filters = readFilters(new URLSearchParams()) // no filter controls here any more
  const { home, homePoint } = useCommunities()
  const topicParam = params.get('topic')
  const topic = isTopic(topicParam) ? topicParam : null
  const page = Math.max(1, Number(params.get('page')) || 1)

  // The whole category in one cached request; topic, exchange and paging
  // are applied here, so changing them costs no data.
  const res = useListings(
    group
      ? toListingQuery({ ...filters, q: '', type: group.type ?? '', kind: group.kind, exchange: '' }, home, homePoint, 200)
      : null,
  )

  // Fallback for browsers without View Transitions: grow the header
  // backdrop out of the tile that was tapped (a container, so scaling is fine).
  const backdropRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const rect = takeTileRect()
    if (rect && backdropRef.current) flipFrom(backdropRef.current, rect, 260)
  }, [])

  if (!group) return <NotFound />

  const byExchange = res.data ? filterExchange(res.data, filters.exchange) : null
  const topics = byExchange ? topicCounts(byExchange) : []
  const filtered = byExchange && topic ? byExchange.filter((l) => topicOf(l) === topic) : byExchange
  const shown = filtered?.slice(0, PAGE * page) ?? null

  function set(key: string, value: string | null) {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    if (key !== 'page') next.delete('page')
    setParams(next, { replace: true })
  }

  return (
    <section className="stack">
      <header className="cat-head">
        <div className="cat-head__backdrop" ref={backdropRef} aria-hidden="true" />
        <Link to="/app" className="back">
          <Icon name="back" /> All categories
        </Link>
        <h1>
          <Icon name={group.icon} /> {group.label}
          {filtered && <span className="count">{filtered.length}</span>}
        </h1>
      </header>

      {topics.length > 1 && (
        <div className="chip-row" role="group" aria-label="Topics">
          {topics.map(([id, count]) => (
            <button
              key={id}
              type="button"
              className="chip"
              aria-pressed={topic === id}
              onClick={() => set('topic', topic === id ? null : id)}
            >
              {topicLabel(id)} <span className="chip__count">{count}</span>
            </button>
          ))}
        </div>
      )}

      {res.cachedAt && <p className="notice notice--warn">Saved copy - you're offline.</p>}

      <h2 className="visually-hidden">Listings</h2>
      <ItemGrid
        listings={shown}
        loading={res.loading}
        error={res.error}
        emptyMessage={`No ${group.label.toLowerCase()} match these filters yet.`}
        onRetry={res.reload}
        hideCategory
      />

      {filtered && shown && filtered.length > shown.length && (
        <button type="button" className="secondary-button load-more" onClick={() => set('page', String(page + 1))}>
          Show more ({filtered.length - shown.length})
        </button>
      )}
    </section>
  )
}
