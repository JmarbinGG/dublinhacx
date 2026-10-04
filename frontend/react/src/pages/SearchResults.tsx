import { useEffect, useRef, useState } from 'react'
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
import { filterExchange, readFilters, toListingQuery } from '../lib/filters'
import { timeAgo } from '../lib/geo'
import { redactPersonal } from '../lib/text'
import { t } from '../i18n'

const MAX_PAGES = 8

/**
 * /search. With a query, the one search bar goes to POST /api/search/smart,
 * where the server decides simple vs complex (AI). Without one it's the
 * browse feed from /api/listings.
 *
 * URL: q plus paging. No refinements or filters — everything goes through
 * the AI text box.
 */
export default function SearchResults() {
  const [params, setParams] = useSearchParams()
  const filters = readFilters(params)
  const { token } = useAuth()
  const { home, homePoint } = useCommunities()
  const { aiAnswers } = useDataBudget()
  // AI switched off in Data saver => plain keyword search only (no refinements: everything goes through the AI text box).
  const usingSmart = !!filters.q && aiAnswers
  const smart = useSmartSearch(
    usingSmart
      ? {
          q: redactPersonal(filters.q).text,
          community: home,
        }
      : null,
    token,
  )

  // Category tiles show only when the search box is empty (same cached summary as home).
  const near = homePoint ? { lat: Math.round(homePoint.lat * 100) / 100, lng: Math.round(homePoint.lng * 100) / 100 } : null
  const summary = useSummary(near, !filters.q)

  // Browse feed (no query).
  const page = Math.min(MAX_PAGES, Math.max(1, Number(params.get('page')) || 1))
  const browseQuery = toListingQuery(readFilters(new URLSearchParams()), home, homePoint, PAGE_SIZE * page)
  const browse = useListings(usingSmart ? null : browseQuery)

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
  const listings = usingSmart ? smart.listings : (browse.data ? filterExchange(browse.data, '') : null)

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
                </button>
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
            filters.q
              ? t('searchResults.nothingMatchedQuery', { query: filters.q })
              : t('searchResults.nothingMatchesFilters')
          }
          onRetry={usingSmart ? smart.retry : browse.reload}
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
              onClick={() => {
                const next = new URLSearchParams(params)
                next.set('page', String(page + 1))
                setParams(next, { replace: true })
              }}
            >
              {browse.loading ? t('searchResults.loading') : t('searchResults.showMore')}
            </button>
          )}
    </section>
  )
}
