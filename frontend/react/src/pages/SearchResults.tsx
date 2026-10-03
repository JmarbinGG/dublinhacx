import { useEffect, useRef } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import AiOverview from '../components/AiOverview'
import Avatar from '../components/Avatar'
import FilterBar from '../components/FilterBar'
import ItemGrid from '../components/ItemGrid'
import SearchBar from '../components/SearchBar'
import { PAGE_SIZE } from '../api/listings'
import { useCommunities } from '../context/CommunityContext'
import { useDataBudget } from '../context/DataBudgetContext'
import { useListings, useSearch } from '../hooks/useItems'
import { filterExchange, readFilters, toListingQuery } from '../lib/filters'

const MAX_PAGES = 8 // the API caps a page at 200

/**
 * /search - the browsable feed. With a query (and "plain search" off), it
 * uses /api/search, which may be AI-ranked and also finds people; otherwise
 * /api/listings with every filter. "Ask AI" adds an overview card on top -
 * it never replaces or reorders these results.
 */
export default function SearchResults() {
  const [params, setParams] = useSearchParams()
  const filters = readFilters(params)
  const { home, homePoint } = useCommunities()
  const { aiAnswers } = useDataBudget()
  const page = Math.min(MAX_PAGES, Math.max(1, Number(params.get('page')) || 1))
  const plain = params.get('plain') === '1'
  const askAi = params.get('ai') === '1' && !!filters.q && aiAnswers

  // Smart search only fits the plain filters it supports; anything else uses /api/listings.
  const useSmart = !!filters.q && !plain && !filters.kind && filters.scope === 'all' && filters.sort === 'newest'
  const searchRes = useSearch(
    useSmart ? { q: filters.q, type: filters.type || undefined, limit: PAGE_SIZE * page } : null,
  )
  const listRes = useListings(useSmart ? null : toListingQuery(filters, home, homePoint, PAGE_SIZE * page))
  const active = useSmart ? searchRes : listRes

  const rawListings = useSmart ? (searchRes.data?.listings ?? null) : listRes.data
  const listings = rawListings ? filterExchange(rawListings, filters.exchange) : null
  const people = useSmart ? (searchRes.data?.users ?? []) : []
  const engine = useSmart ? searchRes.data?.engine : 'keyword'
  const canLoadMore = !!rawListings && rawListings.length >= PAGE_SIZE * page && page < MAX_PAGES

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: key === 'page' })
  }

  // Move focus to the results heading after a new search, for screen readers.
  const headingRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (filters.q) headingRef.current?.focus()
  }, [filters.q])

  return (
    <section className="feed">
      <SearchBar key={filters.q} initialQuery={filters.q} />
      <FilterBar />

      {askAi && (
        <AiOverview
          q={filters.q}
          filters={{
            type: filters.type || undefined,
            kind: filters.kind || undefined,
            exchange: filters.exchange || undefined,
            scope: filters.scope,
          }}
          known={listings ?? []}
          onClose={() => setParam('ai', null)}
        />
      )}

      <div className="results-bar">
        <h2 className="results-heading" ref={headingRef} tabIndex={-1} aria-live="polite">
          {filters.q ? <>Results for "{filters.q}"</> : 'Everything shared'}
          {listings && <span className="count">{listings.length}</span>}
          {filters.q && engine && (
            <span className={`engine-badge engine-badge--${engine}`} title="How these results were found">
              {engine === 'ai' ? 'AI ranked' : 'Keyword'}
            </span>
          )}
        </h2>
        {filters.q && (
          <label className="plain-toggle">
            <input type="checkbox" checked={plain} onChange={(e) => setParam('plain', e.target.checked ? '1' : null)} />
            Use plain search
          </label>
        )}
      </div>

      {active.cachedAt && (
        <p className="cached-note">
          Saved copy from {new Date(active.cachedAt).toLocaleString()} - you're offline or the server can't be
          reached.
        </p>
      )}

      {people.length > 0 && (
        <div className="people-strip" aria-label="People">
          {people.slice(0, 6).map((person) => (
            <Link key={person.id} to={`/users/${person.id}`} className="person-chip">
              <Avatar name={person.name} size="sm" />
              <span>
                <strong>{person.name}</strong>
                {person.community && <span> · {person.community}</span>}
              </span>
            </Link>
          ))}
        </div>
      )}

      <ItemGrid
        listings={listings}
        loading={active.loading}
        error={active.error}
        emptyMessage={
          filters.q
            ? `Nothing matched "${filters.q}" with these filters. Try fewer words, or post a "Wanted" listing.`
            : 'Nothing matches these filters yet.'
        }
        onRetry={active.reload}
      />

      {canLoadMore && (
        <button
          type="button"
          className="secondary-button load-more"
          disabled={active.loading}
          onClick={() => setParam('page', String(page + 1))}
        >
          {active.loading ? 'Loading...' : 'Show more'}
        </button>
      )}
    </section>
  )
}
