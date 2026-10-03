import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import CategoryTiles from '../components/CategoryTiles'
import RuralMarketCard from '../components/RuralMarketCard'
import SearchBar from '../components/SearchBar'
import { ErrorState } from '../components/States'
import { useCommunities } from '../context/CommunityContext'
import { useSummary } from '../hooks/useItems'
import { GROUPS } from '../lib/categories'
import { timeAgo } from '../lib/geo'

/** Render children only after the first paint - rows below the fold
 * shouldn't hold up the tiles. */
function AfterFirstPaint({ children, reserve, waiting }: { children: React.ReactNode; reserve: number; waiting: boolean }) {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setTimeout(() => setReady(true), 0))
    return () => cancelAnimationFrame(id)
  }, [])
  // Reserve the space so nothing jumps when the rows arrive.
  return ready && !waiting ? <>{children}</> : <div style={{ minHeight: reserve }} aria-hidden="true" />
}

/**
 * Home: search, four category tiles with counts, then a short "near you"
 * row per category. Everything comes from one summary request (cached, so
 * the tiles still show offline).
 */
export default function Home() {
  const { home, homePoint } = useCommunities()
  const near = homePoint ? { lat: Math.round(homePoint.lat * 100) / 100, lng: Math.round(homePoint.lng * 100) / 100 } : null
  const summary = useSummary(near)

  return (
    <>
      <section className="home-head">
        <h1>What do you need?</h1>
        <SearchBar size="large" />
      </section>

      <CategoryTiles summary={summary.data} />
      {summary.cachedAt && (
        <p className="hint">Counts saved {timeAgo(new Date(summary.cachedAt).toISOString())} - you're offline.</p>
      )}
      {summary.error && !summary.data && <ErrorState message={summary.error} onRetry={summary.reload} />}

      <AfterFirstPaint reserve={900} waiting={summary.loading && !summary.data}>
        {summary.data &&
          GROUPS.map((group) => {
            const row = summary.data![group.id]
            if (!row.items.length) return null
            return (
              <section key={group.id} className="near-row" aria-labelledby={`row-${group.id}`}>
                <div className="section-head">
                  <h2 id={`row-${group.id}`}>
                    {group.label}
                    {home ? ' near you' : ''}
                  </h2>
                  <Link to={`/app/c/${group.id}`}>See all {row.count}</Link>
                </div>
                <div className="row">
                  {row.items.map((listing) => (
                    <RuralMarketCard key={listing.id} listing={listing} hideCategory />
                  ))}
                </div>
              </section>
            )
          })}
      </AfterFirstPaint>

      {!home && (
        <p className="hint">
          Set your town in <Link to="/communities">Towns</Link> to see what's closest first.
        </p>
      )}
    </>
  )
}
