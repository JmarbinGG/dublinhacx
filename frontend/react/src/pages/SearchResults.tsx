import { useEffect, useRef, useState } from 'react'
import { groupOf, topicLabel } from '../lib/categories'
import { useSearchParams } from 'react-router-dom'
import { PAGE_SIZE } from '../api/listings'
import { useAuth } from '../auth/AuthContext'
import CategoryTiles from '../components/CategoryTiles'
import ItemGrid from '../components/ItemGrid'
import { SkeletonGrid } from '../components/States'
import { useCommunities } from '../context/CommunityContext'
import { useDataBudget } from '../context/DataBudgetContext'
import { useListings, useSummary } from '../hooks/useItems'
import { useSmartSearch } from '../hooks/useSmartSearch'
import type { SearchState } from '../api/smartSearch'
import type { Listing } from '../types'
import { filterExchange, readFilters, toListingQuery } from '../lib/filters'
import { timeAgo } from '../lib/geo'
import { redactPersonal } from '../lib/text'
import { t } from '../i18n'

const MAX_PAGES = 8

/**
 * /search. With a query, the one search bar goes to POST /api/search/smart,
 * where the server decides simple vs complex (AI). Without one - or with
 * plain search / AI off - it's the filterable browse feed from /api/listings.
 *
 * Everything is natural language: a follow-up ("only free ones") is just
 * typed into the bar. The URL holds only the latest text (q), so back and
 * forward work and replay cached answers.
 */
