import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PAGE_SIZE } from '../api/listings'
import { useAuth } from '../auth/AuthContext'
import FilterBar from '../components/FilterBar'
import Icon from '../components/Icon'
import ItemGrid from '../components/ItemGrid'
import { SkeletonGrid } from '../components/States'
import { NEARBY_KM, useCommunities } from '../context/CommunityContext'
import { useDataBudget } from '../context/DataBudgetContext'
import { useListings } from '../hooks/useItems'
import { useSmartSearch } from '../hooks/useSmartSearch'
import { filterExchange, readFilters, toListingQuery } from '../lib/filters'
import { timeAgo } from '../lib/geo'
import { REFINE_LIMIT, cleanText, redactPersonal } from '../lib/text'

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
      <FilterBar />

      <div className="section-head">
        <h1 className="results-title" ref={headingRef} tabIndex={-1} aria-live="polite">
          {filters.q ? <>Results for "{filters.q}"</> : 'Everything shared'}
          {listings && <span className="count">{listings.length}{(usingSmart ? meta?.has_more : false) && '+'}</span>}
        </h1>
        {usingSmart && meta?.ai && <span className="hint">AI-assisted, may be wrong</span>}
      </div>

      {usingSmart && (
        <>
          {meta?.mode === 'complex' && meta.state.terms.length > 0 && (
            <div className="interpreted" aria-label="What we searched for">
              <span className="hint">{meta.state.need ? `To ${meta.state.need}, searched for:` : 'Searched for:'}</span>
              {meta.state.terms.map((term) => (
                <span key={term} className="chip chip--removable">
                  {term}
                  <button type="button" aria-label={`Don't search for ${term}`} onClick={() => removeInterpreted(term)}>
                    <Icon name="x" />
                  </button>
                </span>
              ))}
              {excluded.length > 0 && (
                <button type="button" className="link-button" onClick={() => update((next) => next.delete('x'))}>
                  Undo
                </button>
              )}
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
                Searching...
                <button type="button" className="secondary-button" onClick={smart.cancel}>
                  Cancel
                </button>
              </div>
            ) : smart.cancelled ? (
              <p className="notice">
                Search cancelled.{' '}
                <button type="button" className="link-button" onClick={smart.retry}>
                  Try again
                </button>{' '}
                or{' '}
                <button type="button" className="link-button" onClick={() => update((next) => next.set('plain', '1'))}>
                  use plain keyword search
                </button>
                .
              </p>
            ) : meta?.note ? (
              <p className="notice notice--warn">{meta.note}</p>
            ) : meta?.cachedAt ? (
              <p className="hint">Saved {timeAgo(new Date(meta.cachedAt).toISOString())} - you're offline.</p>
            ) : null}
          </div>
        </>
      )}

      {!usingSmart && browse.cachedAt && (
        <p className="notice notice--warn">
          Saved copy from {timeAgo(new Date(browse.cachedAt).toISOString())}. You're offline or the server can't be reached.
        </p>
      )}

      <h2 className="visually-hidden">Listings</h2>
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
                ? 'Nothing matches all of those. Remove a refinement to widen the search.'
                : `Nothing matched "${filters.q}". Try fewer words, or post a "Wanted" listing.`
              : 'Nothing matches these filters yet.'
          }
          onRetry={usingSmart ? smart.retry : browse.reload}
          notes={usingSmart ? notes : undefined}
        />
      )}

      {usingSmart
        ? meta?.has_more && (
            <button type="button" className="secondary-button load-more" disabled={smart.loadingMore} onClick={smart.loadMore}>
              {smart.loadingMore ? 'Loading...' : 'Show more'}
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
              {browse.loading ? 'Loading...' : 'Show more'}
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
        <ol className="refine__trail" aria-label="Search and refinements">
          <li>{query}</li>
          {refinements.map((term) => (
            <li key={term}>
              <span className="chip chip--removable">
                {term}
                <button type="button" aria-label={`Remove ${term}`} onClick={() => onRemove(term)}>
                  <Icon name="x" />
                </button>
              </span>
            </li>
          ))}
          <li>
            <button type="button" className="link-button" onClick={onClear}>
              Clear refinements
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
            Narrow down
          </label>
          <input
            id="refine-input"
            value={draft}
            maxLength={REFINE_LIMIT}
            disabled={full}
            placeholder={full ? 'Enough refinements' : 'Narrow down, e.g. 5'}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button type="submit" className="secondary-button" disabled={full || !draft.trim()}>
            Add
          </button>
        </form>
      </div>
    </div>
  )
}
