import { Link } from 'react-router-dom'
import ItemGrid from '../components/ItemGrid'
import SearchBar from '../components/SearchBar'
import { useCommunities } from '../context/CommunityContext'
import { useListings } from '../hooks/useItems'
import { LISTING_TYPES } from '../types'

/** Home: the search box, one row of type chips, and what's nearest. */
export default function Home() {
  const { home, homePoint } = useCommunities()
  const near = homePoint ? { lat: homePoint.lat, lng: homePoint.lng } : {}
  const latest = useListings({ limit: 12, ...near })

  return (
    <>
      <section className="home-head">
        <h1>What do you need?</h1>
        <SearchBar size="large" />
        <nav className="chip-row" aria-label="Browse by type">
          {LISTING_TYPES.map((type) => (
            <Link key={type.id} to={`/search?type=${type.id}`} className="chip">
              {type.label}
            </Link>
          ))}
          <Link to="/search?kind=request" className="chip">
            Wanted
          </Link>
        </nav>
      </section>

      <section aria-labelledby="home-grid">
        <div className="section-head">
          <h2 id="home-grid">{home ? `Nearest to ${home}` : 'Newest'}</h2>
          <Link to="/search">See everything</Link>
        </div>
        <ItemGrid
          listings={latest.data}
          loading={latest.loading}
          error={latest.error}
          emptyMessage="Nothing shared yet - be the first."
          onRetry={latest.reload}
        />
        {!home && (
          <p className="hint">
            Set your town in <Link to="/communities">Towns</Link> to see what's closest first.
          </p>
        )}
      </section>
    </>
  )
}
