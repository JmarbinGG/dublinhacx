import { Link } from 'react-router-dom'
import HomePicker from '../components/HomePicker'
import ItemGrid from '../components/ItemGrid'
import SearchBar from '../components/SearchBar'
import Stats from '../components/Stats'
import { useCommunities } from '../context/CommunityContext'
import { useListings } from '../hooks/useItems'
import { LISTING_TYPES } from '../types'

/**
 * App home: what Banyan is for, your town, search, the three kinds of
 * things people share, then two shelves - what other towns offer and who
 * nearby needs a hand.
 */
export default function Home() {
  const { home, homePoint } = useCommunities()
  const near = homePoint ? { lat: homePoint.lat, lng: homePoint.lng } : {}

  const otherTowns = useListings({ kind: 'offer', exclude_community: home ?? undefined, limit: 6, ...near })
  const wanted = useListings({ kind: 'request', limit: 3, ...near })

  return (
    <>
      <section className="hero">
        <h1>Share what you have. Find what you need.</h1>
        <p>
          Spare materials, idle equipment, and the skills to get a job done - shared between
          neighbours and the towns around you.
        </p>
        <div className="hero__home">
          <HomePicker />
        </div>
        <SearchBar size="large" />
      </section>

      <section className="type-tiles" aria-label="Browse by type">
        {LISTING_TYPES.map((type) => (
          <Link key={type.id} to={`/search?type=${type.id}`} className={`type-tile type-tile--${type.id}`}>
            <span className="type-tile__label">{type.label}</span>
            <span className="type-tile__blurb">{type.blurb}</span>
          </Link>
        ))}
      </section>

      <section>
        <div className="section-heading">
          <h2>{home ? <>From towns beyond {home}</> : 'Offered across the network'}</h2>
          <Link to={home ? '/search?scope=others&kind=offer' : '/search?kind=offer'}>See all &rarr;</Link>
        </div>
        <ItemGrid
          listings={otherTowns.data}
          loading={otherTowns.loading}
          error={otherTowns.error}
          emptyMessage="Nothing offered yet."
          onRetry={otherTowns.reload}
        />
      </section>

      <section>
        <div className="section-heading">
          <h2>Someone needs a hand</h2>
          <Link to="/search?kind=request">All requests &rarr;</Link>
        </div>
        <ItemGrid
          listings={wanted.data}
          loading={wanted.loading}
          error={wanted.error}
          emptyMessage="No open requests right now."
          onRetry={wanted.reload}
        />
      </section>

      <Stats />
    </>
  )
}
