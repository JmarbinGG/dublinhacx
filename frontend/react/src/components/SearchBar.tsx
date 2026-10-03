import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { QUERY_LIMIT, cleanQuery } from '../lib/text'
import { cancelSearch, useSearchBusy } from '../lib/searchActivity'
import MorphIcon from './MorphIcon'

type Props = {
  /** Pre-fill the input. Callers pass key={query} so back/forward re-syncs it. */
  initialQuery?: string
  size?: 'bar' | 'large'
}

/**
 * The one search field. The server decides whether a query is simple
 * ("screws") or needs the AI ("things I can use to cut down a tree") - the
 * client just sends it. Submitting keeps the current filters on /search.
 */
export default function SearchBar({ initialQuery = '', size = 'bar' }: Props) {
  const [value, setValue] = useState(initialQuery)
  const navigate = useNavigate()
  const location = useLocation()
  const busy = useSearchBusy()

  function go() {
    const query = cleanQuery(value)
    const params = new URLSearchParams(location.pathname === '/search' ? location.search : '')
    if (query) params.set('q', query)
    else params.delete('q')
    // A new query starts fresh: no refinements, excluded terms or paging.
    params.delete('r')
    params.delete('x')
    params.delete('page')
    const search = params.toString()
    navigate(search ? `/search?${search}` : '/search')
  }

  return (
    <form
      className={`search search--${size}`}
      role="search"
      onSubmit={(event) => {
        event.preventDefault()
        go()
      }}
    >
      {/* Search icon morphs into Cancel while a search request runs. */}
      {/* One element either way, so the icon can morph rather than swap. */}
      <button
        type="button"
        className="search__lead"
        onClick={busy ? cancelSearch : undefined}
        tabIndex={busy ? 0 : -1}
        aria-hidden={!busy}
        aria-label={busy ? 'Cancel search' : undefined}
      >
        <MorphIcon name="searchCancel" on={busy} />
      </button>
      <input
        type="search"
        value={value}
        maxLength={QUERY_LIMIT}
        onChange={(event) => setValue(event.target.value)}
        placeholder={size === 'large' ? 'Pump set, tailoring, drip pipe...' : 'Search'}
        aria-label="Search listings and people"
        enterKeyHint="search"
      />
      <button type="submit" className="visually-hidden">
        Search
      </button>
    </form>
  )
}