export default function SearchResults() {
  const [params, setParams] = useSearchParams()
  const filters = readFilters(params)
  const { token } = useAuth()
  const { home, homePoint } = useCommunities()
  const { aiAnswers } = useDataBudget()
  const plain = params.get('plain') === '1'

  // AI switched off in Data saver => plain keyword search only.
  const usingSmart = !!filters.q && !plain && aiAnswers
  const smart = useSmartSearch(
    usingSmart
      ? {
          // Contact details never leave the device, even inside a query.
          q: redactPersonal(filters.q).text,
          community: home,
        }
      : null,
    token,
  )

  // Category tiles show only when the search box is empty (same cached summary as home).
  const near = homePoint ? { lat: Math.round(homePoint.lat * 100) / 100, lng: Math.round(homePoint.lng * 100) / 100 } : null
  const summary = useSummary(near, !filters.q)

  // Browse feed (no query, or plain search chosen).
  const page = Math.min(MAX_PAGES, Math.max(1, Number(params.get('page')) || 1))
  const browseQuery = toListingQuery(filters, home, homePoint, PAGE_SIZE * page)
  const browse = useListings(usingSmart ? null : browseQuery)
  const browseListings = browse.data ? filterExchange(browse.data, filters.exchange) : null

  function update(mutate: (next: URLSearchParams) => void, replace = false) {
    const next = new URLSearchParams(params)
    mutate(next)
    next.delete('page')
    setParams(next, { replace })
  }

  // Complex (AI) searches take a few seconds; after a moment, say so.
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    if (!smart.loading) return setSlow(false)
    const id = setTimeout(() => setSlow(true), 1200)
    return () => clearTimeout(id)
  }, [smart.loading])

  // Focus the results heading after a new search, for screen readers.
  const headingRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (filters.q) headingRef.current?.focus()
  }, [filters.q])

  const meta = smart.result
  const understood = meta && meta.source === 'smart' ? describeUnderstanding(meta.state, meta.mode, filters.q, meta.summary) : null
  const notes = meta ? new Map(Object.entries(meta.matches).map(([id, term]) => [Number(id), `Matches: ${term}`])) : undefined
  const listings = usingSmart ? smart.listings : browseListings

  return (
    <section className="stack">
      {!filters.q && <CategoryTiles summary={summary.data} />}

      <div className="section-head">
        <h1 className="results-title" ref={headingRef} tabIndex={-1} aria-live="polite">
          {filters.q ? <>{t('searchResults.resultsFor', { query: filters.q })}</> : t('searchResults.everythingShared')}
          {listings && <span className="count">{listings.length}{(usingSmart ? meta?.has_more : false) && '+'}</span>}
        </h1>
        {usingSmart && meta?.ai && <span className="hint">{t('searchResults.aiAssisted')}</span>}
      </div>

      {usingSmart && (
        <>
          {/* How the search was understood: plain, read-only text. To change
              it, the user types a follow-up into the bar. */}
          {understood && (
            <p className="understood" aria-label={t('searchResults.whatWeSearchedFor')}>
              {understood}
            </p>
          )}

          {/* One fixed-height slot for every status line, so swapping
              "Searching..." for a note never pushes the results down. */}
          <div className="status-slot" aria-live="polite">
            {smart.loading ? (
              <div className="searching" role="status">
                {slow ? t('searchResults.thinking') : t('searchResults.searching')}
                <button type="button" className="secondary-button" onClick={smart.cancel}>
                  {t('searchResults.cancel')}
                </button>
              </div>
            ) : smart.cancelled ? (
              <p className="notice">
                {t('searchResults.searchCancelled')}{' '}
                <button type="button" className="link-button" onClick={smart.retry}>
                  {t('searchResults.tryAgain')}
                </button>{' '}
                {t('searchResults.or')}{' '}
                <button type="button" className="link-button" onClick={() => update((next) => next.set('plain', '1'))}>
                  {t('searchResults.usePlainKeywordSearch')}
                </button>
                .
              </p>
            ) : meta?.note ? (
              <p className="notice notice--warn">{meta.note}</p>
            ) : meta?.cachedAt ? (
              <p className="hint">{t('searchResults.savedOffline', { ago: timeAgo(new Date(meta.cachedAt).toISOString()) })}</p>
            ) : null}
          </div>
        </>
      )}

      {!usingSmart && browse.cachedAt && (
        <p className="notice notice--warn">
          {t('searchResults.savedCopyOffline', { ago: timeAgo(new Date(browse.cachedAt).toISOString()) })}
        </p>
      )}

      <h2 className="visually-hidden">{t('searchResults.listings')}</h2>
      {usingSmart && smart.loading && !smart.listings ? (
        <SkeletonGrid count={2} />
      ) : (
        <ItemGrid
          listings={listings}
          loading={usingSmart ? smart.loading : browse.loading}
          error={usingSmart ? smart.error : browse.error}
          emptyMessage={
            filters.q ? t('searchResults.nothingMatchedQuery', { query: filters.q }) : t('searchResults.nothingMatchesFilters')
          }
          onRetry={usingSmart ? smart.retry : browse.reload}
          notes={usingSmart ? notes : undefined}
        />
      )}

      {usingSmart
        ? meta?.has_more && (
            <button type="button" className="secondary-button load-more" disabled={smart.loadingMore} onClick={smart.loadMore}>
              {smart.loadingMore ? t('searchResults.loading') : t('searchResults.showMore')}
            </button>
          )
        : browse.data &&
          browse.data.length >= PAGE_SIZE * page &&
          page < MAX_PAGES && (
            <button
              type="button"
              className="secondary-button load-more"
              disabled={browse.loading}
              onClick={() => update((next) => next.set('page', String(page + 1)), true)}
            >
              {browse.loading ? t('searchResults.loading') : t('searchResults.showMore')}
            </button>
          )}
    </section>
  )
}

/**
 * "To cut down a tree, searched for: axe, saw · in Equipment & tools".
 * Built only from the server's state - the client interprets nothing. The
 * server's own summary (e.g. "No skills found, showing everything") wins
 * when it sends one.
 */
function describeUnderstanding(
  state: SearchState,
  mode: 'simple' | 'complex',
  q: string,
  summary: string | null,
): string | null {
  const parts: string[] = []
  const terms = state.terms.join(', ')
  if (state.terms.length && (mode === 'complex' || state.terms.join(' ').toLowerCase() !== q.toLowerCase())) {
    parts.push(state.need ? `${t('searchResults.toNeedSearchedFor', { need: state.need })} ${terms}` : `${t('searchResults.searchedFor')} ${terms}`)
  }
  if (state.kind === 'request' || state.type) {
    const group = groupOf({ type: (state.type ?? 'material') as Listing['type'], kind: (state.kind ?? 'offer') as Listing['kind'] })
    parts.push(t('searchResults.inGroup', { group: group.label }))
  }
  if (state.category) parts.push(topicLabel(state.category))
  if (summary) parts.push(summary)
  return parts.length ? parts.join(' · ') : null
}
