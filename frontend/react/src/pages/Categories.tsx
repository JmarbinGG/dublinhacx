import { Link } from 'react-router-dom'
import { ErrorState, Loading } from '../components/States'
import { useListingSearch } from '../hooks/useListings'

/**
 * Every distinct category, with a count, each linking to a category-filtered
 * search. Computed client-side from the full listings set - there's no
 * dedicated /api/categories endpoint, and the backend's search already
 * matches on `category`, so this is just a browsable index into it.
 */
export default function Categories() {
  const { data, loading, error } = useListingSearch('')

  if (loading) return <Loading label="Loading categories..." />
  if (error) return <ErrorState message={error} />

  const counts = new Map<string, number>()
  for (const listing of data ?? []) {
    const category = listing.category
    if (typeof category !== 'string' || !category) continue
    counts.set(category, (counts.get(category) ?? 0) + 1)
  }
  const categories = [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]))

  return (
    <section className="categories-page">
      <h1>Categories</h1>

      {categories.length === 0 ? (
        <p className="state">No categories yet.</p>
      ) : (
        <div className="category-grid">
          {categories.map(([category, count]) => (
            <Link
              key={category}
              to={`/search?q=${encodeURIComponent(category)}`}
              className="category-card"
            >
              <span className="category-name">{category}</span>
              <span className="category-count">{count}</span>
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}
