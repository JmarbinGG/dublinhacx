import { Link } from 'react-router-dom'
import { Loading } from '../components/States'
import { useCommunities } from '../context/CommunityContext'
import { distanceKm } from '../lib/geo'

/** /communities - every town on Banyan, with members and open listings. */
export default function Communities() {
  const { communities, loading, home, homePoint, pointOf } = useCommunities()

  if (loading && communities.length === 0) return <Loading label="Loading towns..." />

  const rows = communities.map((c) => {
    const point = pointOf(c.name)
    return { ...c, km: homePoint && point && c.name !== home ? distanceKm(homePoint, point) : null }
  })

  return (
    <section className="categories-page">
      <h1>Towns</h1>
      <p className="page-intro">
        Like a banyan's roots growing into new trunks, every town here is its own centre - and all of them are
        connected.
      </p>
      <div className="category-grid">
        {rows.map((c) => (
          <Link key={c.name} to={`/communities/${encodeURIComponent(c.name)}`} className="category-card">
            <span>
              <span className="category-name">
                {c.name}
                {c.name === home && <span className="badge">Your town</span>}
              </span>
              <span className="category-blurb">
                {c.members} {c.members === 1 ? 'neighbour' : 'neighbours'}
                {c.km != null && ` · ${Math.round(c.km)} km away`}
              </span>
            </span>
            <span className="category-count" title="Open listings">
              {c.listings}
            </span>
          </Link>
        ))}
      </div>
    </section>
  )
}
