import { Link } from 'react-router-dom'
import { NEARBY_MILES, useCommunities } from '../context/CommunityContext'
import { SPECIALIZED_CATEGORIES, type Item } from '../types'

/** A small row of numbers about the marketplace, relative to your community. */
export default function Stats({ items }: { items: Item[] }) {
  const { communities, home, distanceTo } = useCommunities()

  const beyondNearby = items.filter((item) => (distanceTo(item.community_id) ?? 0) > NEARBY_MILES)
  const specializedBeyond = beyondNearby.filter((item) =>
    SPECIALIZED_CATEGORIES.includes(item.category),
  ).length

  return (
    <section className="stats-panel">
      <h2>Across the region</h2>
      <div className="stat-cards">
        <Link to="/search" className="stat-card">
          <span className="stat-value">{items.length}</span>
          <span className="stat-label">Listings</span>
        </Link>
        <Link to="/search" className="stat-card">
          <span className="stat-value">{communities.length}</span>
          <span className="stat-label">Communities</span>
        </Link>
        {home && (
          <Link to="/search?band=beyond5&special=1" className="stat-card">
            <span className="stat-value">{specializedBeyond}</span>
            <span className="stat-label">Specialized finds beyond {NEARBY_MILES} mi</span>
          </Link>
        )}
      </div>
    </section>
  )
}
