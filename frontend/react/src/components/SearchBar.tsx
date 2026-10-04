import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { QUERY_LIMIT, cleanQuery } from '../lib/text'
import { cancelSearch, useSearchBusy } from '../lib/searchActivity'
import { noteSubmit } from '../lib/searchSession'
import MorphIcon from './MorphIcon'
import { t } from '../i18n'

type Props = {
  /** Pre-fill the input. Callers pass key={query} so back/forward re-syncs it. */
  initialQuery?: string
  size?: 'bar' | 'large'
}

/**
 * The one search field - everything is natural language. The server
 * decides whether a query is simple ("screws") or needs the AI ("things I
 * can use to cut down a tree"), and whether text typed while looking at
 * results ("only free ones") is a new search or narrows the last one.
 */
export default function SearchBar({ initialQuery = '', size = 'bar' }: Props) {
  const [value, setValue] = useState(initialQuery)
  const navigate = useNavigate()
  const location = useLocation()
  const busy = useSearchBusy()

  function go() {
    const query = cleanQuery(value)
    const onResults = location.pathname === '/search'
    const params = new URLSearchParams(onResults ? location.search : '')
    const previous = params.get('q')
    // Typed while looking at results: a follow-up, carried with the last
    // result's state. From anywhere else: a fresh search.
    if (query) noteSubmit(query, onResults && !!previous && previous !== query)
    if (query) params.set('q', query)
    else params.delete('q')
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
        aria-label={busy ? t('search.cancel') : undefined}
      >
        <MorphIcon name="searchCancel" on={busy} />
      </button>
      <input
        type="search"
        value={value}
        maxLength={QUERY_LIMIT}
        onChange={(event) => setValue(event.target.value)}
        placeholder={size === 'large' ? t('search.placeholderLarge') : t('search.placeholder')}
        aria-label={t('search.label')}
        enterKeyHint="search"
      />
      <button type="submit" className="visually-hidden">
        {t('search.submit')}
      </button>
    </form>
  )
}