import { useSearchParams } from 'react-router-dom'
import { useCommunities } from '../context/CommunityContext'
import { SCOPES, SORTS, readFilters } from '../lib/filters'
import { EXCHANGES, LISTING_TYPES } from '../types'
import HomePicker from './HomePicker'

/** Type, offer/wanted, exchange, town scope and sort. All state lives in the
 * URL's query params, so changing a filter refetches and can be shared. */
export default function FilterBar() {
  const [params, setParams] = useSearchParams()
  const filters = readFilters(params)
  const { home, homePoint } = useCommunities()

  function set(key: string, value: string | null) {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    next.delete('page')
    setParams(next, { replace: true })
  }

  return (
    <div className="filter-bar">
      <div className="chips" role="group" aria-label="Type">
        <button
          type="button"
          className={`chip${!filters.type ? ' chip--active' : ''}`}
          aria-pressed={!filters.type}
          onClick={() => set('type', null)}
        >
          Everything
        </button>
        {LISTING_TYPES.map((type) => (
          <button
            key={type.id}
            type="button"
            className={`chip${filters.type === type.id ? ' chip--active' : ''}`}
            aria-pressed={filters.type === type.id}
            onClick={() => set('type', type.id)}
          >
            {type.label}
          </button>
        ))}
      </div>

      <div className="filter-bar__row">
        <HomePicker id="filter-home" />
        <label className="filter-select">
          <span>Offers or wanted</span>
          <select value={filters.kind} onChange={(event) => set('kind', event.target.value)}>
            <option value="">Both</option>
            <option value="offer">Offers</option>
            <option value="request">Wanted / jobs</option>
          </select>
        </label>
        <label className="filter-select">
          <span>Exchange</span>
          <select value={filters.exchange} onChange={(event) => set('ex', event.target.value)}>
            <option value="">Any</option>
            {EXCHANGES.map((exchange) => (
              <option key={exchange.id} value={exchange.id}>
                {exchange.label}
              </option>
            ))}
          </select>
        </label>
        <label className="filter-select">
          <span>Sort</span>
          <select
            value={filters.sort}
            disabled={!homePoint}
            onChange={(event) => set('sort', event.target.value === 'newest' ? null : event.target.value)}
          >
            {SORTS.map((sort) => (
              <option key={sort.id} value={sort.id}>
                {sort.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="chips" role="group" aria-label="Where">
        {SCOPES.map((scope) => (
          <button
            key={scope.id}
            type="button"
            className={`chip chip--scope${filters.scope === scope.id ? ' chip--active' : ''}`}
            aria-pressed={filters.scope === scope.id}
            disabled={scope.id !== 'all' && !home}
            onClick={() => set('scope', scope.id === 'all' ? null : scope.id)}
          >
            {scope.label}
          </button>
        ))}
      </div>
      {!home && <p className="filter-bar__hint">Choose your town to see nearby and other-town listings.</p>}
    </div>
  )
}
