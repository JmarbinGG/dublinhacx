import { useSearchParams } from 'react-router-dom'
import SearchBar from '../components/SearchBar'
import ListingGrid from '../components/ListingGrid'
import { useListingSearch } from '../hooks/useListings'

/** /search?q=... - results for the query in the URL. */
export default function SearchResults() {
  const [searchParams] = useSearchParams()
  const query = searchParams.get('q') ?? ''
  const { data, loading, error } = useListingSearch(query)

  return (
    <section>
      <SearchBar initialQuery={query} />

      <h2 className="results-heading">
        {query ? <>Results for "{query}"</> : 'All listings'}
        {!loading && !error && data && <span className="count">{data.length}</span>}
      </h2>

      <ListingGrid
        listings={data}
        loading={loading}
        error={error}
        emptyMessage={
          query
            ? `No listings matched "${query}". Try a different search.`
            : 'No listings yet.'
        }
        onRetry={() => window.location.reload()}
      />
    </section>
  )
}
