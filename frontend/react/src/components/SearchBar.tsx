import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

type Props = {
  /** Pre-fill the input, e.g. with the query from the URL. */
  initialQuery?: string
  size?: 'large' | 'small'
}

/**
 * Search input + Search (primary) + Browse (secondary), on one line, plus a
 * round "+" that jumps straight to Create Listing. The whole row (pill +
 * circle) is centered together, not just the pill.
 */
export default function SearchBar({ initialQuery = '', size = 'small' }: Props) {
  const [value, setValue] = useState(initialQuery)
  const navigate = useNavigate()

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const query = value.trim()
    navigate(query ? `/search?q=${encodeURIComponent(query)}` : '/search')
  }

  return (
    <div className={`search-bar-row search-bar-row--${size}`}>
      <div className="search-bar">
        <form className="search-bar__form" onSubmit={handleSubmit} role="search">
          <input
            type="search"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="Search listings..."
            aria-label="Search listings"
          />
          <button type="submit" className="primary-button">
            Search
          </button>
        </form>
        <Link to="/search" className="secondary-button">
          Browse
        </Link>
      </div>

      <Link to="/listings/new" className="new-listing-fab" aria-label="Create a listing">
        +
      </Link>
    </div>
  )
}
