import { Link } from 'react-router-dom'
import { useCommunities } from '../context/CommunityContext'

/** A small row of numbers about the network of towns. */
export default function Stats() {
  const { communities } = useCommunities()
  if (communities.length === 0) return null

  const listings = communities.reduce((sum, c) => sum + c.listings, 0)
  const members = communities.reduce((sum, c) => sum + c.members, 0)

  return (
    <section className="stats-panel" aria-label="Across the network">
      <h2>Across the network</h2>
      <div className="stat-cards">
        <Link to="/search" className="stat-card">
          <span className="stat-value">{listings}</span>
          <span className="stat-label">Things to share</span>
        </Link>
        <Link to="/communities" className="stat-card">
          <span className="stat-value">{communities.length}</span>
          <span className="stat-label">Towns</span>
        </Link>
        <Link to="/communities" className="stat-card">
          <span className="stat-value">{members}</span>
          <span className="stat-label">Neighbours</span>
        </Link>
      </div>
    </section>
  )
}
