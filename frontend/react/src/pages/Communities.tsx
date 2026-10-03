import { Link } from 'react-router-dom'
import HomePicker from '../components/HomePicker'
import Stats from '../components/Stats'
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
    <section className="stack">
      <h1>Towns</h1>
      <Stats />
      <HomePicker id="towns-home" />
      <ul className="town-list">
        {rows.map((c) => (
          <li key={c.name}>
            <Link to={`/communities/${encodeURIComponent(c.name)}`} className="town">
              <span className="town__name">
                {c.name}
                {c.name === home && <span className="tag">Your town</span>}
              </span>
              <span className="town__meta">
                {c.listings} open · {c.members} {c.members === 1 ? 'neighbour' : 'neighbours'}
                {c.km != null && ` · ${Math.round(c.km)} km`}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
