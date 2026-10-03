import { Link } from 'react-router-dom'
import { ErrorState, Loading } from './States'
import type { Listing } from '../types'

type Props = {
  listings: Listing[] | null
  loading: boolean
  error: string | null
}

/**
 * Small aggregate numbers computed from the full listings set - replaces the
 * home page's old always-visible listings grid (browsing now happens via the
 * Browse button, at /search).
 */
export default function Stats({ listings, loading, error }: Props) {
  if (loading) return <Loading label="Loading stats..." />
  if (error) return <ErrorState message={error} />

  const rows = listings ?? []
  const available = rows.filter((row) => row.status === 'available').length
  const categories = new Set(rows.map((row) => row.category).filter(Boolean)).size

  return (
    <section className="stats-panel">
      <h2>Marketplace Stats</h2>
      {/* Total/Available link to /search; Categories has its own page now
          since "explore this number further" means different places. */}
      <div className="stat-cards">
        <Link to="/search" className="stat-card">
          <span className="stat-value">{rows.length}</span>
          <span className="stat-label">Total listings</span>
        </Link>
        <Link to="/search" className="stat-card">
          <span className="stat-value">{available}</span>
          <span className="stat-label">Available now</span>
        </Link>
        <Link to="/categories" className="stat-card">
          <span className="stat-value">{categories}</span>
          <span className="stat-label">Categories</span>
        </Link>
      </div>
    </section>
  )
}
