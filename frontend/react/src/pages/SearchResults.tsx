import { useEffect, useRef, useState } from 'react'
import { topicLabel } from '../lib/categories'
import { useSearchParams } from 'react-router-dom'
import { PAGE_SIZE } from '../api/listings'
import { useAuth } from '../auth/AuthContext'
import CategoryTiles from '../components/CategoryTiles'
import Icon from '../components/Icon'
import ItemGrid from '../components/ItemGrid'
import { SkeletonGrid } from '../components/States'
import { NEARBY_KM, useCommunities } from '../context/CommunityContext'
import { useDataBudget } from '../context/DataBudgetContext'
import { useListings, useSummary } from '../hooks/useItems'
import { useSmartSearch } from '../hooks/useSmartSearch'
import { filterExchange, readFilters, toListingQuery } from '../lib/filters'
import { timeAgo } from '../lib/geo'
import { REFINE_LIMIT, cleanText, redactPersonal } from '../lib/text'
import { t } from '../i18n'

const MAX_PAGES = 8
const MAX_REFINEMENTS = 5

/**
 * /search. With a query, the one search bar goes to POST /api/search/smart,
 * where the server decides simple vs complex (AI). Without one - or with
 * plain search / AI off - it's the filterable browse feed from /api/listings.
 *
 * URL: q, r (refinements, repeated), x (interpreted terms removed, repeated),
 * plus the filter params. So the back button and repeat searches reuse the
 * cached answer.
 */
export default function SearchResults() {
  const [params, setParams] = useSearchParams()
  const filters = readFilters(params)
  const { token } = useAuth()
  const { home, homePoint } = useCommunities()
  const { aiAnswers } = useDataBudget()
  const plain = params.get('plain') === '1'
  const refinements = params.getAll('r')
  const excluded = params.getAll('x')

  // AI switched off in Data saver => plain keyword search only.
  const usingSmart = !!filters.q && !plain && aiAnswers
  const smart = useSmartSearch(
    usingSmart
      ? {
          // Contact details never leave the device, even inside a query.
          q: redactPersonal(filters.q).text,
          refinements: refinements.map((r) => redactPersonal(r).text),
          exclude: excluded,
          community: home,
          filters: {
            type: filters.type || undefined,
            kind: filters.kind || undefined,
            exchange: filters.exchange || undefined,
            maxKm: filters.scope === 'near' ? NEARBY_KM : undefined,
          },
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

  const addRefinement = (term: string) => {
    const clean = cleanText(term, REFINE_LIMIT)
    if (!clean || refinements.includes(clean) || refinements.length >= MAX_REFINEMENTS) return
    update((next) => next.append('r', clean))
  }
  const removeRefinement = (term: string) =>
    update((next) => {
      next.delete('r')
      refinements.filter((r) => r !== term).forEach((r) => next.append('r', r))
    })
  const removeInterpreted = (term: string) => update((next) => next.append('x', term))

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
          {meta?.mode === 'complex' && meta.state.terms.length > 0 && (
            <div className="interpreted" aria-label={t('searchResults.whatWeSearchedFor')}>
              <span className="hint">{meta.state.need ? t('searchResults.toNeedSearchedFor', { need: meta.state.need }) : t('searchResults.searchedFor')}</span>
              {meta.state.terms.map((term) => (
                <span key={term} className="chip chip--removable">
                  {term}
                  <button type="button" aria-label={t('searchResults.dontSearchFor', { term })} onClick={() => removeInterpreted(term)}>
                    <Icon name="x" />
                  </button>
                </span>
              ))}
              {excluded.length > 0 && (
                <button type="button" className="link-button" onClick={() => update((next) => next.delete('x'))}>
                  {t('searchResults.undo')}
                </button>
              )}
            </div>
          )}

          {meta?.state.category && (
            <div className="interpreted" aria-label={t('searchResults.category')}>
              <span className="hint">{t('searchResults.category')}:</span>
              <span className="chip chip--removable">
                {topicLabel(meta.state.category)}
                <button type="button" aria-label={t('searchResults.anyCategory')} onClick={() => addRefinement('any category')}>
                  <Icon name="x" />
                </button>
              </span>
            </div>
          )}

          <RefineBar
            query={filters.q}
            refinements={refinements}
            suggestions={(meta?.suggestions ?? []).filter((s) => !refinements.includes(s.refine))}
            onAdd={addRefinement}
            onRemove={removeRefinement}
            onClear={() => update((next) => next.delete('r'))}
            full={refinements.length >= MAX_REFINEMENTS}
          />

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
            filters.q
              ? refinements.length
                ? t('searchResults.nothingMatchesRefinements')
                : t('searchResults.nothingMatchedQuery', { query: filters.q })
              : t('searchResults.nothingMatchesFilters')
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

type RefineProps = {
  query: string
  refinements: string[]
  suggestions: { label: string; refine: string }[]
  onAdd: (term: string) => void
  onRemove: (term: string) => void
  onClear: () => void
  full: boolean
}

/**
 * "screws › 5 › small": tap a suggestion or add a word at a time. Terms go
 * to the server raw - the client never guesses whether "5" is a quantity
 * or a size.
 */
function RefineBar({ query, refinements, suggestions, onAdd, onRemove, onClear, full }: RefineProps) {
  const [draft, setDraft] = useState('')

  return (
    <div className="refine">
      {refinements.length > 0 && (
        <ol className="refine__trail" aria-label={t('searchResults.searchAndRefinements')}>
          <li>{query}</li>
          {refinements.map((term) => (
            <li key={term}>
              <span className="chip chip--removable">
                {term}
                <button type="button" aria-label={t('searchResults.removeTerm', { term })} onClick={() => onRemove(term)}>
                  <Icon name="x" />
                </button>
              </span>
            </li>
          ))}
          <li>
            <button type="button" className="link-button" onClick={onClear}>
              {t('searchResults.clearRefinements')}
            </button>
          </li>
        </ol>
      )}

      <div className="refine__row">
        {suggestions.map((s) => (
          <button key={s.refine} type="button" className="chip" disabled={full} onClick={() => onAdd(s.refine)}>
            + {s.label}
          </button>
        ))}
        <form
          className="refine__form"
          onSubmit={(e) => {
            e.preventDefault()
            onAdd(draft)
            setDraft('')
          }}
        >
          <label className="visually-hidden" htmlFor="refine-input">
            {t('searchResults.narrowDown')}
          </label>
          <input
            id="refine-input"
            value={draft}
            maxLength={REFINE_LIMIT}
            disabled={full}
            placeholder={full ? t('searchResults.enoughRefinements') : t('searchResults.narrowDownPlaceholder')}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button type="submit" className="secondary-button" disabled={full || !draft.trim()}>
            {t('searchResults.add')}
          </button>
        </form>
      </div>
    </div>
  )
}