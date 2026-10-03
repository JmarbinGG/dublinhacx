import { Link } from 'react-router-dom'
import HomePicker from '../components/HomePicker'
import RuralMarketCard from '../components/RuralMarketCard'
import SearchBar from '../components/SearchBar'
import Stats from '../components/Stats'
import { ErrorState, Loading } from '../components/States'
import { NEARBY_MILES, useCommunities } from '../context/CommunityContext'
import { useItems } from '../hooks/useItems'
import { applyFilters } from '../lib/filters'

/**
 * App home: why the marketplace exists, your community, search, and a
 * "worth the drive" shelf - specialized listings from beyond walking distance.
 */
export default function Home() {
  const { data, loading, error } = useItems('')
  const { home, distanceTo } = useCommunities()

  const worthTheDrive = applyFilters(
    data ?? [],
    { band: home ? 'beyond5' : 'all', category: '', specialized: true, sort: 'nearest' },
    distanceTo,
  ).slice(0, 6)

  return (
    <>
      <section className="hero">
        <h1>Find what your neighbors don't have.</h1>
        <p>
          Heirloom seed, heavy equipment, craft skills and bulk trade from communities a short
          drive away - worth the trip when it's something you can't get next door.
        </p>
        <div className="hero__home">
          <HomePicker />
        </div>
        <SearchBar size="large" />
      </section>

      <section>
        <div className="section-heading">
          <h2>Worth the drive{home && <span> · beyond {NEARBY_MILES} miles</span>}</h2>
          <Link to={home ? '/search?band=beyond5&special=1' : '/search?special=1'}>
            See all specialized trade &rarr;
          </Link>
        </div>
        {loading && <Loading label="Loading listings..." />}
        {error && <ErrorState message={error} onRetry={() => window.location.reload()} />}
        {!loading && !error && (
          <div className="grid">
            {worthTheDrive.map((item) => (
              <RuralMarketCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </section>

      {data && <Stats items={data} />}
    </>
  )
}
