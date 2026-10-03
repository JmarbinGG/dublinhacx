import SearchBar from '../components/SearchBar'
import Stats from '../components/Stats'
import { useListingSearch } from '../hooks/useListings'

/**
 * Landing page: hero search, then marketplace stats. Browsing every listing
 * happens via the Browse button (next to Search), which goes to /search -
 * the home page itself no longer shows a live listings grid.
 */
export default function Home() {
  const { data, loading, error } = useListingSearch('')

  return (
    <>
      <section className="hero">
        <h1>Turning Byproducts Into Opportunities.</h1>
        <p>Search surplus listings from businesses near you and give materials a second life.</p>
        <SearchBar size="large" />
      </section>

      <Stats listings={data} loading={loading} error={error} />
    </>
  )
}
