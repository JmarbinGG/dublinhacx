import { useSearchParams } from 'react-router-dom'
import { useCommunities } from '../context/CommunityContext'
import { DISTANCE_BANDS, SORTS, readFilters } from '../lib/filters'
import { CATEGORIES } from '../types'
import HomePicker from './HomePicker'

/** Distance band chips, a Specialized Trade toggle, category and sort.
 * All state lives in the URL's query params. */
export default function FilterBar() {
  const [params, setParams] = useSearchParams()
  const filters = readFilters(params)
  const { home } = useCommunities()

  function set(key: string, value: string | null) {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  return (
    <div className="filter-bar">
      <div className="filter-bar__row">
        <HomePicker id="filter-home" />
        <label className="filter-select">
          <span>Category</span>
          <select value={filters.category} onChange={(event) => set('cat', event.target.value)}>
            <option value="">All categories</option>
            {CATEGORIES.map((category) => (
              <option key={category.id} value={category.id}>
                {category.label}
              </option>
            ))}
          </select>
        </label>
        <label className="filter-select">
          <span>Sort</span>
          <select
            value={filters.sort}
            onChange={(event) => set('sort', event.target.value === 'nearest' ? null : event.target.value)}
          >
            {SORTS.map((sort) => (
              <option key={sort.id} value={sort.id}>
                {sort.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="chips" role="group" aria-label="Distance">
        {DISTANCE_BANDS.map((band) => (
          <button
            key={band.id}
            type="button"
            className={`chip${filters.band === band.id ? ' chip--active' : ''}`}
            aria-pressed={filters.band === band.id}
            disabled={!home && band.id !== 'all'}
            onClick={() => set('band', band.id === 'all' ? null : band.id)}
          >
            {band.label}
          </button>
        ))}
        <button
          type="button"
          className={`chip chip--special${filters.specialized ? ' chip--active' : ''}`}
          aria-pressed={filters.specialized}
          onClick={() => set('special', filters.specialized ? null : '1')}
        >
          Specialized trade
        </button>
      </div>
      {!home && <p className="filter-bar__hint">Pick your community to filter by distance.</p>}
    </div>
  )
}
