import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { QUERY_LIMIT, cleanText } from '../api/ai'
import { useDataBudget } from '../context/DataBudgetContext'

type Props = {
  /** Pre-fill the input, e.g. with the query from the URL. */
  initialQuery?: string
  size?: 'large' | 'small'
}

/**
 * Search input + Search, an on-demand "Ask AI" overview, Browse, and a round
 * "+" to share something. Submitting keeps the current filters when already
 * on /search. Callers pass key={query} so back/forward re-syncs the box.
 */
export default function SearchBar({ initialQuery = '', size = 'small' }: Props) {
  const [value, setValue] = useState(initialQuery)
  const navigate = useNavigate()
  const location = useLocation()
  const { aiAnswers } = useDataBudget()

  function go(ai: boolean) {
    const query = cleanText(value, QUERY_LIMIT)
    const params = new URLSearchParams(location.pathname === '/search' ? location.search : '')
    if (query) params.set('q', query)
    else params.delete('q')
    if (ai && query) params.set('ai', '1')
    else params.delete('ai')
    params.delete('page')
    const search = params.toString()
    navigate(search ? `/search?${search}` : '/search')
  }

  return (
    <div className={`search-bar-row search-bar-row--${size}`}>
      <div className="search-bar">
        <form
          className="search-bar__form"
          role="search"
          onSubmit={(event) => {
            event.preventDefault()
            go(false)
          }}
        >
          <input
            type="search"
            value={value}
            maxLength={QUERY_LIMIT}
            onChange={(event) => setValue(event.target.value)}
            placeholder="Pump set, tailoring, drip pipe..."
            aria-label="Search listings and people"
          />
          <button type="submit" className="primary-button">
            Search
          </button>
        </form>
        {aiAnswers && (
          <button
            type="button"
            className="secondary-button search-bar__ai"
            disabled={!value.trim()}
            title="Get a short AI overview of the best matches"
            onClick={() => go(true)}
          >
            Ask AI
          </button>
        )}
        <Link to="/search" className="secondary-button">
          Browse
        </Link>
      </div>

      <Link to="/listings/new" className="new-listing-fab" aria-label="Share something">
        +
      </Link>
    </div>
  )
}
