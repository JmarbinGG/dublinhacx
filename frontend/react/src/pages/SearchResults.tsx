import { useSearchParams } from 'react-router-dom'
import FilterBar from '../components/FilterBar'
import ItemGrid from '../components/ItemGrid'
import SearchBar from '../components/SearchBar'
import { useCommunities } from '../context/CommunityContext'
import { useItems } from '../hooks/useItems'
import { applyFilters, readFilters } from '../lib/filters'

/** /search?q=&band=&cat=&special=&sort= - the browsable, filterable feed. */
export default function SearchResults() {
  const [searchParams] = useSearchParams()
  const query = searchParams.get('q') ?? ''
  const { data, loading, error, cachedAt } = useItems(query)
  const { distanceTo } = useCommunities()

  const items = data ? applyFilters(data, readFilters(searchParams), distanceTo) : null

  return (
    <section className="feed">
      <SearchBar initialQuery={query} />
      <FilterBar />

      <h2 className="results-heading">
        {query ? <>Results for "{query}"</> : 'All listings'}
        {items && <span className="count">{items.length}</span>}
      </h2>
      {cachedAt && (
        <p className="cached-note">
          Saved copy from {new Date(cachedAt).toLocaleString()} - you're offline or the server is
          unreachable.
        </p>
      )}

      <ItemGrid
        items={items}
        loading={loading}
        error={error}
        emptyMessage={
          query
            ? `No listings matched "${query}" with these filters.`
            : 'No listings match these filters.'
        }
        onRetry={() => window.location.reload()}
      />
    </section>
  )
}
