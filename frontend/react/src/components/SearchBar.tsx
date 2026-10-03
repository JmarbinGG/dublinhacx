import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { QUERY_LIMIT, cleanText } from '../lib/text'
import { useDataBudget } from '../context/DataBudgetContext'
import Icon from './Icon'

type Props = {
  /** Pre-fill the input. Callers pass key={query} so back/forward re-syncs it. */
  initialQuery?: string
  size?: 'bar' | 'large'
}

/**
 * One search field with a small inline "Ask AI" (on-demand overview, never
 * per keystroke). Submitting keeps the current filters when already on
 * /search.
 */
export default function SearchBar({ initialQuery = '', size = 'bar' }: Props) {
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
    <form
      className={`search search--${size}`}
      role="search"
      onSubmit={(event) => {
        event.preventDefault()
        go(false)
      }}
    >
      <Icon name="search" />
      <input
        type="search"
        value={value}
        maxLength={QUERY_LIMIT}
        onChange={(event) => setValue(event.target.value)}
        placeholder={size === 'large' ? 'Pump set, tailoring, drip pipe...' : 'Search'}
        aria-label="Search listings and people"
        enterKeyHint="search"
      />
      {aiAnswers && (
        <button
          type="button"
          className="search__ai"
          disabled={!value.trim()}
          title="A short AI overview of the best matches (about 2 KB)"
          onClick={() => go(true)}
        >
          Ask AI
        </button>
      )}
      <button type="submit" className="visually-hidden">
        Search
      </button>
    </form>
  )
}
