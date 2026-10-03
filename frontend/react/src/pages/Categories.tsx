import { Link } from 'react-router-dom'
import { ErrorState, Loading } from '../components/States'
import { useItems } from '../hooks/useItems'
import { CATEGORIES } from '../types'

/** The fixed category set, with counts, each linking to a filtered feed. */
export default function Categories() {
  const { data, loading, error } = useItems('')

  if (loading) return <Loading label="Loading categories..." />
  if (error) return <ErrorState message={error} />

  const counts = new Map<string, number>()
  for (const item of data ?? []) counts.set(item.category, (counts.get(item.category) ?? 0) + 1)

  return (
    <section className="categories-page">
      <h1>Categories</h1>
      <div className="category-grid">
        {CATEGORIES.map((category) => (
          <Link key={category.id} to={`/search?cat=${category.id}`} className="category-card">
            <span>
              <span className="category-name">{category.label}</span>
              <span className="category-blurb">{category.blurb}</span>
            </span>
            <span className="category-count">{counts.get(category.id) ?? 0}</span>
          </Link>
        ))}
      </div>
    </section>
  )
}
